/**
 * SariSync Speed Board — Backend Server & Predictive Credit Risk Engine
 *
 * Features:
 * 1. Express REST API + Static Frontend Serving (`public/`) with Built-in Offline HTTP Fallback
 * 2. Crash-Safe Atomic JSON Persistence (`data/db.json.tmp` -> `data/db.json`)
 * 3. Predictive Credit Risk Engine (`calculateCustomerRisk`) with Green/Amber/Red tiers
 * 4. Flexible Warning Mode for Red / Over-Limit Suki Accounts (warns without hard-blocking)
 * 5. Zero-Floor Overpayment Guard & Exact Sukli (Change) Calculator (`round2`)
 * 6. Rapid-Tap Idempotency & Duplicate Transaction Guard
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

// ============================================================================
// Built-In Offline-Resilient Express Adapter (Fallback if node_modules offline)
// ============================================================================

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

function createNativeExpressAdapter() {
  function matchRoutePattern(pattern, pathname) {
    if (pattern === "*") return { matched: true, params: {} };
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) return { matched: false, params: {} };

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      const pPart = patternParts[i];
      const uPart = pathParts[i];
      if (pPart.startsWith(":")) {
        params[pPart.slice(1)] = decodeURIComponent(uPart);
      } else if (pPart !== uPart) {
        return { matched: false, params: {} };
      }
    }
    return { matched: true, params };
  }

  function createApp() {
    const middlewares = [];
    const routes = [];

    const app = function (req, res) {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      req.path = parsedUrl.pathname;
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      req.params = {};

      let statusCode = 200;
      res.status = function (code) {
        statusCode = code;
        res.statusCode = code;
        return res;
      };
      res.sendStatus = function (code) {
        res.statusCode = code;
        res.end(http.STATUS_CODES[code] || String(code));
        return res;
      };
      res.json = function (payload) {
        if (!res.headersSent) {
          res.statusCode = statusCode;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify(payload));
        return res;
      };
      res.send = function (body) {
        if (!res.headersSent) {
          res.statusCode = statusCode;
          if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(body));
            return res;
          }
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
          }
        }
        res.end(body);
        return res;
      };
      res.sendFile = function (filePath) {
        try {
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.status(404).send("Not Found");
            return res;
          }
          const ext = path.extname(filePath).toLowerCase();
          res.statusCode = statusCode;
          res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
          res.end(fs.readFileSync(filePath));
        } catch (err) {
          res.status(500).send("Internal Server Error");
        }
        return res;
      };

      let mwIndex = 0;
      function runNextMiddleware(err) {
        if (err) {
          res.status(500).json({ error: err.message || "Internal Server Error" });
          return;
        }
        if (res.writableEnded) return;
        if (mwIndex < middlewares.length) {
          const mw = middlewares[mwIndex++];
          try {
            mw(req, res, runNextMiddleware);
          } catch (e) {
            runNextMiddleware(e);
          }
          return;
        }
        dispatchRoutes();
      }

      function dispatchRoutes() {
        for (const r of routes) {
          if (r.method !== req.method && !(req.method === "HEAD" && r.method === "GET")) {
            continue;
          }
          const { matched, params } = matchRoutePattern(r.pattern, req.path);
          if (matched) {
            req.params = params;
            Promise.resolve(r.handler(req, res, () => {})).catch(err => {
              if (!res.writableEnded) {
                res.status(500).json({ error: err.message || "Internal Server Error" });
              }
            });
            return;
          }
        }
        if (!res.writableEnded) {
          res.status(404).json({ error: `Not Found: ${req.method} ${req.path}` });
        }
      }

      runNextMiddleware();
    };

    app.use = function (fn) {
      if (typeof fn === "function") {
        middlewares.push(fn);
      }
      return app;
    };

    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach(method => {
      app[method.toLowerCase()] = function (pattern, handler) {
        routes.push({ method, pattern, handler });
        return app;
      };
    });

    app.listen = function (port, callback) {
      const server = http.createServer(app);
      return server.listen(port, callback);
    };

    return app;
  }

  createApp.json = function () {
    return function (req, res, next) {
      if (req.body !== undefined) return next();
      if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
        req.body = {};
        return next();
      }
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) {
          req.body = {};
          return next();
        }
        try {
          req.body = JSON.parse(raw);
        } catch (_) {
          req.body = {};
        }
        next();
      });
      req.on("error", () => {
        req.body = {};
        next();
      });
    };
  };

  createApp.urlencoded = function () {
    return function (req, res, next) {
      next();
    };
  };

  createApp.static = function (rootDir) {
    return function (req, res, next) {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api/")) return next();
      const relativePath = req.path === "/" ? "index.html" : req.path.replace(/^\/+/, "");
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
      const fullPath = path.join(rootDir, safePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return res.sendFile(fullPath);
      }
      next();
    };
  };

  return createApp;
}

let express;
try {
  express = require("express");
} catch (_) {
  express = createNativeExpressAdapter();
}

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ============================================================================
// Exact Financial Math Helpers
// ============================================================================

/**
 * Rounds any numeric value to 2 decimal places safely without IEEE-754 drift.
 * @param {number|string} val
 * @returns {number}
 */
function round2(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Returns today's date in YYYY-MM-DD format (consistent with local store date).
 * @returns {string}
 */
function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  if (y > 2026 || (y === 2026 && now.getMonth() >= 9)) {
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "2026-10-18";
}

/**
 * Calculates whole days elapsed between an ISO YYYY-MM-DD date and reference today.
 * @param {string} dateStr
 * @param {string} [referenceDateStr]
 * @returns {number}
 */
function calculateDaysAgo(dateStr, referenceDateStr = getTodayIso()) {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  const refParts = referenceDateStr.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || refParts.length !== 3) return 0;
  const past = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(refParts[0], refParts[1] - 1, refParts[2]);
  const diffMs = today.getTime() - past.getTime();
  if (!Number.isFinite(diffMs)) return 0;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// ============================================================================
// Factory Seed Data (6 Suki Customers, 12 Products, Tingi Presets, Ledger)
// ============================================================================

function getInitialSeedData() {
  return {
    metadata: {
      storeName: "SariSync Tindahan ni Aling Bebang",
      currency: "PHP",
      version: "2.0.0",
      lastUpdated: "2026-10-18T09:30:00.000Z"
    },
    tingiPresets: [1, 2, 5, 10, 15, 20, 50],
    quickPayPresets: [20, 50, 100, 200, 500, 1000],
    products: [
      {
        id: "p1",
        name: "3-in-1 Coffee",
        shortName: "Coffee",
        tagalog: "Kape Twin Pack",
        subtitle: "Kape Twin Pack",
        price: 15.0,
        category: "Inumin",
        icon: "☕",
        emoji: "☕"
      },
      {
        id: "p2",
        name: "Pancit Canton",
        shortName: "Canton",
        tagalog: "Chilimansi / Kalamansi",
        subtitle: "Chilimansi / Kalamansi",
        price: 18.0,
        category: "Merienda",
        icon: "🍜",
        emoji: "🍜"
      },
      {
        id: "p3",
        name: "Canned Sardines",
        shortName: "Sardines",
        tagalog: "Sardinas sa Lata",
        subtitle: "Sardinas sa Lata",
        price: 28.0,
        category: "Ulam",
        icon: "🐟",
        emoji: "🐟"
      },
      {
        id: "p4",
        name: "Egg (1 pc)",
        shortName: "Egg",
        tagalog: "Itlog (1 piraso)",
        subtitle: "Itlog (1 piraso)",
        price: 10.0,
        category: "Ulam",
        icon: "🥚",
        emoji: "🥚"
      },
      {
        id: "p5",
        name: "Rice 1kg",
        shortName: "Rice 1kg",
        tagalog: "Bigas Sinandomeng 1kg",
        subtitle: "Bigas Sinandomeng 1kg",
        price: 52.0,
        category: "Bigas",
        icon: "🍚",
        emoji: "🍚"
      },
      {
        id: "p6",
        name: "Cooking Oil Tingi",
        shortName: "Oil Tingi",
        tagalog: "Mantika Tingi Pouch",
        subtitle: "Mantika Tingi Pouch",
        price: 20.0,
        category: "Panluto",
        icon: "🫗",
        emoji: "🫗"
      },
      {
        id: "p7",
        name: "Instant Mami",
        shortName: "Mami",
        tagalog: "Beef / Chicken Noodles",
        subtitle: "Beef / Chicken Noodles",
        price: 14.0,
        category: "Merienda",
        icon: "🍲",
        emoji: "🍲"
      },
      {
        id: "p8",
        name: "Softdrinks",
        shortName: "Softdrinks",
        tagalog: "Malamig na Kasalo",
        subtitle: "Malamig na Kasalo",
        price: 25.0,
        category: "Inumin",
        icon: "🥤",
        emoji: "🥤"
      },
      {
        id: "p9",
        name: "Laundry Soap",
        shortName: "Sabon",
        tagalog: "Sabon Panlaba Sachet",
        subtitle: "Sabon Panlaba Sachet",
        price: 16.0,
        category: "Panlinis",
        icon: "🧼",
        emoji: "🧼"
      },
      {
        id: "p10",
        name: "Paracetamol",
        shortName: "Biogesic",
        tagalog: "Biogesic 500mg (1 tab)",
        subtitle: "Biogesic 500mg (1 tab)",
        price: 8.0,
        category: "Gamot",
        icon: "💊",
        emoji: "💊"
      },
      {
        id: "p11",
        name: "Sugar 1/4kg",
        shortName: "Asukal",
        tagalog: "Asukal na Pula 1/4kg",
        subtitle: "Asukal na Pula 1/4kg",
        price: 24.0,
        category: "Panluto",
        icon: "🧂",
        emoji: "🧂"
      },
      {
        id: "p12",
        name: "Toyo / Suka Pouch",
        shortName: "Toyo/Suka",
        tagalog: "Datu Puti Tingi Pouch",
        subtitle: "Datu Puti Tingi Pouch",
        price: 12.0,
        category: "Panluto",
        icon: "🍶",
        emoji: "🍶"
      }
    ],
    customers: [
      {
        id: "c1",
        name: "Aling Nena",
        phone: "0917-123-4567",
        avatar: "👵",
        balance: 320.0,
        totalDebt: 320.0,
        creditLimit: 600.0,
        daysOverdue: 2,
        repaymentRate: 92,
        notes: "Suki sa kanto, laging nagbabayad tuwing Biyernes",
        createdAt: "2026-09-01T08:00:00.000Z"
      },
      {
        id: "c2",
        name: "Mang Boy",
        phone: "0928-555-8899",
        avatar: "👨",
        balance: 850.0,
        totalDebt: 850.0,
        creditLimit: 800.0,
        daysOverdue: 14,
        repaymentRate: 38,
        notes: "Tricycle driver, lampas na sa limit at 2 linggo nang walang bayad",
        createdAt: "2026-09-05T08:00:00.000Z"
      },
      {
        id: "c3",
        name: "Ate Joy",
        phone: "0919-888-2233",
        avatar: "👩",
        balance: 95.0,
        totalDebt: 95.0,
        creditLimit: 500.0,
        daysOverdue: 0,
        repaymentRate: 96,
        notes: "Maagang magbayad, laging kumukuha ng almusal",
        createdAt: "2026-09-10T08:00:00.000Z"
      },
      {
        id: "c4",
        name: "Kuya Jun",
        phone: "0918-444-7711",
        avatar: "👷",
        balance: 440.0,
        totalDebt: 440.0,
        creditLimit: 500.0,
        daysOverdue: 9,
        repaymentRate: 64,
        notes: "Construction foreman, sahod tuwing Sabado",
        createdAt: "2026-09-12T08:00:00.000Z"
      },
      {
        id: "c5",
        name: "Aling Rosa",
        phone: "0927-333-6644",
        avatar: "👩‍🍳",
        balance: 420.0,
        totalDebt: 420.0,
        creditLimit: 700.0,
        daysOverdue: 5,
        repaymentRate: 81,
        notes: "May karinderya sa tapat, kumukuha ng mantika at bigas",
        createdAt: "2026-09-15T08:00:00.000Z"
      },
      {
        id: "c6",
        name: "Ate Marites",
        phone: "0998-222-1100",
        avatar: "👱‍♀️",
        balance: 60.0,
        totalDebt: 60.0,
        creditLimit: 400.0,
        daysOverdue: 1,
        repaymentRate: 94,
        notes: "Mahilig sa kape at merienda sa hapon",
        createdAt: "2026-09-20T08:00:00.000Z"
      }
    ],
    transactions: [
      {
        id: "tx_103",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "utang",
        amount: 212.0,
        items: "2x Rice 1kg, 2x Canned Sardines, 2x Cooking Oil Tingi, 1x Toyo / Suka Pouch",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 2, price: 52.0, subtotal: 104.0 },
          { id: "p3", name: "Canned Sardines", qty: 2, price: 28.0, subtotal: 56.0 },
          { id: "p6", name: "Cooking Oil Tingi", qty: 2, price: 20.0, subtotal: 40.0 },
          { id: "p12", name: "Toyo / Suka Pouch", qty: 1, price: 12.0, subtotal: 12.0 }
        ],
        priorBalance: 108.0,
        newBalance: 320.0,
        date: "2026-10-18",
        timestamp: "2026-10-18T08:45:00.000Z"
      },
      {
        id: "tx_102",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "payment",
        amount: 100.0,
        tendered: 100.0,
        deductedAmount: 100.0,
        sukli: 0.0,
        items: "Cash payment",
        priorBalance: 208.0,
        newBalance: 108.0,
        date: "2026-10-16",
        timestamp: "2026-10-16T17:15:00.000Z"
      },
      {
        id: "tx_101b",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "utang",
        amount: 58.0,
        items: "2x 3-in-1 Coffee, 1x Canned Sardines",
        itemList: [
          { id: "p1", name: "3-in-1 Coffee", qty: 2, price: 15.0, subtotal: 30.0 },
          { id: "p3", name: "Canned Sardines", qty: 1, price: 28.0, subtotal: 28.0 }
        ],
        priorBalance: 150.0,
        newBalance: 208.0,
        date: "2026-10-16",
        timestamp: "2026-10-16T07:30:00.000Z"
      },
      {
        id: "tx_101",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "utang",
        amount: 150.0,
        items: "2x Rice 1kg, 3x Egg (1 pc), 1x Laundry Soap",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 2, price: 52.0, subtotal: 104.0 },
          { id: "p4", name: "Egg (1 pc)", qty: 3, price: 10.0, subtotal: 30.0 },
          { id: "p9", name: "Laundry Soap", qty: 1, price: 16.0, subtotal: 16.0 }
        ],
        priorBalance: 0.0,
        newBalance: 150.0,
        date: "2026-10-14",
        timestamp: "2026-10-14T09:10:00.000Z"
      },
      {
        id: "tx_202",
        customerId: "c2",
        customerName: "Mang Boy",
        type: "utang",
        amount: 350.0,
        items: "5x Rice 1kg, 2x Softdrinks, 2x Cooking Oil Tingi",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 5, price: 52.0, subtotal: 260.0 },
          { id: "p8", name: "Softdrinks", qty: 2, price: 25.0, subtotal: 50.0 },
          { id: "p6", name: "Cooking Oil Tingi", qty: 2, price: 20.0, subtotal: 40.0 }
        ],
        priorBalance: 500.0,
        newBalance: 850.0,
        warningAcknowledged: true,
        date: "2026-10-08",
        timestamp: "2026-10-08T18:20:00.000Z"
      },
      {
        id: "tx_201",
        customerId: "c2",
        customerName: "Mang Boy",
        type: "utang",
        amount: 500.0,
        items: "6x Rice 1kg, 4x Canned Sardines, 4x Pancit Canton, 1x Tingi (₱4)",
        priorBalance: 0.0,
        newBalance: 500.0,
        date: "2026-10-04",
        timestamp: "2026-10-04T11:00:00.000Z"
      },
      {
        id: "tx_301",
        customerId: "c3",
        customerName: "Ate Joy",
        type: "utang",
        amount: 95.0,
        items: "3x Egg (1 pc), 2x 3-in-1 Coffee, 1x Sugar 1/4kg, 1x Tingi (₱11)",
        priorBalance: 0.0,
        newBalance: 95.0,
        date: "2026-10-17",
        timestamp: "2026-10-17T06:50:00.000Z"
      },
      {
        id: "tx_402",
        customerId: "c4",
        customerName: "Kuya Jun",
        type: "utang",
        amount: 190.0,
        items: "2x Rice 1kg, 3x Pancit Canton, 2x Paracetamol, 1x Tingi (₱16)",
        priorBalance: 250.0,
        newBalance: 440.0,
        date: "2026-10-13",
        timestamp: "2026-10-13T19:05:00.000Z"
      },
      {
        id: "tx_401",
        customerId: "c4",
        customerName: "Kuya Jun",
        type: "utang",
        amount: 250.0,
        items: "3x Rice 1kg, 2x Canned Sardines, 2x Softdrinks",
        priorBalance: 0.0,
        newBalance: 250.0,
        date: "2026-10-09",
        timestamp: "2026-10-09T18:40:00.000Z"
      },
      {
        id: "tx_502",
        customerId: "c5",
        customerName: "Aling Rosa",
        type: "payment",
        amount: 100.0,
        tendered: 100.0,
        deductedAmount: 100.0,
        sukli: 0.0,
        items: "Cash payment",
        priorBalance: 520.0,
        newBalance: 420.0,
        date: "2026-10-15",
        timestamp: "2026-10-15T15:00:00.000Z"
      },
      {
        id: "tx_501",
        customerId: "c5",
        customerName: "Aling Rosa",
        type: "utang",
        amount: 520.0,
        items: "6x Rice 1kg, 6x Cooking Oil Tingi, 4x Toyo / Suka Pouch, 2x Sugar 1/4kg",
        priorBalance: 0.0,
        newBalance: 520.0,
        date: "2026-10-12",
        timestamp: "2026-10-12T05:45:00.000Z"
      },
      {
        id: "tx_601",
        customerId: "c6",
        customerName: "Ate Marites",
        type: "utang",
        amount: 60.0,
        items: "2x 3-in-1 Coffee, 1x Pancit Canton, 1x Toyo / Suka Pouch",
        priorBalance: 0.0,
        newBalance: 60.0,
        date: "2026-10-18",
        timestamp: "2026-10-18T14:20:00.000Z"
      }
    ]
  };
}

// ============================================================================
// Atomic JSON File Persistence Engine
// ============================================================================

let writeQueue = Promise.resolve();

/**
 * Ensures the `data/` directory exists.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Writes database object atomically to `data/db.json` via temporary file + rename.
 * Ensures no partial writes or corrupted JSON on unexpected process termination.
 * @param {object} dbData
 */
function writeDatabaseAtomicSync(dbData) {
  ensureDataDir();
  const payload = {
    ...dbData,
    metadata: {
      ...(dbData.metadata || {}),
      storeName: (dbData.metadata && dbData.metadata.storeName) || "SariSync Tindahan ni Aling Bebang",
      currency: "PHP",
      version: "2.0.0",
      lastUpdated: new Date().toISOString()
    }
  };

  const jsonContent = JSON.stringify(payload, null, 2) + "\n";
  const tmpFile = `${DB_PATH}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;

  let fd = null;
  try {
    fd = fs.openSync(tmpFile, "w", 0o644);
    fs.writeFileSync(fd, jsonContent, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpFile, DB_PATH);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}
    }
    throw err;
  }

  return payload;
}

/**
 * Serialized async wrapper for atomic database writes.
 * @param {object} dbData
 * @returns {Promise<object>}
 */
function saveDatabaseAtomic(dbData) {
  const nextWrite = writeQueue.then(() => writeDatabaseAtomicSync(dbData));
  writeQueue = nextWrite.catch(() => {});
  return nextWrite;
}

/**
 * Loads database from `data/db.json`. Auto-seeds if missing or corrupted.
 * @returns {object}
 */
function loadDatabase() {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const seed = getInitialSeedData();
    return writeDatabaseAtomicSync(seed);
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.products)) {
      throw new Error("Invalid database schema");
    }
    if (!Array.isArray(parsed.transactions)) {
      parsed.transactions = [];
    }
    if (!Array.isArray(parsed.tingiPresets)) {
      parsed.tingiPresets = [1, 2, 5, 10, 15, 20, 50];
    }
    if (!Array.isArray(parsed.quickPayPresets)) {
      parsed.quickPayPresets = [20, 50, 100, 200, 500, 1000];
    }
    return parsed;
  } catch (err) {
    console.warn("[SariSync DB] Auto-recovering database from seed due to read/parse error:", err.message);
    const seed = getInitialSeedData();
    return writeDatabaseAtomicSync(seed);
  }
}

// ============================================================================
// Predictive Credit Risk Calculation Engine & Zero-Floor Payment Math
// ============================================================================

/**
 * Computes predictive credit risk profile for a customer based on their balance,
 * credit limit, overdue days, and transaction history.
 *
 * Tiers:
 * - Green / Safe (`status: "safe"`, `color: "green"`, `label: "Safe"`):
 *   utilization < 50% and not severely overdue.
 * - Amber / Watch (`status: "watch"`, `color: "amber"`, `label: "Watch"`):
 *   50% <= utilization < 85% (or moderate overdue age).
 * - Red / High Risk (`status: "danger"`, `color: "red"`, `label: "High Risk"`):
 *   utilization >= 85% or balance >= creditLimit (or >= 14 days overdue with debt).
 *
 * Enforces Flexible Warning Mode:
 * - `canExtendCredit` is ALWAYS `true` (never hard-blocks the tindera/tindero).
 * - `requiresWarningConfirmation` is `true` when in Red / High Risk tier.
 *
 * @param {object} customer
 * @param {Array<object>} [allTransactions]
 * @returns {object}
 */
function calculateCustomerRisk(customer, allTransactions = []) {
  const balance = round2(Math.max(0, customer.balance ?? customer.totalDebt ?? 0));
  const creditLimit = round2(Math.max(1, customer.creditLimit ?? 500));
  const availableCredit = round2(Math.max(0, creditLimit - balance));
  const overLimitAmount = round2(Math.max(0, balance - creditLimit));
  const isOverLimit = balance > creditLimit;
  const isAtOrOverLimit = balance >= creditLimit;

  const rawRatio = balance / creditLimit;
  const utilizationRatio = round2(rawRatio);
  const utilizationPercent = round2(rawRatio * 100);
  const progressPercent = Math.min(100, Math.max(0, Math.round(rawRatio * 100)));

  // Filter customer transactions sorted newest first
  const custTxs = (Array.isArray(allTransactions) ? allTransactions : (customer.history || []))
    .filter(tx => !tx.customerId || tx.customerId === customer.id)
    .slice()
    .sort((a, b) => {
      const tA = a.timestamp || a.date || "";
      const tB = b.timestamp || b.date || "";
      return tB.localeCompare(tA);
    });

  const utangTxs = custTxs.filter(tx => tx.type === "utang");
  const paymentTxs = custTxs.filter(tx => tx.type === "payment");

  const totalHistoricalUtang = round2(utangTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const totalHistoricalPaid = round2(paymentTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));

  const lastUtangTx = utangTxs[0] || null;
  const lastPaymentTx = paymentTxs[0] || null;

  const daysSinceLastUtang = lastUtangTx ? calculateDaysAgo(lastUtangTx.date) : null;
  const daysSinceLastPayment = lastPaymentTx ? calculateDaysAgo(lastPaymentTx.date) : null;

  const daysOverdue = balance <= 0
    ? 0
    : Math.max(
        0,
        Number.isFinite(Number(customer.daysOverdue))
          ? Number(customer.daysOverdue)
          : (daysSinceLastUtang || 0)
      );

  // Compute dynamic repayment rate (blending historical payments & baseline score)
  let repaymentRate = Number.isFinite(Number(customer.repaymentRate))
    ? Number(customer.repaymentRate)
    : 90;

  if (balance === 0 && totalHistoricalPaid > 0) {
    repaymentRate = Math.max(repaymentRate, 98);
  } else if (isOverLimit) {
    repaymentRate = Math.min(repaymentRate, 45);
  }

  // Predictive Risk Score (0 to 100, higher = riskier)
  const utilizationScore = Math.min(65, Math.round(rawRatio * 55));
  const overdueScore = balance > 0 ? Math.min(25, Math.round(daysOverdue * 1.6)) : 0;
  const behaviorScore = Math.min(10, Math.max(0, Math.round((100 - repaymentRate) * 0.15)));
  const riskScore = balance <= 0 ? 0 : Math.min(100, utilizationScore + overdueScore + behaviorScore);

  // Determine Traffic-Light Status Tier
  let status = "safe";
  let color = "green";
  let dotClass = "dot-safe";
  let label = "Safe";
  let tagalogLabel = "Good Suki";

  if (balance > 0 && (utilizationPercent >= 85 || isAtOrOverLimit || daysOverdue >= 14)) {
    status = "danger";
    color = "red";
    dotClass = "dot-danger";
    label = "High Risk";
    tagalogLabel = isOverLimit ? "Lampas sa Limit" : "Malapit sa Limit";
  } else if (balance > 0 && (utilizationPercent >= 50 || daysOverdue >= 7)) {
    status = "watch";
    color = "amber";
    dotClass = "dot-watch";
    label = "Watch";
    tagalogLabel = "Bantayan ang Limit";
  }

  // Human-readable Taglish advisory for Amber and Red accounts
  let warningMessage = null;
  if (status === "danger") {
    if (isOverLimit) {
      warningMessage = `Babala: Lampas na sa credit limit si ${customer.name} (₱${balance.toFixed(2)} / ₱${creditLimit.toFixed(2)}, +₱${overLimitAmount.toFixed(2)} over limit). Maaari pa ring ituloy ang pa-utang sa ilalim ng Flexible Warning Mode.`;
    } else {
      warningMessage = `Babala: Nasa High Risk (${Math.round(utilizationPercent)}% ng ₱${creditLimit.toFixed(2)} limit) na si ${customer.name}. Mag-ingat o magpaalala bago magdagdag ng utang.`;
    }
  } else if (status === "watch") {
    warningMessage = `Paalala: Nasa Watch tier (${Math.round(utilizationPercent)}% ng limit) ang utang ni ${customer.name} (₱${balance.toFixed(2)} / ₱${creditLimit.toFixed(2)}).`;
  }

  return {
    balance,
    totalDebt: balance,
    creditLimit,
    availableCredit,
    overLimitAmount,
    isOverLimit,
    utilizationRatio,
    utilizationPercent,
    progressPercent,
    daysOverdue,
    repaymentRate,
    riskScore,
    status,
    color,
    dotClass,
    label,
    tagalogLabel,
    warningMessage,
    canExtendCredit: true, // Flexible Warning Mode: always allows store owner to proceed
    requiresWarningConfirmation: status === "danger",
    metrics: {
      totalHistoricalUtang,
      totalHistoricalPaid,
      utangCount: utangTxs.length,
      paymentCount: paymentTxs.length,
      lastUtangDate: lastUtangTx ? lastUtangTx.date : null,
      lastPaymentDate: lastPaymentTx ? lastPaymentTx.date : null,
      daysSinceLastUtang,
      daysSinceLastPayment
    }
  };
}

/**
 * Evaluates the impact of adding a new `utang` amount to a customer's account.
 * Supports Flexible Warning Mode: warns when the customer is already Red or when
 * the new purchase pushes the customer into Red / over-limit territory.
 *
 * @param {object} customer
 * @param {number} addedAmount
 * @param {Array<object>} allTransactions
 * @returns {object}
 */
function evaluateUtangTransactionRisk(customer, addedAmount, allTransactions = []) {
  const cleanAdded = round2(Math.max(0, addedAmount));
  const currentRisk = calculateCustomerRisk(customer, allTransactions);
  const projectedBalance = round2(currentRisk.balance + cleanAdded);

  const projectedCustomer = {
    ...customer,
    balance: projectedBalance,
    totalDebt: projectedBalance
  };
  const projectedRisk = calculateCustomerRisk(projectedCustomer, allTransactions);

  const triggersRedWarning = currentRisk.status === "danger" || projectedRisk.status === "danger";
  const triggersAmberNotice = !triggersRedWarning && projectedRisk.status === "watch";

  let advisoryMessage = projectedRisk.warningMessage;
  if (triggersRedWarning) {
    if (projectedRisk.isOverLimit) {
      advisoryMessage = `Babala (High Risk): Ang bagong utang na ₱${cleanAdded.toFixed(2)} ay magpapalampas kay ${customer.name} sa credit limit (Magiging ₱${projectedBalance.toFixed(2)} / Limit ₱${projectedRisk.creditLimit.toFixed(2)}).`;
    } else {
      advisoryMessage = `Babala (High Risk): Ang utang ni ${customer.name} ay aabot sa ₱${projectedBalance.toFixed(2)} (${Math.round(projectedRisk.utilizationPercent)}% ng ₱${projectedRisk.creditLimit.toFixed(2)} limit).`;
    }
  }

  return {
    addedAmount: cleanAdded,
    priorBalance: currentRisk.balance,
    projectedBalance,
    currentRisk,
    projectedRisk,
    triggersRedWarning,
    triggersAmberNotice,
    requiresWarningConfirmation: triggersRedWarning,
    canExtendCredit: true,
    warningMessage: advisoryMessage
  };
}

/**
 * Enriches a raw customer record with synchronized `balance`, `totalDebt`,
 * embedded `history` array, and predictive `risk` profile.
 *
 * @param {object} customer
 * @param {Array<object>} allTransactions
 * @returns {object}
 */
function enrichCustomer(customer, allTransactions = []) {
  const custHistory = (Array.isArray(allTransactions) ? allTransactions : [])
    .filter(tx => tx.customerId === customer.id)
    .sort((a, b) => {
      const tA = a.timestamp || a.date || "";
      const tB = b.timestamp || b.date || "";
      return tB.localeCompare(tA);
    });

  const risk = calculateCustomerRisk(customer, custHistory);

  return {
    ...customer,
    balance: risk.balance,
    totalDebt: risk.balance,
    creditLimit: risk.creditLimit,
    availableCredit: risk.availableCredit,
    overLimitAmount: risk.overLimitAmount,
    isOverLimit: risk.isOverLimit,
    daysOverdue: risk.daysOverdue,
    repaymentRate: risk.repaymentRate,
    utilizationRatio: risk.utilizationRatio,
    utilizationPercent: risk.utilizationPercent,
    progressPercent: risk.progressPercent,
    status: risk.status,
    riskStatus: risk.status,
    riskColor: risk.color,
    riskLabel: risk.label,
    dotClass: risk.dotClass,
    warningMessage: risk.warningMessage,
    canExtendCredit: true,
    requiresWarningConfirmation: risk.requiresWarningConfirmation,
    risk,
    history: custHistory
  };
}

/**
 * Zero-Floor Overpayment Guard & Sukli Calculator.
 * Ensures customer debt NEVER drops below ₱0.00 and computes exact change (sukli).
 *
 * @param {number} currentDebt
 * @param {number|string} tenderedInput - numeric amount or "FULL"
 * @returns {object}
 */
function calculatePaymentBreakdown(currentDebt, tenderedInput) {
  const safeCurrentDebt = round2(Math.max(0, currentDebt));
  const tenderedAmount =
    tenderedInput === "FULL" || tenderedInput === "full"
      ? safeCurrentDebt
      : round2(Number(tenderedInput));

  if (!Number.isFinite(tenderedAmount) || tenderedAmount <= 0) {
    throw new Error("Tendered payment amount must be greater than ₱0.00.");
  }

  // Zero-floor clamp: deducted amount cannot exceed current debt, remaining debt cannot be < 0
  const deductedAmount = round2(Math.min(tenderedAmount, safeCurrentDebt));
  const remainingDebt = round2(Math.max(0, safeCurrentDebt - deductedAmount));
  const sukli = round2(Math.max(0, tenderedAmount - deductedAmount));
  const isOverpayment = sukli > 0;

  return {
    priorDebt: safeCurrentDebt,
    tenderedAmount,
    deductedAmount,
    remainingDebt,
    sukli,
    isOverpayment,
    isFullSettlement: remainingDebt === 0 && safeCurrentDebt > 0
  };
}

/**
 * Builds store-wide summary metrics across all enriched customers and transactions.
 * @param {Array<object>} enrichedCustomers
 * @param {Array<object>} transactions
 * @returns {object}
 */
function buildStoreSummary(enrichedCustomers, transactions) {
  const totalCollectibles = round2(
    enrichedCustomers.reduce((sum, c) => sum + c.balance, 0)
  );
  const totalCreditLimit = round2(
    enrichedCustomers.reduce((sum, c) => sum + c.creditLimit, 0)
  );

  const safeCount = enrichedCustomers.filter(c => c.status === "safe").length;
  const watchCount = enrichedCustomers.filter(c => c.status === "watch").length;
  const dangerCount = enrichedCustomers.filter(c => c.status === "danger").length;
  const overLimitCount = enrichedCustomers.filter(c => c.isOverLimit).length;

  const todayIso = getTodayIso();
  const todayTxs = (transactions || []).filter(tx => tx.date === todayIso);
  const todayUtangTotal = round2(
    todayTxs.filter(tx => tx.type === "utang").reduce((s, tx) => s + round2(tx.amount), 0)
  );
  const todayPaymentTotal = round2(
    todayTxs.filter(tx => tx.type === "payment").reduce((s, tx) => s + round2(tx.amount), 0)
  );

  return {
    totalCustomers: enrichedCustomers.length,
    adaptiveListMode: enrichedCustomers.length > 5 ? "compact-searchable" : "standard",
    totalCollectibles,
    totalCreditLimit,
    overallUtilizationPercent: totalCreditLimit > 0 ? round2((totalCollectibles / totalCreditLimit) * 100) : 0,
    tierCounts: {
      safe: safeCount,
      watch: watchCount,
      danger: dangerCount,
      overLimit: overLimitCount
    },
    today: {
      date: todayIso,
      utangTotal: todayUtangTotal,
      paymentTotal: todayPaymentTotal,
      transactionCount: todayTxs.length
    }
  };
}

// ============================================================================
// Rapid-Tap Idempotency & Duplicate Request Guard
// ============================================================================

const recentIdempotencyCache = new Map();
const IDEMPOTENCY_TTL_MS = 60 * 1000;
const RAPID_FINGERPRINT_WINDOW_MS = 350;

function cleanupIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of recentIdempotencyCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      recentIdempotencyCache.delete(key);
    }
  }
}

/**
 * Checks whether an incoming mutation is an accidental rapid-tap duplicate.
 * @param {string|null} explicitKey
 * @param {string} fingerprint
 * @returns {object|null}
 */
function checkIdempotency(explicitKey, fingerprint) {
  cleanupIdempotencyCache();
  const now = Date.now();

  if (explicitKey) {
    const cached = recentIdempotencyCache.get(`key:${explicitKey}`);
    if (cached && now - cached.timestamp <= cached.ttl) {
      return cached.response;
    }
  }

  if (fingerprint) {
    const cachedFp = recentIdempotencyCache.get(`fp:${fingerprint}`);
    if (cachedFp && now - cachedFp.timestamp <= RAPID_FINGERPRINT_WINDOW_MS) {
      return cachedFp.response;
    }
  }

  return null;
}

function recordIdempotency(explicitKey, fingerprint, responsePayload) {
  const now = Date.now();
  if (explicitKey) {
    recentIdempotencyCache.set(`key:${explicitKey}`, {
      timestamp: now,
      ttl: IDEMPOTENCY_TTL_MS,
      response: responsePayload
    });
  }
  if (fingerprint) {
    recentIdempotencyCache.set(`fp:${fingerprint}`, {
      timestamp: now,
      ttl: RAPID_FINGERPRINT_WINDOW_MS,
      response: responsePayload
    });
  }
}

// ============================================================================
// Basket / Items Normalization Helper
// ============================================================================

/**
 * Parses flexible item inputs (array of items, basket map, or string summary)
 * and computes total amount & formatted summary string.
 *
 * @param {object} body
 * @param {Array<object>} products
 * @returns {{ amount: number, itemsSummary: string, itemList: Array<object> }}
 */
function normalizeUtangItemsAndAmount(body, products = []) {
  let computedSum = 0;
  const itemList = [];
  const summaryParts = [];

  // Case 1: Array of item objects `[{ id, name, qty, price }]`
  if (Array.isArray(body.itemList) || Array.isArray(body.items)) {
    const rawArr = Array.isArray(body.itemList) ? body.itemList : body.items;
    for (const entry of rawArr) {
      if (!entry) continue;
      if (typeof entry === "string") {
        summaryParts.push(entry.trim());
        continue;
      }
      const qty = Math.max(1, Number(entry.qty ?? entry.quantity ?? 1));
      const matchedProd = entry.id ? products.find(p => p.id === entry.id) : null;
      const price = round2(entry.price ?? (matchedProd ? matchedProd.price : 0));
      const name = (entry.name || (matchedProd ? matchedProd.name : "Paninda")).trim();
      const subtotal = round2(price * qty);
      computedSum = round2(computedSum + subtotal);
      itemList.push({
        id: entry.id || `custom_${itemList.length + 1}`,
        name,
        qty,
        price,
        subtotal
      });
      summaryParts.push(`${qty}x ${name}`);
    }
  }
  // Case 2: Basket object `{ items: { p1: 2, tingi_5: 1 }, total: 35 }`
  else if (body.basket && typeof body.basket === "object" && body.basket.items) {
    for (const [id, rawQty] of Object.entries(body.basket.items)) {
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (id.startsWith("tingi_")) {
        const val = round2(Number(id.replace("tingi_", "")));
        if (val > 0) {
          const subtotal = round2(val * qty);
          computedSum = round2(computedSum + subtotal);
          itemList.push({ id, name: `Tingi (₱${val})`, qty, price: val, subtotal });
          summaryParts.push(`${qty}x Tingi (₱${val})`);
        }
      } else {
        const prod = products.find(p => p.id === id);
        if (prod) {
          const subtotal = round2(prod.price * qty);
          computedSum = round2(computedSum + subtotal);
          itemList.push({ id: prod.id, name: prod.name, qty, price: prod.price, subtotal });
          summaryParts.push(`${qty}x ${prod.name}`);
        }
      }
    }
  }
  // Case 3: `items` is a map `{ p1: 2, tingi_5: 1 }`
  else if (body.items && typeof body.items === "object" && !Array.isArray(body.items)) {
    for (const [id, rawQty] of Object.entries(body.items)) {
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (id.startsWith("tingi_")) {
        const val = round2(Number(id.replace("tingi_", "")));
        if (val > 0) {
          const subtotal = round2(val * qty);
          computedSum = round2(computedSum + subtotal);
          itemList.push({ id, name: `Tingi (₱${val})`, qty, price: val, subtotal });
          summaryParts.push(`${qty}x Tingi (₱${val})`);
        }
      } else {
        const prod = products.find(p => p.id === id);
        if (prod) {
          const subtotal = round2(prod.price * qty);
          computedSum = round2(computedSum + subtotal);
          itemList.push({ id: prod.id, name: prod.name, qty, price: prod.price, subtotal });
          summaryParts.push(`${qty}x ${prod.name}`);
        }
      }
    }
  }

  const explicitAmount = round2(body.amount ?? body.total ?? (body.basket && body.basket.total) ?? 0);
  const finalAmount = explicitAmount > 0 ? explicitAmount : computedSum;

  let itemsSummary = "";
  if (typeof body.items === "string" && body.items.trim()) {
    itemsSummary = body.items.trim();
  } else if (typeof body.description === "string" && body.description.trim()) {
    itemsSummary = body.description.trim();
  } else if (summaryParts.length > 0) {
    itemsSummary = summaryParts.join(", ");
  } else if (finalAmount > 0) {
    itemsSummary = `Tingi / Sari-Sari (₱${finalAmount.toFixed(2)})`;
  }

  return {
    amount: finalAmount,
    itemsSummary,
    itemList
  };
}

// ============================================================================
// Express Middleware & Routes
// ============================================================================

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS headers for local development & testing
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Idempotency-Key");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Serve static frontend files from `public/`
app.use(express.static(PUBLIC_DIR));

/**
 * Helper to load database and enrich all state for API responses.
 */
function getEnrichedState() {
  const db = loadDatabase();
  const enrichedCustomers = db.customers.map(c => enrichCustomer(c, db.transactions));
  const summary = buildStoreSummary(enrichedCustomers, db.transactions);

  return {
    db,
    state: {
      metadata: db.metadata,
      customers: enrichedCustomers,
      products: db.products,
      stapleProducts: db.products,
      tingiPresets: db.tingiPresets || [1, 2, 5, 10, 15, 20, 50],
      quickPayPresets: db.quickPayPresets || [20, 50, 100, 200, 500, 1000],
      transactions: db.transactions,
      summary
    }
  };
}

// 1. Health Check
app.get("/api/health", (req, res) => {
  const { state } = getEnrichedState();
  res.json({
    status: "ok",
    service: "sarisync-speed-board-api",
    timestamp: new Date().toISOString(),
    dbPath: DB_PATH,
    customerCount: state.customers.length,
    productCount: state.products.length,
    transactionCount: state.transactions.length,
    features: {
      atomicPersistence: true,
      predictiveCreditRiskEngine: true,
      flexibleWarningMode: true,
      zeroFloorOverpaymentGuard: true,
      sukliCalculator: true
    }
  });
});

// 2. Full Enriched State / Bootstrap
function handleGetState(req, res) {
  try {
    const { state } = getEnrichedState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: "Failed to load store state", details: err.message });
  }
}

app.get("/api/state", handleGetState);
app.get("/api/bootstrap", handleGetState);

// 3. Get Products & Tingi Presets
app.get("/api/products", (req, res) => {
  try {
    const db = loadDatabase();
    res.json({
      products: db.products,
      tingiPresets: db.tingiPresets || [1, 2, 5, 10, 15, 20, 50],
      quickPayPresets: db.quickPayPresets || [20, 50, 100, 200, 500, 1000]
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load products", details: err.message });
  }
});

// 4. List Customers (with optional ?search= and ?status= filtering)
app.get("/api/customers", (req, res) => {
  try {
    const { state } = getEnrichedState();
    let results = state.customers;

    const search = (req.query.search || req.query.q || "").toString().trim().toLowerCase();
    if (search) {
      results = results.filter(
        c =>
          c.name.toLowerCase().includes(search) ||
          (c.phone && c.phone.toLowerCase().includes(search)) ||
          (c.notes && c.notes.toLowerCase().includes(search))
      );
    }

    const statusFilter = (req.query.status || req.query.risk || "").toString().trim().toLowerCase();
    if (statusFilter) {
      results = results.filter(
        c => c.status === statusFilter || c.riskColor === statusFilter
      );
    }

    res.json({
      customers: results,
      totalCount: state.customers.length,
      filteredCount: results.length,
      adaptiveListMode: state.customers.length > 5 ? "compact-searchable" : "standard",
      summary: state.summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customers", details: err.message });
  }
});

// 5. Get Single Customer with Full Predictive Risk & History
app.get("/api/customers/:id", (req, res) => {
  try {
    const { state } = getEnrichedState();
    const customer = state.customers.find(c => c.id === req.params.id);
    if (!customer) {
      return res.status(404).json({ error: `Customer '${req.params.id}' not found.` });
    }
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer", details: err.message });
  }
});

// 6. Create New Suki Customer
app.post("/api/customers", async (req, res) => {
  try {
    const { name, phone, creditLimit, avatar, notes, initialDebt } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim() : "";

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({
        error: "Pakilagay ang pangalan ng Suki (at least 2 characters)."
      });
    }

    const parsedLimit = creditLimit !== undefined && creditLimit !== "" ? round2(creditLimit) : 500.0;
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({
        error: "Ang Credit Limit ay dapat mas malaki sa ₱0.00."
      });
    }

    const parsedInitialDebt = initialDebt !== undefined ? round2(Math.max(0, initialDebt)) : 0.0;

    const db = loadDatabase();
    const duplicate = db.customers.find(
      c => c.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({
        error: `Mayroon nang suki na may pangalang '${cleanName}'.`,
        customer: enrichCustomer(duplicate, db.transactions)
      });
    }

    const newCustomer = {
      id: `c_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      name: cleanName,
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : "Walang #",
      avatar: typeof avatar === "string" && avatar.trim() ? avatar.trim() : "🧑",
      balance: parsedInitialDebt,
      totalDebt: parsedInitialDebt,
      creditLimit: parsedLimit,
      daysOverdue: 0,
      repaymentRate: 100,
      notes: typeof notes === "string" ? notes.trim() : "",
      createdAt: new Date().toISOString()
    };

    db.customers.push(newCustomer);

    if (parsedInitialDebt > 0) {
      db.transactions.unshift({
        id: `tx_${Date.now()}`,
        customerId: newCustomer.id,
        customerName: newCustomer.name,
        type: "utang",
        amount: parsedInitialDebt,
        items: "Panimulang balanse (Initial Utang)",
        priorBalance: 0,
        newBalance: parsedInitialDebt,
        date: getTodayIso(),
        timestamp: new Date().toISOString()
      });
    }

    await saveDatabaseAtomic(db);

    const enriched = enrichCustomer(newCustomer, db.transactions);
    const allEnriched = db.customers.map(c => enrichCustomer(c, db.transactions));

    res.status(201).json({
      message: `Idinagdag si ${newCustomer.name} sa listahan ng Suki!`,
      customer: enriched,
      customers: allEnriched,
      summary: buildStoreSummary(allEnriched, db.transactions)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create customer", details: err.message });
  }
});

// 7. Update Customer Details / Credit Limit
async function handleUpdateCustomer(req, res) {
  try {
    const db = loadDatabase();
    const idx = db.customers.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: `Customer '${req.params.id}' not found.` });
    }

    const target = db.customers[idx];
    const { name, phone, creditLimit, avatar, notes } = req.body || {};

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (cleanName.length < 2) {
        return res.status(400).json({ error: "Customer name must be at least 2 characters." });
      }
      target.name = cleanName;
    }

    if (phone !== undefined) {
      target.phone = String(phone).trim() || "Walang #";
    }

    if (creditLimit !== undefined) {
      const parsedLimit = round2(creditLimit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: "Credit limit must be greater than ₱0.00." });
      }
      target.creditLimit = parsedLimit;
    }

    if (avatar !== undefined && String(avatar).trim()) {
      target.avatar = String(avatar).trim();
    }

    if (notes !== undefined) {
      target.notes = String(notes).trim();
    }

    await saveDatabaseAtomic(db);

    const enriched = enrichCustomer(target, db.transactions);
    const allEnriched = db.customers.map(c => enrichCustomer(c, db.transactions));

    res.json({
      message: `Na-update ang detalye ni ${target.name}.`,
      customer: enriched,
      customers: allEnriched,
      summary: buildStoreSummary(allEnriched, db.transactions)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update customer", details: err.message });
  }
}

app.patch("/api/customers/:id", handleUpdateCustomer);
app.put("/api/customers/:id", handleUpdateCustomer);

// 8. List Transactions (with optional ?customerId=, ?date=, ?type= filters)
app.get("/api/transactions", (req, res) => {
  try {
    const db = loadDatabase();
    let txs = db.transactions.slice();

    if (req.query.customerId) {
      txs = txs.filter(t => t.customerId === req.query.customerId);
    }
    if (req.query.date) {
      txs = txs.filter(t => t.date === req.query.date);
    }
    if (req.query.type) {
      txs = txs.filter(t => t.type === req.query.type);
    }

    res.json({
      transactions: txs,
      count: txs.length
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load transactions", details: err.message });
  }
});

// 9. Preview Utang Risk Assessment (non-mutating dry run)
app.post("/api/transactions/utang/preview", (req, res) => {
  try {
    const db = loadDatabase();
    const { customerId } = req.body || {};
    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found." });
    }

    const { amount, itemsSummary } = normalizeUtangItemsAndAmount(req.body || {}, db.products);
    if (amount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than ₱0.00." });
    }

    const evaluation = evaluateUtangTransactionRisk(customer, amount, db.transactions);
    res.json({
      ...evaluation,
      itemsSummary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to preview utang risk", details: err.message });
  }
});

// 10. Commit Utang Transaction (`POST /api/transactions/utang` & `POST /api/utang`)
async function handleCreateUtang(req, res) {
  try {
    const body = req.body || {};
    const customerId = body.customerId;
    if (!customerId) {
      return res.status(400).json({ error: "Pakipili muna ang Suki customer (`customerId` is required)." });
    }

    const db = loadDatabase();
    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) {
      return res.status(404).json({ error: `Customer '${customerId}' not found.` });
    }

    const { amount, itemsSummary, itemList } = normalizeUtangItemsAndAmount(body, db.products);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Pumili muna ng paninda o halaga na mas malaki sa ₱0.00."
      });
    }

    // Dry-run support if caller passes `dryRun: true`
    const riskEvaluation = evaluateUtangTransactionRisk(customer, amount, db.transactions);
    if (body.dryRun === true) {
      return res.json({
        dryRun: true,
        ...riskEvaluation,
        itemsSummary
      });
    }

    // Flexible Warning Mode check:
    // If caller explicitly sets `requireConfirmation: true` (two-step modal flow) and has not
    // acknowledged the warning yet (`!acknowledgeWarning && !forceOverride`), return a 409 advisory
    // so the frontend can pop up the confirmation dialog. Otherwise, allow & record immediately!
    const isWarningAcknowledged = Boolean(
      body.acknowledgeWarning || body.forceOverride || body.warningAcknowledged
    );

    if (
      body.requireConfirmation === true &&
      riskEvaluation.requiresWarningConfirmation &&
      !isWarningAcknowledged
    ) {
      return res.status(409).json({
        requiresWarningConfirmation: true,
        canExtendCredit: true,
        warningMessage: riskEvaluation.warningMessage,
        customer: enrichCustomer(customer, db.transactions),
        riskEvaluation
      });
    }

    // Rapid-tap idempotency check
    const idempotencyKey = req.headers["x-idempotency-key"] || body.idempotencyKey || null;
    const fingerprint = `utang:${customerId}:${amount.toFixed(2)}:${itemsSummary}`;
    const cachedReplay = checkIdempotency(idempotencyKey, fingerprint);
    if (cachedReplay) {
      return res.status(200).json({ ...cachedReplay, idempotentReplay: true });
    }

    const priorBalance = round2(customer.balance ?? customer.totalDebt ?? 0);
    const newBalance = round2(priorBalance + amount);
    const txDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getTodayIso();

    customer.balance = newBalance;
    customer.totalDebt = newBalance;

    const newTx = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      customerId: customer.id,
      customerName: customer.name,
      type: "utang",
      amount,
      items: itemsSummary,
      itemList: itemList.length > 0 ? itemList : undefined,
      priorBalance,
      newBalance,
      warningTriggered: riskEvaluation.requiresWarningConfirmation,
      warningAcknowledged: riskEvaluation.requiresWarningConfirmation ? true : undefined,
      date: txDate,
      timestamp: new Date().toISOString()
    };

    db.transactions.unshift(newTx);
    await saveDatabaseAtomic(db);

    const updatedCustomer = enrichCustomer(customer, db.transactions);
    const allCustomers = db.customers.map(c => enrichCustomer(c, db.transactions));
    const summary = buildStoreSummary(allCustomers, db.transactions);

    const responsePayload = {
      message: `Nailista: ₱${amount.toFixed(2)} kay ${customer.name}!`,
      transaction: newTx,
      customer: updatedCustomer,
      customers: allCustomers,
      riskAssessment: {
        priorStatus: riskEvaluation.currentRisk.status,
        newStatus: updatedCustomer.status,
        utilizationPercent: updatedCustomer.utilizationPercent,
        isOverLimit: updatedCustomer.isOverLimit,
        warningTriggered: riskEvaluation.requiresWarningConfirmation,
        warningMessage: updatedCustomer.warningMessage,
        canExtendCredit: true
      },
      summary
    };

    recordIdempotency(idempotencyKey, fingerprint, responsePayload);
    res.status(201).json(responsePayload);
  } catch (err) {
    res.status(500).json({ error: "Failed to record utang transaction", details: err.message });
  }
}

app.post("/api/transactions/utang", handleCreateUtang);
app.post("/api/utang", handleCreateUtang);

// 11. Commit Repayment Transaction (`POST /api/transactions/payment` & `POST /api/bayad`)
async function handleCreatePayment(req, res) {
  try {
    const body = req.body || {};
    const customerId = body.customerId;
    if (!customerId) {
      return res.status(400).json({ error: "Pakipili muna ang Suki customer (`customerId` is required)." });
    }

    const db = loadDatabase();
    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) {
      return res.status(404).json({ error: `Customer '${customerId}' not found.` });
    }

    const currentDebt = round2(Math.max(0, customer.balance ?? customer.totalDebt ?? 0));
    if (currentDebt <= 0) {
      return res.status(400).json({
        error: `Wala nang natitirang utang si ${customer.name} (₱0.00 balance).`,
        customer: enrichCustomer(customer, db.transactions)
      });
    }

    const rawTender =
      body.denomination === "FULL" || body.tenderedAmount === "FULL" || body.amount === "FULL"
        ? "FULL"
        : (body.tenderedAmount ?? body.tendered ?? body.amount ?? body.denomination);

    let breakdown;
    try {
      breakdown = calculatePaymentBreakdown(currentDebt, rawTender);
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    // Rapid-tap idempotency check
    const idempotencyKey = req.headers["x-idempotency-key"] || body.idempotencyKey || null;
    const fingerprint = `payment:${customerId}:${breakdown.tenderedAmount.toFixed(2)}:${currentDebt.toFixed(2)}`;
    const cachedReplay = checkIdempotency(idempotencyKey, fingerprint);
    if (cachedReplay) {
      return res.status(200).json({ ...cachedReplay, idempotentReplay: true });
    }

    const txDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getTodayIso();

    // Update customer balance with strict zero-floor clamp
    customer.balance = breakdown.remainingDebt;
    customer.totalDebt = breakdown.remainingDebt;

    if (breakdown.remainingDebt === 0) {
      customer.daysOverdue = 0;
      customer.repaymentRate = Math.min(100, Math.max(customer.repaymentRate || 90, 95));
    } else {
      customer.repaymentRate = Math.min(100, (customer.repaymentRate || 80) + 2);
    }

    const newTx = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      customerId: customer.id,
      customerName: customer.name,
      type: "payment",
      amount: breakdown.deductedAmount,
      tendered: breakdown.tenderedAmount,
      tenderedAmount: breakdown.tenderedAmount,
      deductedAmount: breakdown.deductedAmount,
      sukli: breakdown.sukli,
      isOverpayment: breakdown.isOverpayment,
      items: body.notes ? String(body.notes).trim() : "Cash payment",
      priorBalance: breakdown.priorDebt,
      newBalance: breakdown.remainingDebt,
      date: txDate,
      timestamp: new Date().toISOString()
    };

    db.transactions.unshift(newTx);
    await saveDatabaseAtomic(db);

    const updatedCustomer = enrichCustomer(customer, db.transactions);
    const allCustomers = db.customers.map(c => enrichCustomer(c, db.transactions));
    const summary = buildStoreSummary(allCustomers, db.transactions);

    const responsePayload = {
      message:
        breakdown.sukli > 0
          ? `Bayad natanggap! Ibalik na Sukli: ₱${breakdown.sukli.toFixed(2)} kay ${customer.name}.`
          : `Bayad natanggap: ₱${breakdown.deductedAmount.toFixed(2)} mula kay ${customer.name}!`,
      transaction: newTx,
      customer: updatedCustomer,
      customers: allCustomers,
      paymentSummary: {
        customerName: customer.name,
        priorDebt: breakdown.priorDebt,
        tenderedAmount: breakdown.tenderedAmount,
        deductedAmount: breakdown.deductedAmount,
        remainingDebt: breakdown.remainingDebt,
        sukli: breakdown.sukli,
        isOverpayment: breakdown.isOverpayment,
        isFullSettlement: breakdown.isFullSettlement
      },
      summary
    };

    recordIdempotency(idempotencyKey, fingerprint, responsePayload);
    res.status(201).json(responsePayload);
  } catch (err) {
    res.status(500).json({ error: "Failed to record payment transaction", details: err.message });
  }
}

app.post("/api/transactions/payment", handleCreatePayment);
app.post("/api/bayad", handleCreatePayment);

// 12. Reset Database to Clean Factory Seed State
app.post("/api/reset", async (req, res) => {
  try {
    recentIdempotencyCache.clear();
    const seed = getInitialSeedData();
    await saveDatabaseAtomic(seed);
    const { state } = getEnrichedState();
    res.json({
      message: "Na-reset na ang SariSync sa panimulang talaan!",
      ...state
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset database", details: err.message });
  }
});

// SPA Fallback for non-API GET routes when `public/index.html` exists
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  }
  const indexHtmlPath = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }
  res.status(200).send("SariSync Speed Board Backend API is running. Visit /api/health or /api/state.");
});

/**
 * In-memory HTTP request dispatcher for unit & integration testing (`npm test`)
 * without requiring a TCP loopback socket.
 *
 * @param {string} method - GET, POST, PATCH, PUT, DELETE
 * @param {string} urlPath - e.g. "/api/state"
 * @param {object} [body] - JSON request body
 * @param {object} [headers] - Optional HTTP headers
 * @returns {Promise<{ statusCode: number, headers: object, body: any, text: string }>}
 */
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
      setHeader(name, val) {
        resHeaders[name.toLowerCase()] = val;
      },
      getHeader(name) {
        return resHeaders[name.toLowerCase()];
      },
      end(data) {
        if (this.writableEnded) return;
        this.writableEnded = true;
        this.headersSent = true;
        if (data !== undefined && data !== null) {
          chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8"));
        }
        const text = Buffer.concat(chunks).toString("utf8");
        let parsedBody = text;
        try {
          parsedBody = JSON.parse(text);
        } catch (_) {}
        resolve({
          statusCode: this.statusCode,
          headers: resHeaders,
          body: parsedBody,
          text
        });
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
// Server Startup & Module Exports
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
  DB_PATH
};
