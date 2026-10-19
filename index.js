const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "payment-data");
const RECEIPTS_DIR = path.join(DATA_DIR, "receipts");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const REFUNDS_FILE = path.join(DATA_DIR, "refunds.json");

const PORT = Number(process.env.PORT || 3000);

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "CleanFlowDemo2026!";

const MAX_REQUEST_SIZE = 6 * 1024 * 1024;
const MAX_RECEIPT_SIZE = 4 * 1024 * 1024;
const SESSION_DURATION = 8 * 60 * 60 * 1000;

const SERVICE_PRICES = {
  "Basic Testing": 500,
  "Complete Analysis": 1500,
  "Water Quality Monitoring": 2500
};

const SERVICES = Object.keys(SERVICE_PRICES);

const METHODS = [
  "GCash",
  "Online Bank Transfer",
  "Credit Card",
  "Debit Card"
];

const RECEIPT_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

const sessions = new Map();

async function ensureJsonFile(file) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "[]", "utf8");
  }
}

async function initializeStorage() {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  await ensureJsonFile(ORDERS_FILE);
  await ensureJsonFile(REFUNDS_FILE);
}

async function readRecords(file) {
  await ensureJsonFile(file);
  const records = JSON.parse(await fs.readFile(file, "utf8"));
  if (!Array.isArray(records)) {
    throw new Error("Invalid data file: " + path.basename(file));
  }
  return records;
}

async function saveRecords(file, records) {
  const temporaryFile = file + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temporaryFile, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temporaryFile, file);
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = "";
    }
  }
  return cookies;
}

function getSession(req) {
  const token = parseCookies(req).cleanflow_admin;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_DURATION;
  return { token, session };
}

function requireAdmin(req, res) {
  if (!getSession(req)) {
    sendJson(res, 401, {
      error: "Administrator login required. Please log in again."
    });
    return false;
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let finished = false;

    req.on("data", chunk => {
      if (finished) return;
      totalSize += chunk.length;
      if (totalSize > MAX_REQUEST_SIZE) {
        finished = true;
        reject(new Error("Request too large. Please use a smaller receipt."));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (finished) return;
      try {
        const content = Buffer.concat(chunks).toString("utf8");
        const data = JSON.parse(content || "{}");
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Invalid request data.");
        }
        resolve(data);
      } catch {
        reject(new Error("Invalid request data."));
      }
    });

    req.on("error", error => {
      if (!finished) reject(error);
    });
  });
}

async function saveReceipt(receipt) {
  if (!receipt) return null;
  if (typeof receipt.dataUrl !== "string") {
    throw new Error("Invalid receipt upload.");
  }

  const match = receipt.dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/
  );

  if (!match) {
    throw new Error("Receipt must be JPG, PNG, WEBP, or PDF.");
  }

  const contentType = match[1];
  const base64 = match[2];
  const fileContents = Buffer.from(base64, "base64");

  if (fileContents.length === 0 || fileContents.length > MAX_RECEIPT_SIZE) {
    throw new Error("Receipt must be smaller than 4 MB.");
  }

  const filename = crypto.randomUUID() + RECEIPT_TYPES[contentType];
  await fs.writeFile(path.join(RECEIPTS_DIR, filename), fileContents, {
    flag: "wx",
    mode: 0o600
  });

  return {
    filename,
    originalName: cleanText(receipt.name, 150),
    contentType,
    size: fileContents.length
  };
}

function orderForAdmin(order) {
  return {
    ...order,
    receipt: order.receipt
      ? {
          ...order.receipt,
          url: "/api/admin/receipts/" + encodeURIComponent(order.receipt.filename)
        }
      : null,
    receiptUrl: order.receipt
      ? "/api/admin/receipts/" + encodeURIComponent(order.receipt.filename)
      : null
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let route;
    try {
      route = decodeURIComponent(url.pathname);
    } catch {
      return sendJson(res, 400, { error: "Invalid URL." });
    }

    if (req.method === "GET" && route === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "CleanFlow demo server",
        demoMode: true
      });
    }

    if (req.method === "POST" && route === "/api/admin/login") {
      const body = await readJsonBody(req);
      const password = typeof body.password === "string" ? body.password : "";
      const supplied = Buffer.from(password, "utf8");
      const expected = Buffer.from(ADMIN_PASSWORD, "utf8");

      const passwordMatches =
        supplied.length === expected.length &&
        crypto.timingSafeEqual(supplied, expected);

      if (!passwordMatches) {
        return sendJson(res, 401, { error: "Incorrect administrator password." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION });

      return sendJson(
        res,
        200,
        { ok: true, message: "Admin login successful." },
        {
          "Set-Cookie":
            "cleanflow_admin=" + token +
            "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" +
            Math.floor(SESSION_DURATION / 1000)
        }
      );
    }

    if (req.method === "GET" && route === "/api/admin/session") {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { ok: true, authenticated: true });
    }

    if (req.method === "POST" && route === "/api/admin/logout") {
      const token = parseCookies(req).cleanflow_admin;
      if (token) sessions.delete(token);
      return sendJson(
        res,
        200,
        { ok: true, message: "Logged out successfully." },
        {
          "Set-Cookie": "cleanflow_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        }
      );
    }

    if (req.method === "GET" && route === "/api/admin/orders") {
      if (!requireAdmin(req, res)) return;
      const orders = await readRecords(ORDERS_FILE);
      return sendJson(res, 200, {
        orders: orders.slice().reverse().map(orderForAdmin)
      });
    }

    if (req.method === "GET" && route === "/api/admin/refunds") {
      if (!requireAdmin(req, res)) return;
      const refunds = await readRecords(REFUNDS_FILE);
      return sendJson(res, 200, {
        refunds: refunds.slice().reverse()
      });
    }

    const receiptMatch = route.match(
      /^\/api\/admin\/receipts\/([a-f0-9-]+\.(?:jpg|png|webp|pdf))$/i
    );

    if (req.method === "GET" && receiptMatch) {
      if (!requireAdmin(req, res)) return;
      const filename = receiptMatch[1];
      const receiptPath = path.join(RECEIPTS_DIR, filename);
      const contents = await fs.readFile(receiptPath);
      const extension = path.extname(filename).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      return res.end(contents);
    }

    const orderStatusMatch = route.match(
      /^\/api\/admin\/orders\/([a-f0-9-]+)\/status$/i
    );

    if (req.method === "POST" && orderStatusMatch) {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const status = cleanText(body.status, 50);
      const orders = await readRecords(ORDERS_FILE);
      const order = orders.find(item => item.id === orderStatusMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Order not found." });

      order.status = status;
      order.updatedAt = new Date().toISOString();
      await saveRecords(ORDERS_FILE, orders);

      return sendJson(res, 200, {
        ok: true,
        orderId: order.id,
        status: order.status
      });
    }

    const refundStatusMatch = route.match(
      /^\/api\/admin\/refunds\/([a-f0-9-]+)\/status$/i
    );

    if (req.method === "POST" && refundStatusMatch) {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const status = cleanText(body.status, 50);
      const refunds = await readRecords(REFUNDS_FILE);
      const refund = refunds.find(item => item.id === refundStatusMatch[1]);
      if (!refund) return sendJson(res, 404, { error: "Refund not found." });

      refund.status = status;
      refund.updatedAt = new Date().toISOString();
      await saveRecords(REFUNDS_FILE, refunds);

      return sendJson(res, 200, {
        ok: true,
        refundId: refund.id,
        status: refund.status
      });
    }

    // ---------------- CREATE AN ORDER ----------------

    if (req.method === "POST" && route === "/api/orders") {
      const body = await readJsonBody(req);

      const customerName = cleanText(body.customerName, 100);
      const customerEmail = cleanText(body.customerEmail, 160);
      const company = cleanText(body.company, 160);
      const service = cleanText(body.service, 80);
      const paymentMethod = cleanText(body.paymentMethod, 40);
      const detailedPaymentMethod = cleanText(body.detailedPaymentMethod || paymentMethod, 120);
      const paymentReference = cleanText(body.paymentReference, 100);
      const invoiceNo = cleanText(body.invoiceNo, 60);
      const notes = cleanText(body.notes, 1000);

      if (!customerName || !customerEmail || !service || !paymentMethod) {
        return sendJson(res, 400, {
          error: "Please complete your name, email, service, and payment method."
        });
      }

      if (!validEmail(customerEmail)) {
        return sendJson(res, 400, { error: "Please enter a valid email address." });
      }

      if (!SERVICES.includes(service)) {
        return sendJson(res, 400, { error: "Please select a valid service." });
      }

      if (!METHODS.includes(paymentMethod)) {
        return sendJson(res, 400, { error: "Please select a valid payment method." });
      }

      const amount = SERVICE_PRICES[service] || 1500;
      const instantApproved = body.demoCardApproved === true;
      let receipt = null;

      if (body.receipt) {
        receipt = await saveReceipt(body.receipt);
      } else if (!instantApproved) {
        return sendJson(res, 400, { error: "Please upload your payment receipt." });
      }

      const order = {
        id: crypto.randomUUID(),
        invoiceNo: invoiceNo || "CF-INV-2026",
        customerName,
        customerEmail,
        company,
        service,
        amount,
        paymentMethod: detailedPaymentMethod,
        paymentReference: paymentReference || null,
        receipt,
        notes,
        status: instantApproved ? "Payment Approved" : "Pending Verification",
        paymentStatus: instantApproved
          ? "Transaction Approved & Paid"
          : "Awaiting Manual Verification",
        demo: true,
        createdAt: new Date().toISOString()
      };

      const orders = await readRecords(ORDERS_FILE);
      orders.push(order);
      await saveRecords(ORDERS_FILE, orders);

      return sendJson(res, 201, {
        orderId: order.id,
        invoiceNo: order.invoiceNo,
        amount: order.amount,
        status: order.status,
        paymentStatus: order.paymentStatus,
        demo: true
      });
    }

    // ---------------- SUBMIT A REFUND / CANCELLATION (3-DAY 10% DEDUCTION) ----------------

    if (req.method === "POST" && route === "/api/refunds") {
      const body = await readJsonBody(req);

      const orderId = cleanText(body.orderId, 80);
      const customerEmail = cleanText(body.customerEmail, 160);
      const reason = cleanText(body.reason, 1000);
      const refundInvoiceNo = cleanText(body.refundInvoiceNo, 80);

      if (!orderId || !customerEmail || !reason) {
        return sendJson(res, 400, {
          error: "Please provide your order ID, email, and refund reason."
        });
      }

      const orders = await readRecords(ORDERS_FILE);
      const order = orders.find(
        item =>
          item.id === orderId &&
          item.customerEmail.toLowerCase() === customerEmail.toLowerCase()
      );

      const totalBill = order
        ? Number(order.amount || SERVICE_PRICES[order.service] || 1500)
        : Number(body.totalBill || 1500);
      const deductionFee = +(totalBill * 0.10).toFixed(2);
      const netRefund = +(totalBill - deductionFee).toFixed(2);

      if (order) {
        order.status = "Payment Rejected";
        order.paymentStatus = `Cancelled Within 3 Days — 10% Fee Deducted (-₱${deductionFee.toFixed(2)})`;
        await saveRecords(ORDERS_FILE, orders);
      }

      const refunds = await readRecords(REFUNDS_FILE);
      const refund = {
        id: refundInvoiceNo || crypto.randomUUID(),
        orderId,
        customerName: order ? order.customerName : "Customer",
        customerEmail,
        service: order ? order.service : "CleanFlow Service",
        totalBill,
        deductionFee,
        netRefund,
        paymentMethod: order ? order.paymentMethod : "Online Payment",
        reason,
        status: "Refund Approved",
        createdAt: new Date().toISOString()
      };

      refunds.push(refund);
      await saveRecords(REFUNDS_FILE, refunds);

      return sendJson(res, 201, {
        refundId: refund.id,
        status: refund.status,
        totalBill,
        deductionFee,
        netRefund,
        demo: true
      });
    }

    if (req.method === "GET") {
      const requestedPath = route === "/" ? "/index.html" : route;
      const filePath = path.resolve(ROOT, "." + requestedPath);

      if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, "index.html")) {
        return sendJson(res, 403, { error: "Access denied." });
      }

      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) throw new Error("Not a file.");
        const contents = await fs.readFile(filePath);
        const extension = path.extname(filePath).toLowerCase();

        res.writeHead(200, {
          "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
          "Cache-Control": "no-store"
        });
        return res.end(contents);
      } catch {
        return sendJson(res, 404, { error: "File not found." });
      }
    }

    return sendJson(res, 404, { error: "Route not found." });
  } catch (error) {
    if (!res.headersSent && !res.destroyed) {
      return sendJson(res, 400, { error: error.message || "The request failed." });
    }
  }
});

initializeStorage().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log("CleanFlow server running on port " + PORT);
  });
});
