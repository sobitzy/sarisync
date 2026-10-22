/**
 * routes/products.js — Tindahan Inventory Products CRUD Router
 *
 * Provides straightforward Add, Read, Edit, and Delete (CRUD) operations
 * for neighborhood sari-sari store products with simple stock inventory tracking.
 *
 * Endpoints:
 * - GET    /api/products       - List all products (optional ?search= & ?category=)
 * - GET    /api/products/:id   - Get a single product by ID
 * - POST   /api/products       - Add a new product to inventory
 * - PUT    /api/products/:id   - Update an existing product
 * - PATCH  /api/products/:id   - Partial update of product
 * - DELETE /api/products/:id   - Remove a product from inventory
 */

const express = require("../lib/express");
const router = express.Router();
const { loadDatabase, saveDatabaseAtomic, round2 } = require("../models/db");

// 1. GET /api/products — List all inventory products
router.get("/", (req, res) => {
  try {
    const db = loadDatabase();
    let products = db.products || [];

    // Optional category filter
    const category = req.query.category;
    if (category && category !== "all" && category !== "Lahat") {
      products = products.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
    }

    // Optional search filter (name, tagalog, or subtitle)
    const search = req.query.search;
    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.shortName && p.shortName.toLowerCase().includes(q)) ||
        (p.tagalog && p.tagalog.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load products", details: err.message });
  }
});

// 2. GET /api/products/:id — Get a single product by ID
router.get("/:id", (req, res) => {
  try {
    const db = loadDatabase();
    const product = (db.products || []).find(p => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product", details: err.message });
  }
});

// 3. POST /api/products — Add a new product
router.post("/", async (req, res) => {
  try {
    const { name, shortName, tagalog, subtitle, price, cost, stock, category, icon, emoji } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }

    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: "Product price must be a positive number" });
    }

    const numCost = Number(cost);
    const safeCost = Number.isFinite(numCost) && numCost >= 0 ? round2(numCost) : round2(numPrice * 0.8);

    const numStock = Number(stock);
    const safeStock = Number.isFinite(numStock) && numStock >= 0 ? Math.floor(numStock) : 20;

    const db = loadDatabase();
    db.products = db.products || [];

    // Check for duplicate product name
    const cleanName = name.trim();
    const exists = db.products.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: `A product named "${cleanName}" already exists` });
    }

    const newProduct = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      shortName: shortName ? String(shortName).trim() : cleanName.split(" ")[0],
      tagalog: tagalog ? String(tagalog).trim() : cleanName,
      subtitle: subtitle ? String(subtitle).trim() : (tagalog ? String(tagalog).trim() : cleanName),
      price: round2(numPrice),
      cost: safeCost,
      stock: safeStock,
      category: category ? String(category).trim() : "Iba Pa",
      icon: icon || emoji || "📦",
      emoji: emoji || icon || "📦"
    };

    db.products.push(newProduct);
    await saveDatabaseAtomic(db);

    res.status(201).json({
      success: true,
      message: `Naidagdag ang "${newProduct.name}" sa paninda!`,
      product: newProduct
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add product", details: err.message });
  }
});

// 4. PUT / PATCH /api/products/:id — Update an existing product
const handleUpdateProduct = async (req, res) => {
  try {
    const db = loadDatabase();
    db.products = db.products || [];
    const index = db.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = db.products[index];
    const { name, shortName, tagalog, subtitle, price, cost, stock, category, icon, emoji } = req.body;

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Product name cannot be empty" });
      }
      existing.name = name.trim();
    }
    if (shortName !== undefined) existing.shortName = String(shortName).trim();
    if (tagalog !== undefined) existing.tagalog = String(tagalog).trim();
    if (subtitle !== undefined) existing.subtitle = String(subtitle).trim();
    if (category !== undefined) existing.category = String(category).trim();
    if (icon !== undefined) existing.icon = icon;
    if (emoji !== undefined) existing.emoji = emoji;

    if (price !== undefined) {
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || numPrice <= 0) {
        return res.status(400).json({ error: "Price must be a positive number" });
      }
      existing.price = round2(numPrice);
    }

    if (cost !== undefined) {
      const numCost = Number(cost);
      if (!Number.isFinite(numCost) || numCost < 0) {
        return res.status(400).json({ error: "Cost cannot be negative" });
      }
      existing.cost = round2(numCost);
    }

    if (stock !== undefined) {
      const numStock = Number(stock);
      if (!Number.isFinite(numStock) || numStock < 0) {
        return res.status(400).json({ error: "Stock quantity cannot be negative" });
      }
      existing.stock = Math.floor(numStock);
    }

    db.products[index] = existing;
    await saveDatabaseAtomic(db);

    res.json({
      success: true,
      message: `Na-update ang "${existing.name}"!`,
      product: existing
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update product", details: err.message });
  }
};

router.put("/:id", handleUpdateProduct);
router.patch("/:id", handleUpdateProduct);

// 5. DELETE /api/products/:id — Remove a product
router.delete("/:id", async (req, res) => {
  try {
    const db = loadDatabase();
    db.products = db.products || [];
    const index = db.products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const removed = db.products.splice(index, 1)[0];
    await saveDatabaseAtomic(db);

    res.json({
      success: true,
      message: `Nabura ang "${removed.name}" sa paninda.`,
      product: removed
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete product", details: err.message });
  }
});

module.exports = router;
