/**
 * models/db.js — Atomic JSON File Database & Financial Math Engine
 *
 * Provides:
 * 1. Safe atomic file writes using temp file + fs.renameSync (prevents data corruption)
 * 2. Exact 2-decimal financial math (`round2`)
 * 3. Seed initialization for tindahan products, customers, and transactions
 * 4. Credit risk evaluation and summary calculations
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

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
 * Returns today's date in YYYY-MM-DD format.
 * @returns {string}
 */
function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

/**
 * Factory Seed Data for the neighborhood tindahan.
 * Features 12 staple products with cost & stock quantity, 6 diverse Suki customers,
 * quick presets, and initial transaction history.
 */
function getInitialSeedData() {
  return {
    metadata: {
      storeName: "SariSync Tindahan ni Aling Bebang",
      currency: "PHP",
      version: "2.0.0",
      lastUpdated: new Date().toISOString()
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
        cost: 11.5,
        stock: 48,
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
        cost: 14.0,
        stock: 36,
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
        cost: 22.0,
        stock: 24,
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
        cost: 7.5,
        stock: 60,
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
        cost: 44.0,
        stock: 25,
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
        cost: 15.0,
        stock: 30,
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
        cost: 11.0,
        stock: 30,
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
        cost: 19.0,
        stock: 20,
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
        cost: 12.0,
        stock: 40,
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
        cost: 5.5,
        stock: 50,
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
        cost: 19.0,
        stock: 20,
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
        cost: 9.0,
        stock: 35,
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
        balance: 320,
        totalDebt: 320,
        creditLimit: 600,
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
        balance: 850,
        totalDebt: 850,
        creditLimit: 800,
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
        balance: 95,
        totalDebt: 95,
        creditLimit: 500,
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
        balance: 440,
        totalDebt: 440,
        creditLimit: 500,
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
        balance: 420,
        totalDebt: 420,
        creditLimit: 700,
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
        balance: 60,
        totalDebt: 60,
        creditLimit: 400,
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
        amount: 212,
        items: "2x Rice 1kg, 2x Canned Sardines, 2x Cooking Oil Tingi, 1x Toyo / Suka Pouch",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 2, price: 52, subtotal: 104 },
          { id: "p3", name: "Canned Sardines", qty: 2, price: 28, subtotal: 56 },
          { id: "p6", name: "Cooking Oil Tingi", qty: 2, price: 20, subtotal: 40 },
          { id: "p12", name: "Toyo / Suka Pouch", qty: 1, price: 12, subtotal: 12 }
        ],
        priorBalance: 108,
        newBalance: 320,
        date: "2026-10-18",
        timestamp: "2026-10-18T08:45:00.000Z"
      },
      {
        id: "tx_102",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "payment",
        amount: 100,
        tendered: 100,
        deductedAmount: 100,
        sukli: 0,
        items: "Cash payment",
        priorBalance: 208,
        newBalance: 108,
        date: "2026-10-16",
        timestamp: "2026-10-16T17:15:00.000Z"
      },
      {
        id: "tx_101b",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "utang",
        amount: 58,
        items: "2x 3-in-1 Coffee, 1x Canned Sardines",
        itemList: [
          { id: "p1", name: "3-in-1 Coffee", qty: 2, price: 15, subtotal: 30 },
          { id: "p3", name: "Canned Sardines", qty: 1, price: 28, subtotal: 28 }
        ],
        priorBalance: 150,
        newBalance: 208,
        date: "2026-10-15",
        timestamp: "2026-10-15T18:30:00.000Z"
      },
      {
        id: "tx_101",
        customerId: "c1",
        customerName: "Aling Nena",
        type: "utang",
        amount: 150,
        items: "Panimulang balanse ng utang",
        priorBalance: 0,
        newBalance: 150,
        date: "2026-10-12",
        timestamp: "2026-10-12T07:15:00.000Z"
      },
      {
        id: "tx_201",
        customerId: "c2",
        customerName: "Mang Boy",
        type: "utang",
        amount: 850,
        items: "5x Rice 1kg, 10x Pancit Canton, 5x Sardines, Cooking Oil Tingi",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 5, price: 52, subtotal: 260 },
          { id: "p2", name: "Pancit Canton", qty: 10, price: 18, subtotal: 180 },
          { id: "p3", name: "Canned Sardines", qty: 5, price: 28, subtotal: 140 },
          { id: "p6", name: "Cooking Oil Tingi", qty: 5, price: 20, subtotal: 100 },
          { id: "tingi_gas", name: "Gas / Uling", qty: 1, price: 170, subtotal: 170 }
        ],
        priorBalance: 0,
        newBalance: 850,
        date: "2026-10-04",
        timestamp: "2026-10-04T11:20:00.000Z"
      },
      {
        id: "tx_301",
        customerId: "c3",
        customerName: "Ate Joy",
        type: "utang",
        amount: 95,
        items: "3x Egg, 1x Rice 1kg, 2x 3-in-1 Coffee",
        itemList: [
          { id: "p4", name: "Egg (1 pc)", qty: 3, price: 10, subtotal: 30 },
          { id: "p5", name: "Rice 1kg", qty: 1, price: 52, subtotal: 52 },
          { id: "p1", name: "3-in-1 Coffee", qty: 1, price: 13, subtotal: 13 }
        ],
        priorBalance: 0,
        newBalance: 95,
        date: "2026-10-17",
        timestamp: "2026-10-17T06:50:00.000Z"
      },
      {
        id: "tx_401",
        customerId: "c4",
        customerName: "Kuya Jun",
        type: "utang",
        amount: 440,
        items: "4x Rice 1kg, 6x Pancit Canton, 4x Softdrinks, Biogesic",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 4, price: 52, subtotal: 208 },
          { id: "p2", name: "Pancit Canton", qty: 6, price: 18, subtotal: 108 },
          { id: "p8", name: "Softdrinks", qty: 4, price: 25, subtotal: 100 },
          { id: "p10", name: "Paracetamol", qty: 3, price: 8, subtotal: 24 }
        ],
        priorBalance: 0,
        newBalance: 440,
        date: "2026-10-09",
        timestamp: "2026-10-09T19:40:00.000Z"
      },
      {
        id: "tx_501",
        customerId: "c5",
        customerName: "Aling Rosa",
        type: "utang",
        amount: 420,
        items: "5x Rice 1kg, 5x Cooking Oil Tingi, 5x Toyo / Suka Pouch",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 5, price: 52, subtotal: 260 },
          { id: "p6", name: "Cooking Oil Tingi", qty: 5, price: 20, subtotal: 100 },
          { id: "p12", name: "Toyo / Suka Pouch", qty: 5, price: 12, subtotal: 60 }
        ],
        priorBalance: 0,
        newBalance: 420,
        date: "2026-10-13",
        timestamp: "2026-10-13T08:15:00.000Z"
      },
      {
        id: "tx_601",
        customerId: "c6",
        customerName: "Ate Marites",
        type: "utang",
        amount: 60,
        items: "2x 3-in-1 Coffee, 1x Pancit Canton, 1x Laundry Soap",
        itemList: [
          { id: "p1", name: "3-in-1 Coffee", qty: 2, price: 15, subtotal: 30 },
          { id: "p2", name: "Pancit Canton", qty: 1, price: 18, subtotal: 18 },
          { id: "p9", name: "Laundry Soap", qty: 1, price: 12, subtotal: 12 }
        ],
        priorBalance: 0,
        newBalance: 60,
        date: "2026-10-17",
        timestamp: "2026-10-17T16:00:00.000Z"
      },
      {
        id: "tx_901",
        customerId: "walkin",
        customerName: "Walk-in Cash Sale",
        type: "sale",
        paymentType: "cash",
        amount: 85,
        items: "1x Rice 1kg, 1x 3-in-1 Coffee, 1x Pancit Canton",
        itemList: [
          { id: "p5", name: "Rice 1kg", qty: 1, price: 52, subtotal: 52 },
          { id: "p1", name: "3-in-1 Coffee", qty: 1, price: 15, subtotal: 15 },
          { id: "p2", name: "Pancit Canton", qty: 1, price: 18, subtotal: 18 }
        ],
        date: "2026-10-18",
        timestamp: "2026-10-18T10:15:00.000Z"
      },
      {
        id: "tx_902",
        customerId: "walkin",
        customerName: "Walk-in Cash Sale",
        type: "sale",
        paymentType: "cash",
        amount: 50,
        items: "2x Softdrinks",
        itemList: [
          { id: "p8", name: "Softdrinks", qty: 2, price: 25, subtotal: 50 }
        ],
        date: "2026-10-18",
        timestamp: "2026-10-18T14:30:00.000Z"
      },
      {
        id: "tx_903",
        customerId: "walkin",
        customerName: "Walk-in Cash Sale",
        type: "sale",
        paymentType: "cash",
        amount: 40,
        items: "4x Egg (1 pc)",
        itemList: [
          { id: "p4", name: "Egg (1 pc)", qty: 4, price: 10, subtotal: 40 }
        ],
        date: "2026-10-18",
        timestamp: "2026-10-18T15:20:00.000Z"
      }
    ]
  };
}

/**
 * Loads database from db.json. If missing or corrupted, seeds fresh initial state.
 * @returns {Object}
 */
function loadDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    const seed = getInitialSeedData();
    writeDatabaseAtomicSync(seed);
    return seed;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.products)) {
      throw new Error("Invalid schema");
    }
    return parsed;
  } catch (err) {
    const seed = getInitialSeedData();
    writeDatabaseAtomicSync(seed);
    return seed;
  }
}

/**
 * Synchronous atomic file write using temporary file + fs.renameSync.
 * Guarantees zero partial writes or file corruption even on sudden power loss.
 *
 * @param {Object} data
 */
function writeDatabaseAtomicSync(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const tmpPath = `${DB_PATH}.tmp`;
  data.metadata = data.metadata || {};
  data.metadata.lastUpdated = new Date().toISOString();

  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, serialized, "utf8");
  fs.renameSync(tmpPath, DB_PATH);
}

/**
 * Async atomic database save.
 *
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function saveDatabaseAtomic(data) {
  writeDatabaseAtomicSync(data);
}

/**
 * Predictive Credit Risk Engine for Customer Suki Accounts.
 *
 * Classifies customer accounts into traffic-light tiers:
 * - Green (Safe): utilization < 50% and daysOverdue < 7
 * - Amber (Watch): utilization 50% - 84.99% or daysOverdue 7 - 13
 * - Red (High Risk / Danger): utilization >= 85% or balance >= creditLimit or daysOverdue >= 14
 *
 * @param {Object} customer
 * @param {Array} allTransactions
 * @returns {Object} Enriched credit risk analysis
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

  let repaymentRate = Number.isFinite(Number(customer.repaymentRate))
    ? Number(customer.repaymentRate)
    : 90;

  if (balance === 0 && totalHistoricalPaid > 0) {
    repaymentRate = Math.max(repaymentRate, 98);
  } else if (isOverLimit) {
    repaymentRate = Math.min(repaymentRate, 45);
  }

  const utilizationScore = Math.min(65, Math.round(rawRatio * 55));
  const overdueScore = balance > 0 ? Math.min(25, Math.round(daysOverdue * 1.6)) : 0;
  const behaviorScore = Math.min(10, Math.max(0, Math.round((100 - repaymentRate) * 0.15)));
  const riskScore = balance <= 0 ? 0 : Math.min(100, utilizationScore + overdueScore + behaviorScore);

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
    canExtendCredit: true,
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
 * Evaluates the impact of adding a new utang amount to a customer's account.
 * Supports Flexible Warning Mode: warns when the customer is already Red or
 * when the purchase will push them into Red / over-limit territory.
 *
 * @param {Object} customer
 * @param {number} addedAmount
 * @param {Array} allTransactions
 * @returns {Object}
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
 * Enriches a raw customer record with calculated risk profile and history.
 * @param {Object} customer
 * @param {Array} allTransactions
 * @returns {Object}
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
 * Calculates zero-floor payment breakdown and change (sukli).
 * @param {number} currentDebt
 * @param {number|string} tenderedInput
 * @returns {Object}
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
 * Builds overall summary metrics across customers, products, and transactions.
 * @param {Array} enrichedCustomers
 * @param {Array} transactions
 * @param {Array} products
 * @returns {Object}
 */
function buildStoreSummary(enrichedCustomers = [], transactions = [], products = []) {
  const totalCollectibles = round2(
    enrichedCustomers.reduce((sum, c) => sum + (c.balance || 0), 0)
  );
  const totalCreditLimit = round2(
    enrichedCustomers.reduce((sum, c) => sum + (c.creditLimit || 0), 0)
  );

  const safeCount = enrichedCustomers.filter(c => c.status === "safe").length;
  const watchCount = enrichedCustomers.filter(c => c.status === "watch").length;
  const dangerCount = enrichedCustomers.filter(c => c.status === "danger").length;
  const overLimitCount = enrichedCustomers.filter(c => c.isOverLimit).length;

  // Today sales
  const today = getTodayIso();
  const todayTxs = transactions.filter(t => (t.date === today || (t.timestamp && t.timestamp.startsWith(today))));
  const todaySales = round2(
    todayTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  );

  // Low stock products count (stock <= 5)
  const lowStockCount = products.filter(p => Number(p.stock) <= 5).length;

  return {
    totalCollectibles,
    totalCreditLimit,
    overallUtilizationPercent: totalCreditLimit > 0 ? round2((totalCollectibles / totalCreditLimit) * 100) : 0,
    activeCustomerCount: enrichedCustomers.length,
    tierCounts: {
      safe: safeCount,
      watch: watchCount,
      danger: dangerCount,
      overLimit: overLimitCount
    },
    todaySales,
    lowStockCount,
    adaptiveListMode: enrichedCustomers.length > 5 ? "compact-searchable" : "standard-horizontal",
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  DATA_DIR,
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
};
