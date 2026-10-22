/**
 * server.js — SariSync Speed Board Express Application Entrypoint
 *
 * A clean, beginner-friendly Node.js/Express server for Philippine neighborhood
 * sari-sari store ("tindahan") operations.
 *
 * Core Workflows:
 * 1. Paninda (Products): Inventory CRUD with price, cost, and stock tracking
 * 2. Suki (Customers): Customer account CRUD backed by BankAccount-style UtangAccount
 * 3. Benta (Sales): POS checkout deducting stock and adding utang or cash receipts
 * 4. Bayad (Utang Payments): Zero-floor debt payments and Sukli (change) calculator
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const express = require("./lib/express");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ============================================================================
// Core Dependencies & Shared Database Models
// ============================================================================
const {
  DB_PATH,
  round2,
  getTodayIso,
  calculateDaysAgo,
  getInitialSeedData,
  loadDatabase,
  writeDatabaseAtomicSync,
  saveDatabaseAtomic,
  calculateCustomerRisk,
  evaluateUtangTransactionRisk,
  enrichCustomer,
  calculatePaymentBreakdown,
  buildStoreSummary
} = require("./models/db");

const UtangAccount = require("./models/UtangAccount");

// ============================================================================
// Standard Express Middleware
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// ============================================================================
// Modular Routes
// ============================================================================
const productsRouter = require("./routes/products");
const customersRouter = require("./routes/customers");
const salesRouter = require("./routes/sales");
const utangRouter = require("./routes/utang");

// 1. Paninda (Products Inventory) Router
app.use("/api/products", productsRouter);

// 2. Suki (Customers) Router
app.use("/api/customers", customersRouter);

// 3. Benta (Sales & POS) Router
app.use("/api/sales", salesRouter);

// 4. Utang & Ledger Router
app.use("/api/utang", utangRouter.router);

// Direct Aliases for Utang & Payment Operations (used by POS buttons & test suite)
app.post("/api/customers/:id/deposit", utangRouter.handlePayment);
app.post("/api/transactions/payment", utangRouter.handlePayment);
app.post("/api/bayad", utangRouter.handlePayment);
app.post("/api/transactions/utang", utangRouter.handleUtang);
app.post("/api/transactions/utang/preview", (req, res) => {
  const { customerId, amount } = req.body || {};
  const db = loadDatabase();
  const customer = (db.customers || []).find(c => c.id === customerId);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(evaluateUtangTransactionRisk(customer, amount, db.transactions || []));
});
app.post("/api/utang", utangRouter.handleUtang);

app.get("/api/transactions", (req, res) => {
  const db = loadDatabase();
  res.json({ success: true, transactions: db.transactions || [] });
});

// ============================================================================
// Core State, Health, and Demo Reset Endpoints
// ============================================================================

// Full bootstrap state endpoint for frontend synchronization & test assertions
app.get("/api/state", (req, res) => {
  try {
    const db = loadDatabase();
    const allTransactions = db.transactions || [];
    const enrichedCustomers = (db.customers || []).map(c => enrichCustomer(c, allTransactions));
    const summary = buildStoreSummary(enrichedCustomers, allTransactions, db.products || []);

    res.json({
      metadata: db.metadata,
      customers: enrichedCustomers,
      products: db.products || [],
      tingiPresets: db.tingiPresets || [1, 2, 5, 10, 15, 20, 50],
      quickPayPresets: db.quickPayPresets || [20, 50, 100, 200, 500, 1000],
      transactions: allTransactions,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load state", details: err.message });
  }
});
app.get("/api/bootstrap", (req, res) => res.redirect("/api/state"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "SariSync Speed Board",
    version: "2.0.0",
    time: new Date().toISOString()
  });
});

// Reset database to clean factory seed state
app.post("/api/reset", async (req, res) => {
  try {
    const seed = getInitialSeedData();
    await saveDatabaseAtomic(seed);
    const allTransactions = seed.transactions || [];
    const enrichedCustomers = seed.customers.map(c => enrichCustomer(c, allTransactions));
    const summary = buildStoreSummary(enrichedCustomers, allTransactions, seed.products || []);

    res.json({
      message: "Na-reset na ang SariSync sa panimulang talaan!",
      customers: enrichedCustomers,
      products: seed.products,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset database", details: err.message });
  }
});

// ============================================================================
// 404 & SPA Fallback (Resolves Express 5 / path-to-regexp app.get("*") crash)
// ============================================================================

// 1. Unmatched /api/* routes ALWAYS return clean JSON 404
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}` });
});

// 2. Non-API GET requests fall back cleanly to index.html without using app.get("*")
//    Using app.use middleware prevents path-to-regexp syntax errors across all Express versions!
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const indexHtml = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.status(200).send("SariSync Tindahan POS is running.");
});

// Final error handler
app.use((err, req, res, next) => {
  console.error("[SariSync Error]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// ============================================================================
// In-Memory Test Request Dispatcher (`invokeAppRequest`)
// ============================================================================
function invokeAppRequest(method, urlPath, body = undefined, headers = {}) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = { host: "localhost:3000" };
    for (const [k, v] of Object.entries(headers || {})) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method: method.toUpperCase(),
      url: urlPath,
      headers: normalizedHeaders,
      body: body !== undefined ? body : {},
      on(event, handler) {
        if (event === "end") setImmediate(handler);
        return this;
      }
    };

    const resHeaders = {};
    const chunks = [];
    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      setHeader(name, val) { resHeaders[name.toLowerCase()] = val; },
      getHeader(name) { return resHeaders[name.toLowerCase()]; },
      end(data) {
        if (this.writableEnded) return;
        this.writableEnded = true;
        this.headersSent = true;
        if (data !== undefined && data !== null) {
          chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8"));
        }
        const text = Buffer.concat(chunks).toString("utf8");
        let parsedBody = text;
        try { parsedBody = JSON.parse(text); } catch (_) {}
        resolve({ statusCode: this.statusCode, headers: resHeaders, body: parsedBody, text });
      }
    };

    try {
      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================================
// Server Startup & Clean Exports
// ============================================================================
if (require.main === module) {
  loadDatabase();
  app.listen(PORT, () => {
    console.log(`[SariSync Server] Running at http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  invokeAppRequest,
  round2,
  getTodayIso,
  calculateDaysAgo,
  calculateCustomerRisk,
  evaluateUtangTransactionRisk,
  calculatePaymentBreakdown,
  enrichCustomer,
  buildStoreSummary,
  loadDatabase,
  saveDatabaseAtomic,
  writeDatabaseAtomicSync,
  getInitialSeedData,
  DB_PATH,
  UtangAccount
};
