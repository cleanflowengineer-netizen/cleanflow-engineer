
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
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const ADMIN_EMAIL = "cleanflowengineering@gmail.com";

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function cleanText(value, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

async function sendResendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.error("Email not sent: RESEND_API_KEY is missing.");
    return false;
  }

  if (!RESEND_FROM_EMAIL) {
    console.error("Email not sent: RESEND_FROM_EMAIL is missing.");
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
        from: `CleanFlow Engineering <${RESEND_FROM_EMAIL}>`,
        to: [to],
        subject,
        html
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend email error:", response.status, result);
      return false;
    }

    console.log(
      `Resend email accepted for ${to}:`,
      result.id
    );
    return true;
  } catch (error) {
    console.error("Resend request failed:", error.message);
    return false;
  }
}

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
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
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
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

  const filename = crypto.randomUUID() + RECEIPT_TYPES[contentType];

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

async function notifyOrder(order) {
  const notes = order.notes || "No additional instructions provided.";

  const customerEmailSent = await sendResendEmail({
    to: order.customerEmail,
    subject: `CleanFlow Engineering - Order Confirmation - ${order.id}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#222;line-height:1.6">
        <h2 style="color:#087db5">CLEANFLOW ENGINEERING</h2>
        <p><strong>ORDER CONFIRMATION</strong></p>
        <p>Hello ${escapeHtml(order.customerName)},</p>
        <p>Thank you for choosing CleanFlow Engineering. We have received your service order.</p>
        <h3>ORDER DETAILS</h3>
        <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
        <p><strong>Customer Name:</strong> ${escapeHtml(order.customerName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</p>
        <p><strong>Company / Organization:</strong> ${escapeHtml(order.company || "Not provided")}</p>
        <p><strong>Service:</strong> ${escapeHtml(order.service)}</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod)}</p>
        <p><strong>Payment Reference:</strong> ${escapeHtml(order.paymentReference || "Not provided")}</p>
        <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
        <h3>MESSAGE / ADDITIONAL INSTRUCTIONS</h3>
        <div style="padding:12px;background:#f1f7fb;border-left:4px solid #087db5;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(notes)}</div>
        <h3>PAYMENT VERIFICATION NOTICE</h3>
        <p>Your order has been recorded. Your payment is awaiting manual verification. The administrator must check your transaction and uploaded receipt before confirming payment.</p>
        <p>Please keep your Order ID for future inquiries or refund requests.</p>
        <hr>
        <p style="font-size:12px;color:#666">School project demo only. This email does not confirm payment verification or a refund.</p>
        <p>CleanFlow Engineering</p>
      </div>
    `
  });

  const ownerEmailSent = await sendResendEmail({
    to: ADMIN_EMAIL,
    subject: `New CleanFlow Order - ${order.id}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>New CleanFlow Order</h2>
        <p><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
        <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
        <p><strong>Customer email:</strong> ${escapeHtml(order.customerEmail)}</p>
        <p><strong>Company:</strong> ${escapeHtml(order.company || "Not provided")}</p>
        <p><strong>Service:</strong> ${escapeHtml(order.service)}</p>
        <p><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod)}</p>
        <p><strong>Payment reference:</strong> ${escapeHtml(order.paymentReference || "Not provided")}</p>
        <h3>Additional Instructions</h3>
        <div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(notes)}</div>
        <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
        <p>This is a demo order. Verify payment separately.</p>
      </div>
    `
  });

  console.log("Order email results:", {
    orderId: order.id,
    customerEmailSent,
    ownerEmailSent
  });
}

async function notifyRefund(refund) {
  const customerEmailSent = await sendResendEmail({
    to: refund.customerEmail,
    subject: `CleanFlow Refund Request Received - ${refund.id}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Refund Request Received</h2>
        <p>We have received your refund request.</p>
        <p><strong>Refund reference:</strong> ${escapeHtml(refund.id)}</p>
        <p><strong>Order ID:</strong> ${escapeHtml(refund.orderId)}</p>
        <p><strong>Status:</strong> ${escapeHtml(refund.status)}</p>
        <p><strong>Reason submitted:</strong></p>
        <div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(refund.reason)}</div>
        <p>This is only a request for review. It does not mean a refund has been approved or paid.</p>
      </div>
    `
  });

  const ownerEmailSent = await sendResendEmail({
    to: ADMIN_EMAIL,
    subject: `New CleanFlow Refund Request - ${refund.id}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>New Refund Request</h2>
        <p><strong>Refund reference:</strong> ${escapeHtml(refund.id)}</p>
        <p><strong>Order ID:</strong> ${escapeHtml(refund.orderId)}</p>
        <p><strong>Customer email:</strong> ${escapeHtml(refund.customerEmail)}</p>
        <p><strong>Reason:</strong></p>
        <div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(refund.reason)}</div>
        <p><strong>Status:</strong> ${escapeHtml(refund.status)}</p>
        <p>Please review this demo refund request manually.</p>
      </div>
    `
  });

  console.log("Refund email results:", {
    refundId: refund.id,
    customerEmailSent,
    ownerEmailSent
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );
    const route = decodeURIComponent(url.pathname);

    if (req.method === "GET" && route === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "CleanFlow demo server",
        demoMode: true
      });
    }

    // CREATE ORDER
    if (req.method === "POST" && route === "/api/orders") {
      const body = await readJsonBody(req);

      const customerName = cleanText(body.customerName, 100);
      const customerEmail = cleanText(body.customerEmail, 160);
      const company = cleanText(body.company, 160);
      const service = cleanText(body.service, 80);
      const paymentMethod = cleanText(body.paymentMethod, 40);
      const paymentReference = cleanText(body.paymentReference, 100);
      const notes = cleanText(body.notes, 1000);

      if (!customerName || !customerEmail || !service || !paymentMethod) {
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

      if (["Credit Card", "Debit Card"].includes(paymentMethod)) {
        return sendJson(res, 400, {
          error: "Card processing is not connected. Choose GCash or Online Bank Transfer."
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

      const orders = await readRecords(ORDERS_FILE);
      orders.push(order);
      await saveRecords(ORDERS_FILE, orders);

      // Email failures do not undo the saved order.
      await notifyOrder(order);

      return sendJson(res, 201, {
        message: "Demo order saved successfully.",
        orderId: order.id,
        status: order.status,
        demo: true
      });
    }

    // CHECK ORDER STATUS
    const orderMatch = route.match(/^\/api\/orders\/([a-f0-9-]+)$/i);

    if (req.method === "GET" && orderMatch) {
      const orders = await readRecords(ORDERS_FILE);
      const order = orders.find(item => item.id === orderMatch[1]);

      if (!order) {
        return sendJson(res, 404, { error: "Order not found." });
      }

      return sendJson(res, 200, {
        orderId: order.id,
        service: order.service,
        status: order.status,
        createdAt: order.createdAt,
        demo: true
      });
    }

    // SUBMIT REFUND REQUEST
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
        ["Refund Pending Review", "Refund Approved"].includes(item.status)
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

      // Email failures do not undo the saved refund request.
      await notifyRefund(refund);

      return sendJson(res, 201, {
        message: "Refund request submitted for demo review.",
        refundId: refund.id,
        status: refund.status,
        demo: true
      });
    }

    // SERVE WEBSITE FILES
    if (req.method === "GET") {
      const requestedPath = route === "/" ? "/index.html" : route;
      const filePath = path.resolve(ROOT, "." + requestedPath);

      if (
        !filePath.startsWith(ROOT + path.sep) &&
        filePath !== path.join(ROOT, "index.html")
      ) {
        return sendJson(res, 403, { error: "Access denied." });
      }

      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) throw new Error("Not a file");

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
          error: "File not found. Ensure index.html, styles.css, and script.js are in the project."
        });
      }
    }

    return sendJson(res, 404, { error: "Route not found." });

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
      console.log(`CleanFlow demo server running on port ${PORT}.`);
      console.log("Demo only: no real payments or refunds.");
      console.log(
        "Email sender configured:",
        RESEND_FROM_EMAIL ? "yes" : "no - set RESEND_FROM_EMAIL in Render"
      );
    });
  })
  .catch(error => {
    console.error("Could not initialize storage:", error);
    process.exit(1);
  });
