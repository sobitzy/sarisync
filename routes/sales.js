/**
 * routes/sales.js — Tindahan Point-of-Sale (POS) & Sales Recording Router
 *
 * Handles recording sales with transparent arithmetic:
 * - Line total: quantity * unitPrice
 * - Grand total: sum of line totals
 * - Stock inventory deduction: product.stock - quantity (prevents sale if insufficient stock)
 * - If paymentType === "utang", delegates to UtangAccount.addUtang(grandTotal)
 *
 * Endpoints:
 * - GET    /api/sales       - List recent sales transactions
 * - GET    /api/sales/:id   - Get sale details by ID
 * - POST   /api/sales       - Record a new cash or utang sale
 * - DELETE /api/sales/:id   - Void a sale (restores inventory stock & reverses utang)
 */

const express = require("../lib/express");
const router = express.Router();
const UtangAccount = require("../models/UtangAccount");
const {
  loadDatabase,
  saveDatabaseAtomic,
  enrichCustomer,
  round2,
  getTodayIso
} = require("../models/db");

// 1. GET /api/sales — List sales
router.get("/", (req, res) => {
  try {
    const db = loadDatabase();
    const transactions = db.transactions || [];

    // Filter sales and utang transactions that represent sales
    const sales = transactions.filter(t => t.type === "sale" || t.type === "utang");

    // Optional customer filter
    const customerId = req.query.customerId;
    const filtered = customerId
      ? sales.filter(s => s.customerId === customerId)
      : sales;

    res.json({
      success: true,
      count: filtered.length,
      sales: filtered
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list sales", details: err.message });
  }
});

// 2. GET /api/sales/:id — Get a single sale by ID
router.get("/:id", (req, res) => {
  try {
    const db = loadDatabase();
    const sale = (db.transactions || []).find(t => t.id === req.params.id && (t.type === "sale" || t.type === "utang"));
    if (!sale) {
      return res.status(404).json({ error: "Sale record not found" });
    }
    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sale", details: err.message });
  }
});

// 3. POST /api/sales — Record a new sale (Cash or Utang)
router.post("/", async (req, res) => {
  try {
    const { items, paymentType = "cash", customerId, tenderedAmount, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Sale must include at least one item in items array" });
    }

    const db = loadDatabase();
    db.products = db.products || [];
    db.customers = db.customers || [];
    db.transactions = db.transactions || [];

    const isUtang = String(paymentType).toLowerCase() === "utang";

    let customer = null;
    let customerAccount = null;
    if (isUtang) {
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required for utang sales" });
      }
      customer = db.customers.find(c => c.id === customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found for utang credit" });
      }
      customerAccount = new UtangAccount(customer);
    }

    // Step A: Validate stock and compute line totals using simple math
    const lineItems = [];
    let grandTotal = 0;

    for (const entry of items) {
      const qty = Math.max(1, Math.floor(Number(entry.qty || entry.quantity || 1)));
      let unitPrice = Number(entry.price);
      let productName = entry.name || entry.productName || "Paninda";
      let productId = entry.productId || entry.id;

      // Look up in database if productId is provided
      let matchedProduct = null;
      if (productId) {
        matchedProduct = db.products.find(p => p.id === productId);
      }

      if (matchedProduct) {
        productName = matchedProduct.name;
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          unitPrice = matchedProduct.price;
        }

        // Edge case: Stock check
        const currentStock = Number.isFinite(Number(matchedProduct.stock)) ? Number(matchedProduct.stock) : 999;
        if (currentStock < qty) {
          return res.status(400).json({
            error: `Kulang ang stock para sa "${matchedProduct.name}". Mayroon na lamang ${currentStock} piraso (hinihingi: ${qty}).`,
            productId: matchedProduct.id,
            availableStock: currentStock,
            requestedQty: qty
          });
        }
      }

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({ error: `Invalid price for item "${productName}"` });
      }

      const lineTotal = round2(qty * unitPrice);
      grandTotal = round2(grandTotal + lineTotal);

      lineItems.push({
        id: productId || `item_${Math.random().toString(36).substring(2, 6)}`,
        name: productName,
        qty,
        price: round2(unitPrice),
        subtotal: lineTotal,
        matchedProduct
      });
    }

    if (grandTotal <= 0) {
      return res.status(400).json({ error: "Grand total must be greater than ₱0.00" });
    }

    // Step B: Deduct product inventory stock using simple subtraction
    for (const line of lineItems) {
      if (line.matchedProduct) {
        line.matchedProduct.stock = Math.max(0, line.matchedProduct.stock - line.qty);
      }
    }

    // Step C: Handle payment (Cash or Utang)
    const itemsSummary = lineItems.map(it => `${it.qty}x ${it.name}`).join(", ");
    const txId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const txDate = getTodayIso();
    let transactionRecord;

    if (isUtang) {
      // Use UtangAccount.addUtang() to update customer balance
      const chargeResult = customerAccount.addUtang(grandTotal, itemsSummary);

      // Save updated customer balance back to db.json
      customer.balance = customerAccount.getBalance();
      customer.totalDebt = customerAccount.getBalance();

      transactionRecord = {
        id: txId,
        customerId: customer.id,
        customerName: customer.name,
        type: "utang",
        paymentType: "utang",
        amount: grandTotal,
        items: itemsSummary,
        itemList: lineItems.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price, subtotal: l.subtotal })),
        priorBalance: chargeResult.priorDebt,
        newBalance: chargeResult.newDebt,
        date: txDate,
        timestamp: new Date().toISOString()
      };
    } else {
      // Cash Sale
      const tendered = Number(tenderedAmount) >= grandTotal ? round2(Number(tenderedAmount)) : grandTotal;
      const sukli = round2(Math.max(0, tendered - grandTotal));

      transactionRecord = {
        id: txId,
        customerId: customerId || "walkin",
        customerName: customer ? customer.name : "Walk-in Cash Customer",
        type: "sale",
        paymentType: "cash",
        amount: grandTotal,
        tendered,
        sukli,
        items: itemsSummary,
        itemList: lineItems.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price, subtotal: l.subtotal })),
        date: txDate,
        timestamp: new Date().toISOString()
      };
    }

    db.transactions.unshift(transactionRecord);
    await saveDatabaseAtomic(db);

    const enrichedCust = customer ? enrichCustomer(customer, db.transactions) : null;

    res.status(201).json({
      success: true,
      message: isUtang
        ? `Nailista ang utang na ₱${grandTotal.toFixed(2)} kay ${customer.name}!`
        : `Benta nakumpleto: ₱${grandTotal.toFixed(2)}!`,
      sale: transactionRecord,
      customer: enrichedCust,
      grandTotal,
      products: db.products
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to record sale", details: err.message });
  }
});

// 4. DELETE /api/sales/:id — Void/Cancel a sale
router.delete("/:id", async (req, res) => {
  try {
    const db = loadDatabase();
    db.transactions = db.transactions || [];
    db.products = db.products || [];
    db.customers = db.customers || [];

    const index = db.transactions.findIndex(t => t.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Sale transaction not found" });
    }

    const sale = db.transactions[index];

    // Restore inventory stock using simple addition
    if (Array.isArray(sale.itemList)) {
      for (const item of sale.itemList) {
        const prod = db.products.find(p => p.id === item.id || p.name.toLowerCase() === item.name.toLowerCase());
        if (prod) {
          prod.stock = (Number(prod.stock) || 0) + (Number(item.qty) || 1);
        }
      }
    }

    // If it was an utang sale, reverse the utang on the customer's balance
    if (sale.type === "utang" && sale.customerId) {
      const customer = db.customers.find(c => c.id === sale.customerId);
      if (customer) {
        const currentDebt = round2(customer.balance ?? customer.totalDebt ?? 0);
        customer.balance = round2(Math.max(0, currentDebt - sale.amount));
        customer.totalDebt = customer.balance;
      }
    }

    db.transactions.splice(index, 1);
    await saveDatabaseAtomic(db);

    res.json({
      success: true,
      message: "Na-void na ang benta at naibalik ang stock ng paninda.",
      voidedSale: sale
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to void sale", details: err.message });
  }
});

module.exports = router;
