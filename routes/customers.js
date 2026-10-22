/**
 * routes/customers.js — Neighborhood Suki Customers CRUD Router
 *
 * Backed by the BankAccount-style `UtangAccount` class.
 *
 * Endpoints:
 * - GET    /api/customers       - List all Suki (enriched with risk status, optional ?search= & ?status=)
 * - GET    /api/customers/:id   - Get a single Suki by ID
 * - POST   /api/customers       - Add a new Suki customer
 * - PUT    /api/customers/:id   - Update an existing Suki profile
 * - PATCH  /api/customers/:id   - Partial update (e.g. credit limit, notes)
 * - DELETE /api/customers/:id   - Remove a customer (rejects deletion if balance > 0 unless ?force=true)
 */

const express = require("../lib/express");
const router = express.Router();
const UtangAccount = require("../models/UtangAccount");
const {
  loadDatabase,
  saveDatabaseAtomic,
  enrichCustomer,
  buildStoreSummary,
  round2
} = require("../models/db");

// 1. GET /api/customers — List all customers with computed risk profile
router.get("/", (req, res) => {
  try {
    const db = loadDatabase();
    const allTransactions = db.transactions || [];
    let customers = (db.customers || []).map(c => enrichCustomer(c, allTransactions));

    // Optional status filter: safe, watch, danger
    const statusFilter = req.query.status;
    if (statusFilter && statusFilter !== "all" && statusFilter !== "Lahat") {
      customers = customers.filter(c => c.status === statusFilter);
    }

    // Optional search filter by name or phone
    const search = req.query.search;
    let filteredCount = customers.length;
    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
      );
      filteredCount = customers.length;
    }

    const summary = buildStoreSummary(
      (db.customers || []).map(c => enrichCustomer(c, allTransactions)),
      allTransactions,
      db.products || []
    );

    res.json({
      success: true,
      totalCount: db.customers.length,
      filteredCount,
      customers,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list customers", details: err.message });
  }
});

// 2. GET /api/customers/:id — Get a single customer by ID
router.get("/:id", (req, res) => {
  try {
    const db = loadDatabase();
    const customer = (db.customers || []).find(c => c.id === req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const enriched = enrichCustomer(customer, db.transactions || []);
    res.json({ success: true, customer: enriched });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer", details: err.message });
  }
});

// 3. POST /api/customers — Add a new Suki customer
router.post("/", async (req, res) => {
  try {
    const { name, phone, creditLimit, notes, avatar } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Customer name is required" });
    }

    const cleanName = name.trim();
    const db = loadDatabase();
    db.customers = db.customers || [];

    // Check for duplicate customer name (case-insensitive)
    const exists = db.customers.some(c => c.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: `May suki na nangangalang "${cleanName}"` });
    }

    const numLimit = Number(creditLimit);
    const safeLimit = Number.isFinite(numLimit) && numLimit > 0 ? round2(numLimit) : 500.0;

    // Initialize using the BankAccount-style UtangAccount class
    const account = new UtangAccount({
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      phone: phone ? String(phone).trim() : "",
      creditLimit: safeLimit,
      balance: 0.0,
      notes: notes ? String(notes).trim() : "",
      avatar: avatar || "👤"
    });

    const newCustomer = account.toJSON();
    db.customers.push(newCustomer);
    await saveDatabaseAtomic(db);

    const allTransactions = db.transactions || [];
    const enriched = enrichCustomer(newCustomer, allTransactions);
    const allEnriched = db.customers.map(c => enrichCustomer(c, allTransactions));
    const summary = buildStoreSummary(allEnriched, allTransactions, db.products || []);

    res.status(201).json({
      success: true,
      message: `Naidagdag si ${cleanName} bilang bagong Suki!`,
      customer: enriched,
      customers: allEnriched,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create customer", details: err.message });
  }
});

// 4. PUT / PATCH /api/customers/:id — Update an existing customer
const handleUpdateCustomer = async (req, res) => {
  try {
    const db = loadDatabase();
    db.customers = db.customers || [];
    const index = db.customers.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const existing = db.customers[index];
    const { name, phone, creditLimit, notes, avatar } = req.body;

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Customer name cannot be empty" });
      }
      const cleanName = name.trim();
      const duplicate = db.customers.some(c => c.id !== existing.id && c.name.toLowerCase() === cleanName.toLowerCase());
      if (duplicate) {
        return res.status(409).json({ error: `May suki na nangangalang "${cleanName}"` });
      }
      existing.name = cleanName;
    }

    if (phone !== undefined) existing.phone = String(phone).trim();
    if (notes !== undefined) existing.notes = String(notes).trim();
    if (avatar !== undefined) existing.avatar = avatar;

    if (creditLimit !== undefined) {
      const numLimit = Number(creditLimit);
      if (!Number.isFinite(numLimit) || numLimit <= 0) {
        return res.status(400).json({ error: "Credit limit must be a positive number" });
      }
      existing.creditLimit = round2(numLimit);
    }

    db.customers[index] = existing;
    await saveDatabaseAtomic(db);

    const allTransactions = db.transactions || [];
    const enriched = enrichCustomer(existing, allTransactions);
    const allEnriched = db.customers.map(c => enrichCustomer(c, allTransactions));
    const summary = buildStoreSummary(allEnriched, allTransactions, db.products || []);

    res.json({
      success: true,
      message: `Na-update ang talaan ni ${existing.name}!`,
      customer: enriched,
      customers: allEnriched,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update customer", details: err.message });
  }
};

router.put("/:id", handleUpdateCustomer);
router.patch("/:id", handleUpdateCustomer);

// 5. DELETE /api/customers/:id — Remove a customer (with active utang balance guard)
router.delete("/:id", async (req, res) => {
  try {
    const db = loadDatabase();
    db.customers = db.customers || [];
    const index = db.customers.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = db.customers[index];
    const currentDebt = round2(customer.balance ?? customer.totalDebt ?? 0);

    // Edge-case guard: Prevent deleting customer who still has unpaid utang
    const force = req.query.force === "true" || req.body.force === true;
    if (currentDebt > 0 && !force) {
      return res.status(400).json({
        error: `Hindi maaaring burahin si ${customer.name} dahil mayroon pa siyang natitirang utang na ₱${currentDebt.toFixed(2)}. I-settle muna ang bayad o mag-confirm bago burahin.`,
        currentDebt,
        requiresConfirmation: true
      });
    }

    const removed = db.customers.splice(index, 1)[0];
    await saveDatabaseAtomic(db);

    const allTransactions = db.transactions || [];
    const allEnriched = db.customers.map(c => enrichCustomer(c, allTransactions));
    const summary = buildStoreSummary(allEnriched, allTransactions, db.products || []);

    res.json({
      success: true,
      message: `Nabura na si ${removed.name} sa listahan ng mga Suki.`,
      customer: removed,
      customers: allEnriched,
      summary
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete customer", details: err.message });
  }
});

module.exports = router;
