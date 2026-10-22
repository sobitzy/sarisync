/**
 * SariSync Speed Board — Comprehensive QA & Reliability Automated Test Suite
 *
 * Audits all Backend (`server.js`, `data/db.json`) and Frontend (`public/index.html`,
 * `public/styles.css`, `public/app.js`) requirements:
 * 1. Zero-Placeholder & Static Code Integrity Audit
 * 2. Crash-Safe Atomic JSON Persistence & Factory Seed Verification
 * 3. Exact Financial Math (`round2`) & Basket Calculation Precision
 * 4. Predictive Credit Risk Engine (`Green`/`Safe`, `Amber`/`Watch`, `Red`/`High Risk`)
 * 5. Flexible Warning Mode for Red / Over-Limit Accounts (Pre-Check + Override)
 * 6. Zero-Floor Overpayment Guard & Exact `Sukli` (Change) Calculator
 * 7. Rapid-Tap Debouncing (`withActionLock`) & Server Idempotency Replay Protection
 * 8. Adaptive Customer List (`>5` Threshold Transformation), Search/Filter & CRUD
 * 9. High-Contrast Daylight Theme, WCAG 2.1 AA/AAA Contrast, 48px Ergonomics & ARIA
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const serverModule = require("../server.js");
const {
  invokeAppRequest,
  round2,
  calculateCustomerRisk,
  evaluateUtangTransactionRisk,
  calculatePaymentBreakdown,
  loadDatabase,
  writeDatabaseAtomicSync,
  getInitialSeedData,
  DB_PATH
} = serverModule;

const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");

describe("SariSync Speed Board — End-to-End QA & Reliability Suite", () => {
  before(async () => {
    // Ensure clean factory seed state before running tests
    await invokeAppRequest("POST", "/api/reset");
  });

  after(async () => {
    // Always restore data/db.json to clean initial seed state after all tests finish
    const seed = getInitialSeedData();
    writeDatabaseAtomicSync(seed);
  });

  // ==========================================================================
  // 1. ZERO-PLACEHOLDER & FILE INTEGRITY AUDIT
  // ==========================================================================
  test("1. All project files exist and contain zero TODO/FIXME placeholders", () => {
    const filesToAudit = [
      "package.json",
      "server.js",
      "data/db.json",
      "public/index.html",
      "public/styles.css",
      "public/app.js"
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.join(ROOT_DIR, relPath);
      assert.equal(fs.existsSync(fullPath), true, `Expected file ${relPath} to exist`);
      const content = fs.readFileSync(fullPath, "utf8");
      assert.ok(content.length > 100, `Expected ${relPath} to be non-empty`);
      assert.equal(/\/\/\s*TODO/i.test(content), false, `Found // TODO in ${relPath}`);
      assert.equal(/\/\*\s*TODO/i.test(content), false, `Found /* TODO in ${relPath}`);
      assert.equal(/FIXME/i.test(content), false, `Found FIXME in ${relPath}`);
    }
  });

  // ==========================================================================
  // 2. ATOMIC JSON PERSISTENCE & SEED DATA INTEGRITY
  // ==========================================================================
  test("2. Database seeds 6 Suki customers, 12 staple products, Tingi presets & atomic write leaves no .tmp files", async () => {
    const res = await invokeAppRequest("GET", "/api/state");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customers.length, 6);
    assert.equal(res.body.products.length, 12);
    assert.deepEqual(res.body.tingiPresets, [1, 2, 5, 10, 15, 20, 50]);
    assert.deepEqual(res.body.quickPayPresets, [20, 50, 100, 200, 500, 1000]);
    assert.equal(res.body.transactions.length, 12);

    // Check total collectibles across 6 seeded customers: 320 + 850 + 95 + 440 + 420 + 60 = 2185
    assert.equal(res.body.summary.totalCollectibles, 2185);
    assert.equal(res.body.summary.adaptiveListMode, "compact-searchable");

    // Verify no leftover .tmp files in data/ directory after atomic writes
    const filesInData = fs.readdirSync(DATA_DIR);
    const tmpFiles = filesInData.filter(f => f.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0, "Atomic persistence must not leave .tmp files behind");
    assert.equal(fs.existsSync(DB_PATH), true);
  });

  // ==========================================================================
  // 3. EXACT FINANCIAL MATH (`round2`) & SPEED BOARD POS PRECISION
  // ==========================================================================
  test("3. round2 prevents IEEE-754 floating-point drift on fractional Tingi & product totals", () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(19.999), 20.0);
    assert.equal(round2(15.555), 15.56);
    assert.equal(round2("28.50"), 28.5);
    assert.equal(round2(null), 0);
    assert.equal(round2(NaN), 0);
  });

  // ==========================================================================
  // 4. PREDICTIVE CREDIT RISK ENGINE (SAFE / WATCH / HIGH RISK TIERS)
  // ==========================================================================
  test("4. Predictive Credit Risk Engine accurately classifies Green (Safe), Amber (Watch), and Red (High Risk) accounts", async () => {
    const res = await invokeAppRequest("GET", "/api/customers");
    assert.equal(res.statusCode, 200);
    const byId = Object.fromEntries(res.body.customers.map(c => [c.id, c]));

    // c1: Aling Nena (320 / 600 = 53.33%) -> Watch (Amber)
    assert.equal(byId.c1.status, "watch");
    assert.equal(byId.c1.riskColor, "amber");
    assert.equal(byId.c1.canExtendCredit, true);
    assert.equal(byId.c1.requiresWarningConfirmation, false);

    // c2: Mang Boy (850 / 800 = 106.25%, 14d overdue) -> High Risk (Red), Over-Limit
    assert.equal(byId.c2.status, "danger");
    assert.equal(byId.c2.riskColor, "red");
    assert.equal(byId.c2.isOverLimit, true);
    assert.equal(byId.c2.overLimitAmount, 50);
    assert.equal(byId.c2.canExtendCredit, true);
    assert.equal(byId.c2.requiresWarningConfirmation, true);

    // c3: Ate Joy (95 / 500 = 19%) -> Safe (Green)
    assert.equal(byId.c3.status, "safe");
    assert.equal(byId.c3.riskColor, "green");
    assert.equal(byId.c3.requiresWarningConfirmation, false);

    // c4: Kuya Jun (440 / 500 = 88%, 9d overdue) -> High Risk (Red)
    assert.equal(byId.c4.status, "danger");
    assert.equal(byId.c4.riskColor, "red");
    assert.equal(byId.c4.requiresWarningConfirmation, true);

    // c5: Aling Rosa (420 / 700 = 60%) -> Watch (Amber)
    assert.equal(byId.c5.status, "watch");
    assert.equal(byId.c5.riskColor, "amber");

    // c6: Ate Marites (60 / 400 = 15%) -> Safe (Green)
    assert.equal(byId.c6.status, "safe");
    assert.equal(byId.c6.riskColor, "green");

    // Verify summary tier counts: 2 safe, 2 watch, 2 danger
    assert.deepEqual(res.body.summary.tierCounts, {
      safe: 2,
      watch: 2,
      danger: 2,
      overLimit: 1
    });
  });

  // ==========================================================================
  // 5. FLEXIBLE WARNING MODE FOR RED / OVER-LIMIT ACCOUNTS
  // ==========================================================================
  test("5. Flexible Warning Mode warns on Red/Over-Limit accounts (409 pre-check) and allows override without hard-blocking", async () => {
    // Dry-run preview on Mang Boy (c2, already ₱850/₱800 Red)
    const previewRes = await invokeAppRequest("POST", "/api/transactions/utang/preview", {
      customerId: "c2",
      amount: 50
    });
    assert.equal(previewRes.statusCode, 200);
    assert.equal(previewRes.body.triggersRedWarning, true);
    assert.equal(previewRes.body.requiresWarningConfirmation, true);
    assert.equal(previewRes.body.canExtendCredit, true);
    assert.equal(previewRes.body.projectedBalance, 900);

    // Step 1: Request with requireConfirmation: true and without acknowledgeWarning returns 409 Advisory
    const preCheckRes = await invokeAppRequest("POST", "/api/transactions/utang", {
      customerId: "c2",
      amount: 50,
      items: "1x Rice 1kg (Tingi)",
      requireConfirmation: true,
      acknowledgeWarning: false
    });
    assert.equal(preCheckRes.statusCode, 409);
    assert.equal(preCheckRes.body.requiresWarningConfirmation, true);
    assert.equal(preCheckRes.body.canExtendCredit, true);
    assert.ok(preCheckRes.body.warningMessage.includes("Mang Boy"));

    // Step 2: Store owner confirms override (acknowledgeWarning: true) -> 201 Created
    const overrideRes = await invokeAppRequest("POST", "/api/transactions/utang", {
      customerId: "c2",
      amount: 50,
      items: "1x Rice 1kg (Tingi)",
      requireConfirmation: true,
      acknowledgeWarning: true,
      idempotencyKey: "test_warn_override_c2_50"
    });
    assert.equal(overrideRes.statusCode, 201);
    assert.equal(overrideRes.body.customer.balance, 900);
    assert.equal(overrideRes.body.transaction.warningTriggered, true);
    assert.equal(overrideRes.body.transaction.warningAcknowledged, true);
    assert.equal(overrideRes.body.riskAssessment.canExtendCredit, true);
  });

  // ==========================================================================
  // 6. ZERO-FLOOR OVERPAYMENT GUARD & EXACT SUKLI CALCULATOR
  // ==========================================================================
  test("6. Zero-Floor Overpayment Guard clamps debt at ₱0.00 (never negative) and computes exact Sukli", async () => {
    // Unit check on calculatePaymentBreakdown
    const calc = calculatePaymentBreakdown(95, 100);
    assert.equal(calc.priorDebt, 95);
    assert.equal(calc.tenderedAmount, 100);
    assert.equal(calc.deductedAmount, 95);
    assert.equal(calc.remainingDebt, 0);
    assert.equal(calc.sukli, 5);
    assert.equal(calc.isOverpayment, true);
    assert.equal(calc.isFullSettlement, true);

    // API Check 1: Ate Joy (c3) owes ₱95.00, tenders ₱100.00 -> debt becomes ₱0.00, Sukli = ₱5.00
    const payJoy = await invokeAppRequest("POST", "/api/transactions/payment", {
      customerId: "c3",
      tenderedAmount: 100,
      idempotencyKey: "test_overpay_c3_100"
    });
    assert.equal(payJoy.statusCode, 201);
    assert.equal(payJoy.body.paymentSummary.priorDebt, 95);
    assert.equal(payJoy.body.paymentSummary.tenderedAmount, 100);
    assert.equal(payJoy.body.paymentSummary.deductedAmount, 95);
    assert.equal(payJoy.body.paymentSummary.remainingDebt, 0);
    assert.equal(payJoy.body.paymentSummary.sukli, 5);
    assert.equal(payJoy.body.customer.balance, 0);
    assert.equal(payJoy.body.customer.totalDebt, 0);

    // API Check 2: Paying again when Ate Joy already has ₱0.00 debt is rejected with 400
    const payZero = await invokeAppRequest("POST", "/api/transactions/payment", {
      customerId: "c3",
      tenderedAmount: 50
    });
    assert.equal(payZero.statusCode, 400);

    // API Check 3: Ate Marites (c6) owes ₱60.00, tenders ₱500.00 -> debt becomes ₱0.00, Sukli = ₱440.00
    const payMarites = await invokeAppRequest("POST", "/api/transactions/payment", {
      customerId: "c6",
      tenderedAmount: 500,
      idempotencyKey: "test_overpay_c6_500"
    });
    assert.equal(payMarites.statusCode, 201);
    assert.equal(payMarites.body.paymentSummary.deductedAmount, 60);
    assert.equal(payMarites.body.paymentSummary.remainingDebt, 0);
    assert.equal(payMarites.body.paymentSummary.sukli, 440);
  });

  // ==========================================================================
  // 7. RAPID-TAP IDEMPOTENCY & DUPLICATE REQUEST PROTECTION
  // ==========================================================================
  test("7. Server-side idempotency guard prevents duplicate transactions on rapid double-tap", async () => {
    const idemKey = "rapid_tap_utang_c1_33";
    const payload = {
      customerId: "c1",
      itemList: [
        { id: "p1", name: "3-in-1 Coffee", qty: 1, price: 15 },
        { id: "p2", name: "Pancit Canton", qty: 1, price: 18 }
      ],
      idempotencyKey: idemKey
    };

    const firstTap = await invokeAppRequest("POST", "/api/transactions/utang", payload, {
      "x-idempotency-key": idemKey
    });
    assert.equal(firstTap.statusCode, 201);
    assert.equal(firstTap.body.customer.balance, 353); // 320 + 33

    // Second rapid tap with same idempotencyKey must NOT add another ₱33
    const secondTap = await invokeAppRequest("POST", "/api/transactions/utang", payload, {
      "x-idempotency-key": idemKey
    });
    assert.equal(secondTap.statusCode, 200);
    assert.equal(secondTap.body.idempotentReplay, true);
    assert.equal(secondTap.body.customer.balance, 353);
  });

  // ==========================================================================
  // 8. ADAPTIVE CUSTOMER LIST (>5 THRESHOLD) & CUSTOMER CRUD
  // ==========================================================================
  test("8. Adaptive customer list (>5 threshold), search/status filter, and POST/PATCH customer endpoints work", async () => {
    // Create 7th customer
    const createRes = await invokeAppRequest("POST", "/api/customers", {
      name: "Mang Tani",
      phone: "0917-999-0000",
      creditLimit: 600,
      notes: "Bagong lipat sa barangay"
    });
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.body.customers.length, 7);
    assert.equal(createRes.body.summary.adaptiveListMode, "compact-searchable");

    const newCustId = createRes.body.customer.id;

    // Duplicate customer name should return 409
    const dupRes = await invokeAppRequest("POST", "/api/customers", {
      name: "mang tani",
      creditLimit: 500
    });
    assert.equal(dupRes.statusCode, 409);

    // Search query filter
    const searchRes = await invokeAppRequest("GET", "/api/customers?search=Tani");
    assert.equal(searchRes.statusCode, 200);
    assert.equal(searchRes.body.filteredCount, 1);
    assert.equal(searchRes.body.customers[0].name, "Mang Tani");

    // Update credit limit via PATCH
    const patchRes = await invokeAppRequest("PATCH", `/api/customers/${newCustId}`, {
      creditLimit: 900,
      notes: "Na-upgrade ang credit limit"
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.body.customer.creditLimit, 900);
  });

  // ==========================================================================
  // 9. FRONTEND DOM, WCAG 2.1 ACCESSIBILITY, 48PX ERGONOMICS & CLIENT LOGIC
  // ==========================================================================
  test("9. Frontend HTML, CSS, and JS satisfy High-Contrast Daylight, 48px touch targets, ARIA roles, and per-customer baskets", () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
    const css = fs.readFileSync(path.join(PUBLIC_DIR, "styles.css"), "utf8");
    const js = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");

    // QA-001: Viewport allows pinch-to-zoom (no user-scalable=no or maximum-scale=1.0)
    assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'));
    assert.equal(/user-scalable\s*=\s*no/i.test(html), false);
    assert.equal(/maximum-scale\s*=\s*1(\.0)?/i.test(html), false);

    // High-Contrast Daylight Default
    assert.ok(html.includes('data-theme="light"'));

    // QA-007: Semantic ARIA tablist/tab/tabpanel, dialog modals, and aria-live="polite"
    assert.ok(html.includes('role="tablist"'));
    assert.ok(html.includes('role="tab"'));
    assert.ok(html.includes('role="tabpanel"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes('aria-live="polite"'));

    // Adaptive >5 Customer Controls & Custom Tingi Price Drawer & Flexible Warning Modal in DOM
    assert.ok(html.includes('id="adaptive-customer-controls"'));
    assert.ok(html.includes('id="customer-search-input"'));
    assert.ok(html.includes('id="custom-tingi-drawer"'));
    assert.ok(html.includes('id="warning-modal-backdrop"'));
    assert.ok(html.includes('id="sukli-modal-backdrop"'));

    // QA-003 & QA-004: CSS 48px minimum touch targets & WCAG AAA button contrast tokens
    assert.ok(css.includes("min-height: 48px;"));
    assert.ok(css.includes("min-width: 48px;"));
    assert.ok(css.includes("--btn-green-bg: #065f46;"));
    assert.ok(css.includes("--btn-green-text: #ffffff;"));

    // QA-002 & QA-006: Client-side per-customer scoped baskets (`basketsByCustomer`) and per-action-key `withActionLock`
    assert.ok(js.includes("basketsByCustomer"));
    assert.ok(js.includes('withActionLock("tingi"'));
    assert.ok(js.includes('withActionLock("ilista"'));
    assert.ok(js.includes('withActionLock("bayad"'));
  });

  // ==========================================================================
  // 10. FACTORY RESET RESTORATION CHECK
  // ==========================================================================
  test("10. POST /api/reset cleanly restores all 6 customers and ₱2,185.00 total collectibles", async () => {
    const resetRes = await invokeAppRequest("POST", "/api/reset");
    assert.equal(resetRes.statusCode, 200);
    assert.equal(resetRes.body.customers.length, 6);
    assert.equal(resetRes.body.summary.totalCollectibles, 2185);
  });

  // ==========================================================================
  // 11. BANKACCOUNT-STYLE UTANGACCOUNT MODEL VERIFICATION
  // ==========================================================================
  test("11. UtangAccount behaves exactly like Java BankAccount with deposit(), addUtang(), and exact arithmetic", () => {
    const UtangAccount = require("../models/UtangAccount");
    const account = new UtangAccount({
      id: "test_c1",
      name: "Aling Bebang",
      balance: 100.0,
      creditLimit: 500.0
    });

    assert.equal(account.getBalance(), 100.0);

    // addUtang / charge increases balance
    const chargeRes = account.addUtang(50.25, "1x Bigas 1kg");
    assert.equal(chargeRes.addedAmount, 50.25);
    assert.equal(chargeRes.newDebt, 150.25);
    assert.equal(account.getBalance(), 150.25);

    // charge alias works identically
    account.charge(20.0, "Kape");
    assert.equal(account.getBalance(), 170.25);

    // deposit / payUtang decreases balance
    const payRes = account.deposit(70.25, "Partial payment");
    assert.equal(payRes.deductedAmount, 70.25);
    assert.equal(payRes.remainingDebt, 100.0);
    assert.equal(payRes.sukli, 0);
    assert.equal(account.getBalance(), 100.0);

    // deposit with overpayment clamps to 0.00 and computes exact sukli
    const overpayRes = account.deposit(120.0, "Full payment with extra");
    assert.equal(overpayRes.deductedAmount, 100.0);
    assert.equal(overpayRes.remainingDebt, 0.0);
    assert.equal(overpayRes.sukli, 20.0);
    assert.equal(overpayRes.isOverpayment, true);
    assert.equal(account.getBalance(), 0.0);

    // Invalid input rejection
    assert.throws(() => account.deposit(0), /Amount must be a positive number/);
    assert.throws(() => account.deposit(-10), /Amount must be a positive number/);
    assert.throws(() => account.deposit("invalid"), /Amount must be a positive number/);
    assert.throws(() => account.deposit(NaN), /Amount must be a positive number/);
    assert.throws(() => account.deposit(null), /Amount must be a positive number/);
    assert.throws(() => account.addUtang(-5), /Amount must be a positive number/);
  });

  // ==========================================================================
  // 12. PRODUCTS INVENTORY CRUD & STOCK TRACKING
  // ==========================================================================
  test("12. Products Inventory CRUD endpoints support Add, Read, Edit, and Delete with stock quantities", async () => {
    // 1. List products
    const listRes = await invokeAppRequest("GET", "/api/products");
    assert.equal(listRes.statusCode, 200);
    const initialCount = listRes.body.count;

    // 2. Add product
    const addRes = await invokeAppRequest("POST", "/api/products", {
      name: "Tsinelas Beach Walk",
      shortName: "Tsinelas",
      tagalog: "Pambahay na Tsinelas",
      price: 85.0,
      cost: 60.0,
      stock: 15,
      category: "Iba Pa"
    });
    assert.equal(addRes.statusCode, 201);
    assert.equal(addRes.body.product.name, "Tsinelas Beach Walk");
    assert.equal(addRes.body.product.stock, 15);
    const createdId = addRes.body.product.id;

    // 3. Update product
    const updateRes = await invokeAppRequest("PUT", `/api/products/${createdId}`, {
      price: 90.0,
      stock: 20
    });
    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.body.product.price, 90.0);
    assert.equal(updateRes.body.product.stock, 20);

    // 4. Delete product
    const deleteRes = await invokeAppRequest("DELETE", `/api/products/${createdId}`);
    assert.equal(deleteRes.statusCode, 200);

    const afterList = await invokeAppRequest("GET", "/api/products");
    assert.equal(afterList.body.count, initialCount);
  });

  // ==========================================================================
  // 13. SALES POS CHECKOUT, STOCK DEDUCTION & OUT-OF-STOCK GUARD
  // ==========================================================================
  test("13. Sales POS records Cash and Utang sales, deducts stock, and rejects insufficient stock", async () => {
    // Check initial stock of Coffee (p1)
    const prodRes = await invokeAppRequest("GET", "/api/products/p1");
    assert.equal(prodRes.statusCode, 200);
    const initialStock = prodRes.body.product.stock;

    // 1. Cash Sale
    const cashSale = await invokeAppRequest("POST", "/api/sales", {
      items: [{ productId: "p1", qty: 2 }],
      paymentType: "cash",
      tenderedAmount: 50.0
    });
    assert.equal(cashSale.statusCode, 201);
    assert.equal(cashSale.body.sale.amount, 30.0); // 2 * 15

    // Verify stock was reduced by 2
    const afterCash = await invokeAppRequest("GET", "/api/products/p1");
    assert.equal(afterCash.body.product.stock, initialStock - 2);

    // 2. Out-of-stock guard: requesting 9999 units should be rejected with 400
    const outOfStock = await invokeAppRequest("POST", "/api/sales", {
      items: [{ productId: "p1", qty: 9999 }],
      paymentType: "cash"
    });
    assert.equal(outOfStock.statusCode, 400);
    assert.ok(outOfStock.body.error.includes("Kulang ang stock"));

    // 3. Utang Sale for Ate Joy (c3)
    const joyBefore = await invokeAppRequest("GET", "/api/customers/c3");
    const joyPriorDebt = joyBefore.body.customer.balance;

    const utangSale = await invokeAppRequest("POST", "/api/sales", {
      items: [{ productId: "p1", qty: 1 }],
      paymentType: "utang",
      customerId: "c3"
    });
    assert.equal(utangSale.statusCode, 201);
    assert.equal(utangSale.body.customer.balance, joyPriorDebt + 15.0);

    // 4. Void sale restores stock
    const voidRes = await invokeAppRequest("DELETE", `/api/sales/${cashSale.body.sale.id}`);
    assert.equal(voidRes.statusCode, 200);
    const afterVoid = await invokeAppRequest("GET", "/api/products/p1");
    // Restored 2 from the voided cash sale (initialStock - 2 - 1 + 2 = initialStock - 1)
    assert.equal(afterVoid.body.product.stock, initialStock - 1);
  });

  // ==========================================================================
  // 14. CUSTOMER UTANG DELETION GUARD
  // ==========================================================================
  test("14. DELETE /api/customers/:id rejects deletion of customer with active debt", async () => {
    // Aling Nena (c1) has active utang (₱320+)
    const delReject = await invokeAppRequest("DELETE", "/api/customers/c1");
    assert.equal(delReject.statusCode, 400);
    assert.ok(delReject.body.error.includes("natitirang utang"));
  });

  // ==========================================================================
  // 15. WILDCARD ROUTING & JSON 404 RESILIENCE (EXPRESS 5 COMPATIBILITY)
  // ==========================================================================
  test("15. Unmatched API routes return JSON 404 and non-API requests fallback without PathError", async () => {
    // Unmatched API endpoint MUST return JSON 404, never HTML
    const api404 = await invokeAppRequest("GET", "/api/nonexistent_test_route");
    assert.equal(api404.statusCode, 404);
    assert.ok(api404.body.error);
    assert.ok(api404.body.error.includes("API endpoint not found"));

    const apiPost404 = await invokeAppRequest("POST", "/api/nonexistent_post_route");
    assert.equal(apiPost404.statusCode, 404);
    assert.ok(apiPost404.body.error);

    // Non-API route falls back to SPA index.html cleanly
    const spaFallback = await invokeAppRequest("GET", "/store-dashboard");
    assert.equal(spaFallback.statusCode, 200);
    assert.ok(spaFallback.text.includes("<!DOCTYPE html>"));
  });
});

