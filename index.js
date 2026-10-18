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

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = "cleanflowengineer@gmail.com";

// Send an email through Resend.
// Email failures are logged but won't undo a saved order or refund.
async function sendResendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.error("Email not sent: RESEND_API_KEY is missing.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "CleanFlow Engineering <onboarding@resend.dev>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend email error:", response.status, result);
      return false;
    }

    console.log("Resend email accepted:", result.id);
    return true;
  } catch (error) {
    console.error("Resend request failed:", error.message);
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

const MAX_REQUEST_SIZE = 6 * 1024 * 1024;
const MAX_RECEIPT_SIZE = 4 * 1024 * 1024;

const SERVICES = [
  "Basic Testing",
  "Complete Analysis",
  "Water Quality Monitoring"
];

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
  ".ico": "image/x-icon"
};

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
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function saveRecords(file, records) {
  const temporaryFile = file + ".tmp";
  await fs.writeFile(
    temporaryFile,
    JSON.stringify(records, null, 2),
    "utf8"
  );
  await fs.rename(temporaryFile, file);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let totalSize = 0;

    req.on("data", chunk => {
      totalSize += chunk.length;

      if (totalSize > MAX_REQUEST_SIZE) {
        reject(new Error("Request too large. Please use a smaller receipt."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const content = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(content || "{}"));
      } catch {
        reject(new Error("Invalid request data."));
      }
    });

    req.on("error", reject);
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
  const fileContents = Buffer.from(match[2], "base64");

  if (!fileContents.length || fileContents.length > MAX_RECEIPT_SIZE) {
    throw new Error("Receipt must be smaller than 4 MB.");
  }

  const filename =
    crypto.randomUUID() + RECEIPT_TYPES[contentType];

  await fs.writeFile(
    path.join(RECEIPTS_DIR, filename),
    fileContents,
    { flag: "wx", mode: 0o600 }
  );

  return {
    filename,
    originalName: cleanText(receipt.name, 150),
    contentType,
    size: fileContents.length
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    const route = decodeURIComponent(url.pathname);

    // Check whether the demo server is running.
    if (req.method === "GET" && route === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "CleanFlow demo server",
        demoMode: true
      });
    }

    // CREATE AN ORDER.
    if (req.method === "POST" && route === "/api/orders") {
      const body = await readJsonBody(req);

      const customerName = cleanText(body.customerName, 100);
      const customerEmail = cleanText(body.customerEmail, 160);
      const company = cleanText(body.company, 160);
      const service = cleanText(body.service, 80);
      const paymentMethod = cleanText(body.paymentMethod, 40);
      const paymentReference = cleanText(body.paymentReference, 100);
      const notes = cleanText(body.notes, 1000);

      if (
        !customerName ||
        !customerEmail ||
        !service ||
        !paymentMethod
      ) {
        return sendJson(res, 400, {
          error: "Please complete your name, email, service, and payment method."
        });
      }

      if (!validEmail(customerEmail)) {
        return sendJson(res, 400, {
          error: "Please enter a valid email address."
        });
      }

      if (!SERVICES.includes(service)) {
        return sendJson(res, 400, {
          error: "Please select a valid service."
        });
      }

      if (!METHODS.includes(paymentMethod)) {
        return sendJson(res, 400, {
          error: "Please select a valid payment method."
        });
      }

      if (
        paymentMethod === "Credit Card" ||
        paymentMethod === "Debit Card"
      ) {
        return sendJson(res, 400, {
          error: "Card processing is not connected. For this demo, choose GCash or Online Bank Transfer."
        });
      }

      const receipt = await saveReceipt(body.receipt);

      const order = {
        id: crypto.randomUUID(),
        customerName,
        customerEmail,
        company,
        service,
        paymentMethod,
        paymentReference: paymentReference || null,
        receipt,
        notes,
        status: "Pending Verification",
        demo: true,
        createdAt: new Date().toISOString()
      };

     
orders.push(order);
await saveRecords(ORDERS_FILE, orders);

// Send the customer confirmation.
await sendResendEmail({
  to: order.customerEmail,
  subject: `CleanFlow Order Confirmation - ${order.id}`,
  html: `
    <h2>Thank you for choosing CleanFlow Engineering!</h2>
    <p>Hello ${escapeHtml(order.customerName)},</p>
    <p>We have received your service order.</p>
    <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
    <p><strong>Service:</strong> ${escapeHtml(order.service)}</p>
    <p><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod)}</p>
    <p><strong>Status:</strong> Pending Verification</p>
    <p>This is a demo order. Your payment has not been automatically verified.</p>
  `
});

// Notify the CleanFlow owner.
await sendResendEmail({
  to: ADMIN_EMAIL,
  subject: `New CleanFlow Order - ${order.id}`,
  html: `
    <h2>New CleanFlow Order</h2>
    <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
    <p><strong>Customer email:</strong> ${escapeHtml(order.customerEmail)}</p>
    <p><strong>Company:</strong> ${escapeHtml(order.company || "Not provided")}</p>
    <p><strong>Service:</strong> ${escapeHtml(order.service)}</p>
    <p><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod)}</p>
    <p><strong>Payment reference:</strong> ${escapeHtml(order.paymentReference || "Not provided")}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
    <p>This is a demo order. Verify payment separately.</p>
  `
});

return sendJson(res, 201, {
  message: "Demo order saved successfully.",
  orderId: order.id,
  status: order.status,
  demo: true
});

    // CHECK ORDER STATUS.
    const orderMatch = route.match(
      /^\/api\/orders\/([a-f0-9-]+)$/i
    );

    if (req.method === "GET" && orderMatch) {
      const orders = await readRecords(ORDERS_FILE);

      const order = orders.find(
        item => item.id === orderMatch[1]
      );

      if (!order) {
        return sendJson(res, 404, {
          error: "Order not found."
        });
      }

      return sendJson(res, 200, {
        orderId: order.id,
        service: order.service,
        status: order.status,
        createdAt: order.createdAt,
        demo: true
      });
    }

    // SUBMIT A REFUND REQUEST.
    if (req.method === "POST" && route === "/api/refunds") {
      const body = await readJsonBody(req);

      const orderId = cleanText(body.orderId, 80);
      const customerEmail = cleanText(body.customerEmail, 160);
      const reason = cleanText(body.reason, 1000);

      if (!orderId || !customerEmail || !reason) {
        return sendJson(res, 400, {
          error: "Please provide your order ID, email, and refund reason."
        });
      }

      if (!validEmail(customerEmail)) {
        return sendJson(res, 400, {
          error: "Please enter a valid email address."
        });
      }

      const orders = await readRecords(ORDERS_FILE);

      const order = orders.find(item =>
        item.id === orderId &&
        item.customerEmail.toLowerCase() === customerEmail.toLowerCase()
      );

      if (!order) {
        return sendJson(res, 404, {
          error: "No order matches that order ID and email."
        });
      }

      const refunds = await readRecords(REFUNDS_FILE);

      const existingRequest = refunds.find(item =>
        item.orderId === orderId &&
        [
          "Refund Pending Review",
          "Refund Approved"
        ].includes(item.status)
      );

      if (existingRequest) {
        return sendJson(res, 409, {
          error: "A refund request for this order is already being reviewed."
        });
      }

      const refund = {
        id: crypto.randomUUID(),
        orderId,
        customerEmail,
        reason,
        status: "Refund Pending Review",
        demo: true,
        createdAt: new Date().toISOString()
      };


refunds.push(refund);
await saveRecords(REFUNDS_FILE, refunds);

// Confirm receipt of the refund request to the customer.
await sendResendEmail({
  to: refund.customerEmail,
  subject: `CleanFlow Refund Request Received - ${refund.id}`,
  html: `
    <h2>Refund Request Received</h2>
    <p>We have received your refund request.</p>
    <p><strong>Refund reference:</strong> ${escapeHtml(refund.id)}</p>
    <p><strong>Order ID:</strong> ${escapeHtml(refund.orderId)}</p>
    <p><strong>Status:</strong> ${escapeHtml(refund.status)}</p>
    <p><strong>Reason submitted:</strong> ${escapeHtml(refund.reason)}</p>
    <p>This is only a request for review. It does not mean a refund has been approved or paid.</p>
  `
});

// Notify the CleanFlow owner.
await sendResendEmail({
  to: ADMIN_EMAIL,
  subject: `New CleanFlow Refund Request - ${refund.id}`,
  html: `
    <h2>New Refund Request</h2>
    <p><strong>Refund reference:</strong> ${escapeHtml(refund.id)}</p>
    <p><strong>Order ID:</strong> ${escapeHtml(refund.orderId)}</p>
    <p><strong>Customer email:</strong> ${escapeHtml(refund.customerEmail)}</p>
    <p><strong>Reason:</strong> ${escapeHtml(refund.reason)}</p>
    <p><strong>Status:</strong> ${escapeHtml(refund.status)}</p>
    <p>Please review this demo refund request manually.</p>
  `
});

return sendJson(res, 201, {
  message: "Refund request submitted for demo review.",
  refundId: refund.id,
  status: refund.status,
  demo: true
});

    // SERVE THE WEBSITE FILES.
    if (req.method === "GET") {
      const requestedPath =
        route === "/" ? "/index.html" : route;

      const filePath = path.resolve(
        ROOT,
        "." + requestedPath
      );

      if (
        !filePath.startsWith(ROOT + path.sep) &&
        filePath !== path.join(ROOT, "index.html")
      ) {
        return sendJson(res, 403, {
          error: "Access denied."
        });
      }

      try {
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          throw new Error("Not a file");
        }

        const fileContents = await fs.readFile(filePath);

        res.writeHead(200, {
          "Content-Type":
            MIME_TYPES[path.extname(filePath).toLowerCase()] ||
            "application/octet-stream",
          "X-Content-Type-Options": "nosniff"
        });

        return res.end(fileContents);
      } catch {
        return sendJson(res, 404, {
          error: "File not found. Make sure index.html, styles.css, and script.js are in the same project."
        });
      }
    }

    return sendJson(res, 404, {
      error: "Route not found."
    });

  } catch (error) {
    console.error("Request error:", error.message);

    if (!res.headersSent && !res.destroyed) {
      return sendJson(res, 400, {
        error: error.message || "The request failed."
      });
    }
  }
});

initializeStorage()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `CleanFlow demo server running on port ${PORT}.`
      );
      console.log(
        "Open the web preview. Demo only: no real payments or refunds."
      );
    });
  })
  .catch(error => {
    console.error("Could not initialize storage:", error);
    process.exit(1);
  });
