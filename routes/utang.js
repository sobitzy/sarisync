/**
 * routes/utang.js — Utang Ledger, Credit Commit & Payment Router
 *
 * Utilizes the BankAccount-style `UtangAccount` class to handle:
 * - `deposit(amount)`: Repayment with Zero-Floor Guard & exact Sukli calculation
 * - `addUtang(amount)`: Credit logging with Flexible Warning Mode for Red accounts
 * - Rapid-tap idempotency protection
 *
 * Endpoints:
 * - POST   /api/utang/payments            - Record repayment using UtangAccount.deposit()
 * - POST   /api/customers/:id/deposit     - Suki-specific deposit endpoint
 * - POST   /api/transactions/payment      - Alias for payment
 * - POST   /api/bayad                     - Alias for payment
 * - POST   /api/transactions/utang        - Record utang with flexible warning checks
 * - POST   /api/utang                     - Alias for utang
 * - POST   /api/transactions/utang/preview - Dry-run preview of debt addition
 * - GET    /api/utang/payments            - List utang payment history
 * - GET    /api/transactions              - List all ledger transactions
 * - DELETE /api/transactions/:id          - Void/delete a mistaken transaction
 */

const express = require("../lib/express");
const router = express.Router();
const UtangAccount = require("../models/UtangAccount");
const {
  loadDatabase,
  saveDatabaseAtomic,
  enrichCustomer,
  buildStoreSummary,
  evaluateUtangTransactionRisk,
  calculatePaymentBreakdown,
  round2,
  getTodayIso
} = require("../models/db");

// Simple in-memory idempotency cache (TTL: 10 seconds)
const idempotencyCache = new Map();
function cleanOldIdempotencyKeys() {
  const now = Date.now();
  for (const [key, item] of idempotencyCache.entries()) {
    if (now - item.timestamp > 10000) {
      idempotencyCache.delete(key);
    }
  }
}

// 1. POST /api/transactions/payment (and aliases) — Record a repayment using UtangAccount.deposit()
const handlePayment = async (req, res) => {
  try {
    cleanOldIdempotencyKeys();
    const body = req.body || {};
    const customerId = req.params.id || body.customerId;
    const tendered = body.tenderedAmount !== undefined ? body.tenderedAmount : body.amount;
    const notes = body.notes || "Cash payment";

    const idempotencyKey = req.headers["x-idempotency-key"] || body.idempotencyKey;
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey);
      return res.status(200).json({ ...cached.response, idempotentReplay: true });
    }

    if (!customerId) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    const db = loadDatabase();
    db.customers = db.customers || [];
    db.transactions = db.transactions || [];

    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const currentDebt = round2(customer.balance ?? customer.totalDebt ?? 0);
    if (currentDebt <= 0) {
      return res.status(400).json({
        error: `Walang natitirang utang si ${customer.name}. Hindi kailangang magbayad.`
      });
    }

    // Instantiate BankAccount-style UtangAccount and call deposit()
    const account = new UtangAccount(customer);
    const result = account.deposit(tendered, notes);

    // Save updated balance back to database
    customer.balance = account.getBalance();
    customer.totalDebt = account.getBalance();
    customer.daysOverdue = account.daysOverdue;
    customer.repaymentRate = account.repaymentRate;

    const newTx = result.transaction;
    db.transactions.unshift(newTx);
    await saveDatabaseAtomic(db);

    const updatedCustomer = enrichCustomer(customer, db.transactions);
    const allCustomers = db.customers.map(c => enrichCustomer(c, db.transactions));
    const summary = buildStoreSummary(allCustomers, db.transactions, db.products || []);

    const responsePayload = {
      success: true,
      message:
        result.sukli > 0
          ? `Bayad natanggap! Ibalik na Sukli: ₱${result.sukli.toFixed(2)} kay ${customer.name}.`
          : `Bayad natanggap: ₱${result.deductedAmount.toFixed(2)} mula kay ${customer.name}!`,
      transaction: newTx,
      customer: updatedCustomer,
      customers: allCustomers,
      paymentSummary: {
        customerName: customer.name,
        priorDebt: result.priorDebt,
        tenderedAmount: result.tenderedAmount,
        deductedAmount: result.deductedAmount,
        remainingDebt: result.remainingDebt,
        sukli: result.sukli,
        isOverpayment: result.isOverpayment,
        isFullSettlement: result.isFullSettlement
      },
      summary
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { response: responsePayload, timestamp: Date.now() });
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    const isBadReq = err.message && (err.message.includes("positive number") || err.message.includes("greater than"));
    res.status(isBadReq ? 400 : 500).json({ error: err.message || "Failed to process payment" });
  }
};

router.post("/payments", handlePayment);
router.post("/payment", handlePayment);
router.post("/deposit", handlePayment);

// 2. POST /api/transactions/utang/preview — Dry-run preview
router.post("/preview", (req, res) => {
  try {
    const { customerId, amount } = req.body;
    if (!customerId) return res.status(400).json({ error: "Customer ID is required" });

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const db = loadDatabase();
    const customer = (db.customers || []).find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const riskEvaluation = evaluateUtangTransactionRisk(customer, numAmount, db.transactions || []);
    res.json(riskEvaluation);
  } catch (err) {
    res.status(500).json({ error: "Failed to preview utang", details: err.message });
  }
});

// 3. POST /api/transactions/utang — Record utang with Flexible Warning Mode
const handleUtang = async (req, res) => {
  try {
    cleanOldIdempotencyKeys();
    const body = req.body || {};
    const customerId = body.customerId;
    const items = body.items || body.itemList || "Store goods credit";

    const idempotencyKey = req.headers["x-idempotency-key"] || body.idempotencyKey;
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey);
      return res.status(200).json({ ...cached.response, idempotentReplay: true });
    }

    if (!customerId) return res.status(400).json({ error: "Customer ID is required" });

    let amount = Number(body.amount);
    if ((!Number.isFinite(amount) || amount <= 0) && Array.isArray(body.itemList)) {
      amount = body.itemList.reduce((sum, item) => sum + (Number(item.qty || 1) * Number(item.price || 0)), 0);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Utang amount must be a positive number" });
    }

    const db = loadDatabase();
    db.customers = db.customers || [];
    db.transactions = db.transactions || [];

    const customer = db.customers.find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Flexible Warning Mode check
    const riskEval = evaluateUtangTransactionRisk(customer, amount, db.transactions);

    // If requireConfirmation is requested and warning is triggered without acknowledgement -> return 409
    if (body.requireConfirmation && riskEval.triggersRedWarning && !body.acknowledgeWarning && !body.forceOverride) {
      return res.status(409).json({
        warning: true,
        requiresWarningConfirmation: true,
        canExtendCredit: true,
        warningMessage: riskEval.warningMessage,
        currentBalance: riskEval.priorBalance,
        addedAmount: riskEval.addedAmount,
        projectedBalance: riskEval.projectedBalance,
        creditLimit: riskEval.projectedRisk.creditLimit,
        customerName: customer.name
      });
    }

    // Use BankAccount-style UtangAccount class to add debt
    const account = new UtangAccount(customer);
    const result = account.addUtang(amount, items);

    // Save updated customer balance back to db
    customer.balance = account.getBalance();
    customer.totalDebt = account.getBalance();

    const newTx = result.transaction;
    if (riskEval.triggersRedWarning) {
      newTx.warningTriggered = true;
      newTx.warningAcknowledged = Boolean(body.acknowledgeWarning || body.forceOverride);
    }

    db.transactions.unshift(newTx);
    await saveDatabaseAtomic(db);

    const updatedCustomer = enrichCustomer(customer, db.transactions);
    const allCustomers = db.customers.map(c => enrichCustomer(c, db.transactions));
    const summary = buildStoreSummary(allCustomers, db.transactions, db.products || []);

    const responsePayload = {
      success: true,
      message: `Nailista ang utang na ₱${round2(amount).toFixed(2)} kay ${customer.name}.`,
      transaction: newTx,
      customer: updatedCustomer,
      customers: allCustomers,
      riskAssessment: {
        canExtendCredit: true,
        status: updatedCustomer.status,
        color: updatedCustomer.riskColor,
        isOverLimit: updatedCustomer.isOverLimit
      },
      summary
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { response: responsePayload, timestamp: Date.now() });
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    const isBadReq = err.message && err.message.includes("positive number");
    res.status(isBadReq ? 400 : 500).json({ error: err.message || "Failed to record utang" });
  }
};

router.post("/utang", handleUtang);

// 4. GET /api/transactions (and /api/utang/payments) — List ledger transactions
router.get("/", (req, res) => {
  try {
    const db = loadDatabase();
    let txs = db.transactions || [];

    if (req.query.customerId) {
      txs = txs.filter(t => t.customerId === req.query.customerId);
    }
    if (req.query.type) {
      txs = txs.filter(t => t.type === req.query.type);
    }

    res.json({
      success: true,
      count: txs.length,
      transactions: txs
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list transactions", details: err.message });
  }
});

// 5. DELETE /api/transactions/:id — Void/revert a mistaken transaction
router.delete("/:id", async (req, res) => {
  try {
    const db = loadDatabase();
    db.transactions = db.transactions || [];
    db.customers = db.customers || [];

    const index = db.transactions.findIndex(t => t.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const tx = db.transactions[index];
    const customer = db.customers.find(c => c.id === tx.customerId);

    // Recalculate customer balance by reversing the transaction effect
    if (customer) {
      const currentDebt = round2(customer.balance ?? customer.totalDebt ?? 0);
      if (tx.type === "utang") {
        customer.balance = round2(Math.max(0, currentDebt - (Number(tx.amount) || 0)));
      } else if (tx.type === "payment") {
        customer.balance = round2(currentDebt + (Number(tx.deductedAmount || tx.amount) || 0));
      }
      customer.totalDebt = customer.balance;
    }

    db.transactions.splice(index, 1);
    await saveDatabaseAtomic(db);

    res.json({
      success: true,
      message: "Na-delete ang transaksyon at na-update ang balanse.",
      deletedTransaction: tx
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete transaction", details: err.message });
  }
});

module.exports = {
  router,
  handlePayment,
  handleUtang
};
