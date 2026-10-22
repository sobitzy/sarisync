/**
 * SariSync Speed Board — Frontend Application (`public/app.js`)
 *
 * Features:
 * 1. High-Contrast Daylight Default (`data-theme="light"`) + 1-Tap Dark Mode Toggle
 * 2. Debounced REST API Client (`GET /api/state`, `POST /api/transactions/utang`,
 *    `POST /api/transactions/payment`, `POST /api/customers`, `PATCH /api/customers/:id`,
 *    `POST /api/reset`) with full offline `localStorage` fallback
 * 3. Per-Action-Group Debounce Locks (`withActionLock`) — Fixes QA-006
 * 4. Per-Customer Scoped Draft Baskets (`basketsByCustomer`) — Fixes QA-002
 * 5. Adaptive Customer List (`>5` Threshold Transformation with Search & Risk Filter Pills)
 * 6. 12-Item Speed Board POS + Custom Tingi Price Drawer + Dynamic Risk Debt Pill (Fixes QA-005)
 * 7. Flexible Warning Mode Banner & Confirmation Override Modal for Red / Over-Limit Suki
 * 8. Zero-Floor Overpayment Guard & Full-Screen Sukli Calculator Modal
 */

(function () {
  "use strict";

  const STORAGE_KEY = "sarisync_speedboard_v5";

  // ==========================================================================
  // Factory Seed State (Matches Backend `server.js` 6 Suki & 12 Staple Products)
  // ==========================================================================

  const defaultState = {
    theme: "light",
    selectedCustomerId: "c1",
    basketsByCustomer: {},
    activeBasket: {
      items: {},
      customItems: [],
      total: 0
    },
    customerSearchQuery: "",
    customerRiskFilter: "all",
    productSearchQuery: "",
    productCategoryFilter: "all",
    tingiPresets: [1, 2, 5, 10, 15, 20, 50],
    quickPayPresets: [20, 50, 100, 200, 500, 1000],
    stapleProducts: [
      { id: "p1", name: "3-in-1 Coffee", shortName: "Coffee", subtitle: "Kape Twin Pack", price: 15.0, emoji: "☕" },
      { id: "p2", name: "Pancit Canton", shortName: "Canton", subtitle: "Chilimansi / Kalamansi", price: 18.0, emoji: "🍜" },
      { id: "p3", name: "Canned Sardines", shortName: "Sardines", subtitle: "Sardinas sa Lata", price: 28.0, emoji: "🐟" },
      { id: "p4", name: "Egg (1 pc)", shortName: "Egg", subtitle: "Itlog (1 piraso)", price: 10.0, emoji: "🥚" },
      { id: "p5", name: "Rice 1kg", shortName: "Rice 1kg", subtitle: "Bigas Sinandomeng 1kg", price: 52.0, emoji: "🍚" },
      { id: "p6", name: "Cooking Oil Tingi", shortName: "Oil Tingi", subtitle: "Mantika Tingi Pouch", price: 20.0, emoji: "🫗" },
      { id: "p7", name: "Instant Mami", shortName: "Mami", subtitle: "Beef / Chicken Noodles", price: 14.0, emoji: "🍲" },
      { id: "p8", name: "Softdrinks", shortName: "Softdrinks", subtitle: "Malamig na Kasalo", price: 25.0, emoji: "🥤" },
      { id: "p9", name: "Laundry Soap", shortName: "Sabon", subtitle: "Sabon Panlaba Sachet", price: 16.0, emoji: "🧼" },
      { id: "p10", name: "Paracetamol", shortName: "Biogesic", subtitle: "Biogesic 500mg (1 tab)", price: 8.0, emoji: "💊" },
      { id: "p11", name: "Sugar 1/4kg", shortName: "Asukal", subtitle: "Asukal na Pula 1/4kg", price: 24.0, emoji: "🧂" },
      { id: "p12", name: "Toyo / Suka Pouch", shortName: "Toyo/Suka", subtitle: "Datu Puti Tingi Pouch", price: 12.0, emoji: "🍶" }
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
        history: [
          { id: "tx_103", customerId: "c1", type: "utang", amount: 212.0, items: "2x Rice 1kg, 2x Canned Sardines, 2x Cooking Oil Tingi, 1x Toyo / Suka Pouch", date: "2026-10-18" },
          { id: "tx_102", customerId: "c1", type: "payment", amount: 100.0, tendered: 100.0, sukli: 0.0, items: "Cash payment", date: "2026-10-16" },
          { id: "tx_101b", customerId: "c1", type: "utang", amount: 58.0, items: "2x 3-in-1 Coffee, 1x Canned Sardines", date: "2026-10-16" },
          { id: "tx_101", customerId: "c1", type: "utang", amount: 150.0, items: "2x Rice 1kg, 3x Egg (1 pc), 1x Laundry Soap", date: "2026-10-14" }
        ]
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
        history: [
          { id: "tx_202", customerId: "c2", type: "utang", amount: 350.0, items: "5x Rice 1kg, 2x Softdrinks, 2x Cooking Oil Tingi", date: "2026-10-08" },
          { id: "tx_201", customerId: "c2", type: "utang", amount: 500.0, items: "6x Rice 1kg, 4x Canned Sardines, 4x Pancit Canton, 1x Tingi (₱4)", date: "2026-10-04" }
        ]
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
        history: [
          { id: "tx_301", customerId: "c3", type: "utang", amount: 95.0, items: "3x Egg (1 pc), 2x 3-in-1 Coffee, 1x Sugar 1/4kg, 1x Tingi (₱11)", date: "2026-10-17" }
        ]
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
        history: [
          { id: "tx_402", customerId: "c4", type: "utang", amount: 190.0, items: "2x Rice 1kg, 3x Pancit Canton, 2x Paracetamol, 1x Tingi (₱16)", date: "2026-10-13" },
          { id: "tx_401", customerId: "c4", type: "utang", amount: 250.0, items: "3x Rice 1kg, 2x Canned Sardines, 2x Softdrinks", date: "2026-10-09" }
        ]
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
        history: [
          { id: "tx_502", customerId: "c5", type: "payment", amount: 100.0, tendered: 100.0, sukli: 0.0, items: "Cash payment", date: "2026-10-15" },
          { id: "tx_501", customerId: "c5", type: "utang", amount: 520.0, items: "6x Rice 1kg, 6x Cooking Oil Tingi, 4x Toyo / Suka Pouch, 2x Sugar 1/4kg", date: "2026-10-12" }
        ]
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
        history: [
          { id: "tx_601", customerId: "c6", type: "utang", amount: 60.0, items: "2x 3-in-1 Coffee, 1x Pancit Canton, 1x Toyo / Suka Pouch", date: "2026-10-18" }
        ]
      }
    ]
  };

  // ==========================================================================
  // Runtime State & Per-Action Lock Registry
  // ==========================================================================

  let appState = {};
  let soundEnabled = true;
  let isBackendOnline = false;
  let sukiModalMode = "create"; // "create" | "edit-limit"

  // Calendar Navigation State
  let currentCalDate = new Date(2026, 9, 1); // October 2026
  let selectedInspectedDate = "2026-10-18";

  // Exact 2-Decimal Financial Rounding Helper
  function round2(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  // Date Synchronization Helper
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

  function parseIsoDate(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return new Date(2026, 9, 18);
    const [y, m, d] = isoStr.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function calculateDaysAgo(dateStr) {
    if (!dateStr) return 0;
    const today = parseIsoDate(getTodayIso());
    const past = parseIsoDate(dateStr);
    const diffMs = today.getTime() - past.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Fixes QA-006: Per-Action-Group Debounce Lock.
   * Supports both `withActionLock(actionKey, fn, cooldown)` and `withActionLock(fn, cooldown)`.
   * Tapping a Tingi pill (`lock: "tingi"`) never blocks `ILISTA` (`lock: "ilista"`) or `BAYAD` (`lock: "bayad"`).
   */
  const actionLocks = new Map();
  let autoLockCounter = 0;

  function withActionLock(keyOrFn, fnOrCooldown, maybeCooldown) {
    let lockKey;
    let fn;
    let cooldown;

    if (typeof keyOrFn === "function") {
      autoLockCounter += 1;
      lockKey = `action_${autoLockCounter}`;
      fn = keyOrFn;
      cooldown = typeof fnOrCooldown === "number" ? fnOrCooldown : 350;
    } else {
      lockKey = String(keyOrFn);
      fn = fnOrCooldown;
      cooldown = typeof maybeCooldown === "number" ? maybeCooldown : 350;
    }

    return function (...args) {
      if (actionLocks.get(lockKey)) return;
      actionLocks.set(lockKey, true);
      try {
        return fn.apply(this, args);
      } catch (err) {
        console.error(`[SariSync ActionError:${lockKey}]`, err);
      } finally {
        setTimeout(() => {
          actionLocks.set(lockKey, false);
        }, cooldown);
      }
    };
  }

  function generateIdempotencyKey(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ==========================================================================
  // Web Audio Synthesizer (Tactile Store Feedback)
  // ==========================================================================

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx && typeof window !== "undefined") {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioCtx = new AudioClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "tap") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(460, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === "cash") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1318.51, now + 0.08);
        gain2.gain.setValueAtTime(0.28, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.3);
      } else if (type === "stamp") {
        osc.type = "square";
        osc.frequency.setValueAtTime(170, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.1);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === "alert") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(230, now);
        osc.frequency.setValueAtTime(175, now + 0.1);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (_) {
      // Ignore audio errors when autoplay is restricted
    }
  }

  // ==========================================================================
  // Accessible Toast Notification System
  // ==========================================================================

  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const isAlert = type === "warning" || type === "alert" || type === "danger" || type === true;
    const icon = isAlert ? "⚠️" : type === "info" ? "ℹ️" : "✅";
    const toast = document.createElement("div");
    toast.className = `toast-box ${isAlert ? "toast-alert" : ""}`;
    toast.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.25s ease";
      setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  // ==========================================================================
  // Predictive Credit Risk Engine (Client-Side Mirror of `server.js`)
  // ==========================================================================

  function getCustomerStatus(cust) {
    if (!cust) {
      return {
        dotClass: "dot-safe",
        type: "safe",
        label: "Safe",
        tagalogLabel: "Good Suki",
        badgeClass: "badge-safe",
        pillClass: "pill-safe",
        utilizationPercent: 0,
        isOverLimit: false,
        requiresWarningConfirmation: false,
        warningMessage: null
      };
    }

    const debt = round2(Math.max(0, cust.totalDebt ?? cust.balance ?? 0));
    const limit = round2(Math.max(1, cust.creditLimit ?? 500));
    const utilizationPercent = round2((debt / limit) * 100);
    const isOverLimit = debt > limit;
    const isAtOrOverLimit = debt >= limit;
    const daysOverdue = debt <= 0 ? 0 : Number(cust.daysOverdue || 0);

    if (debt > 0 && (utilizationPercent >= 85 || isAtOrOverLimit || daysOverdue >= 14)) {
      const overAmt = round2(Math.max(0, debt - limit));
      const warningMessage = isOverLimit
        ? `Babala: Lampas na sa credit limit si ${cust.name} (₱${debt.toFixed(2)} / ₱${limit.toFixed(2)}, +₱${overAmt.toFixed(2)} over limit). Maaari pa ring mag-lista sa ilalim ng Flexible Warning Mode.`
        : `Babala: Nasa High Risk (${Math.round(utilizationPercent)}% ng ₱${limit.toFixed(2)} limit) ang utang ni ${cust.name}.`;
      return {
        dotClass: "dot-danger",
        type: "danger",
        label: "High Risk",
        tagalogLabel: isOverLimit ? "Lampas sa Limit" : "Kritikal",
        badgeClass: "badge-danger",
        pillClass: "pill-danger",
        utilizationPercent,
        isOverLimit,
        requiresWarningConfirmation: true,
        warningMessage
      };
    }

    if (debt > 0 && (utilizationPercent >= 50 || daysOverdue >= 7)) {
      return {
        dotClass: "dot-watch",
        type: "watch",
        label: "Watch",
        tagalogLabel: "Bantayan",
        badgeClass: "badge-watch",
        pillClass: "pill-watch",
        utilizationPercent,
        isOverLimit: false,
        requiresWarningConfirmation: false,
        warningMessage: `Paalala: Nasa Watch tier (${Math.round(utilizationPercent)}% ng limit) ang utang ni ${cust.name} (₱${debt.toFixed(2)} / ₱${limit.toFixed(2)}).`
      };
    }

    return {
      dotClass: "dot-safe",
      type: "safe",
      label: "Safe",
      tagalogLabel: "Good Suki",
      badgeClass: "badge-safe",
      pillClass: "pill-safe",
      utilizationPercent,
      isOverLimit: false,
      requiresWarningConfirmation: false,
      warningMessage: null
    };
  }

  function evaluateProjectedUtangRisk(cust, addedAmount) {
    const cleanAdded = round2(Math.max(0, addedAmount));
    const currentStatus = getCustomerStatus(cust);
    const priorDebt = round2(Math.max(0, cust.totalDebt ?? cust.balance ?? 0));
    const limit = round2(Math.max(1, cust.creditLimit ?? 500));
    const projectedDebt = round2(priorDebt + cleanAdded);

    const projectedCustomer = {
      ...cust,
      totalDebt: projectedDebt,
      balance: projectedDebt
    };
    const projectedStatus = getCustomerStatus(projectedCustomer);
    const triggersRedWarning =
      currentStatus.type === "danger" ||
      (cleanAdded > 0 && projectedStatus.type === "danger");

    let advisoryMessage = projectedStatus.warningMessage || currentStatus.warningMessage;
    if (triggersRedWarning && cleanAdded > 0) {
      if (projectedDebt > limit) {
        advisoryMessage = `Babala (High Risk): Ang bagong basket na ₱${cleanAdded.toFixed(2)} ay magpapalampas kay ${cust.name} sa credit limit (Magiging ₱${projectedDebt.toFixed(2)} / Limit ₱${limit.toFixed(2)}).`;
      } else {
        advisoryMessage = `Babala (High Risk): Ang utang ni ${cust.name} ay aabot sa ₱${projectedDebt.toFixed(2)} (${Math.round(projectedStatus.utilizationPercent)}% ng ₱${limit.toFixed(2)} limit).`;
      }
    }

    return {
      priorDebt,
      addedAmount: cleanAdded,
      projectedDebt,
      creditLimit: limit,
      currentStatus,
      projectedStatus,
      triggersRedWarning,
      requiresWarningConfirmation: triggersRedWarning,
      warningMessage: advisoryMessage
    };
  }

  // ==========================================================================
  // State Management & Per-Customer Scoped Basket (Fixes QA-002)
  // ==========================================================================

  function normalizeCustomerRecord(c) {
    const debt = round2(Math.max(0, c.totalDebt ?? c.balance ?? 0));
    const limit = round2(Math.max(1, c.creditLimit ?? 500));
    const defaultAvatar =
      c.avatar ||
      (c.name && c.name.includes("Nena")
        ? "👵"
        : c.name && c.name.includes("Boy")
        ? "👨"
        : c.name && c.name.includes("Jun")
        ? "👷"
        : c.name && c.name.includes("Rosa")
        ? "👩‍🍳"
        : "👩");

    return {
      ...c,
      avatar: defaultAvatar,
      balance: debt,
      totalDebt: debt,
      creditLimit: limit,
      daysOverdue: Number.isFinite(Number(c.daysOverdue)) ? Number(c.daysOverdue) : 0,
      repaymentRate: Number.isFinite(Number(c.repaymentRate)) ? Number(c.repaymentRate) : 92,
      history: Array.isArray(c.history) ? c.history : []
    };
  }

  function createEmptyBasket() {
    return {
      items: {},
      customItems: [],
      total: 0
    };
  }

  function getCustomerBasket(customerId) {
    if (!appState.basketsByCustomer || typeof appState.basketsByCustomer !== "object") {
      appState.basketsByCustomer = {};
    }
    const id = customerId || appState.selectedCustomerId || "c1";
    if (!appState.basketsByCustomer[id]) {
      appState.basketsByCustomer[id] = createEmptyBasket();
    }
    if (!appState.basketsByCustomer[id].items) {
      appState.basketsByCustomer[id].items = {};
    }
    if (!Array.isArray(appState.basketsByCustomer[id].customItems)) {
      appState.basketsByCustomer[id].customItems = [];
    }
    return appState.basketsByCustomer[id];
  }

  function syncActiveBasketPointer() {
    const custBasket = getCustomerBasket(appState.selectedCustomerId);
    appState.activeBasket = custBasket;
    computeBasketTotal(custBasket);
  }

  function loadLocalState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        appState = {
          ...JSON.parse(JSON.stringify(defaultState)),
          ...parsed
        };
      } catch (_) {
        appState = JSON.parse(JSON.stringify(defaultState));
      }
    } else {
      appState = JSON.parse(JSON.stringify(defaultState));
    }

    appState.customers = (appState.customers || defaultState.customers).map(normalizeCustomerRecord);
    if (!appState.stapleProducts || appState.stapleProducts.length === 0) {
      appState.stapleProducts = JSON.parse(JSON.stringify(defaultState.stapleProducts));
    }
    if (!appState.customers.find(c => c.id === appState.selectedCustomerId) && appState.customers.length > 0) {
      appState.selectedCustomerId = appState.customers[0].id;
    }
    syncActiveBasketPointer();
    saveLocalState();
  }

  function saveLocalState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (_) {}
  }

  function updateSyncBadge(online) {
    isBackendOnline = Boolean(online);
    const badge = document.getElementById("sync-status-badge");
    if (!badge) return;
    if (isBackendOnline) {
      badge.textContent = "🟢 Live DB";
      badge.classList.remove("is-offline");
      badge.setAttribute("title", "Konektado sa Express JSON Database (data/db.json)");
    } else {
      badge.textContent = "🟠 Offline Cache";
      badge.classList.add("is-offline");
      badge.setAttribute("title", "Gumagamit ng LocalStorage Offline Fallback");
    }
  }

  // ==========================================================================
  // REST API Synchronization with Express Backend (`server.js`)
  // ==========================================================================

  async function apiRequest(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    const response = await fetch(endpoint, {
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 409) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return { status: response.status, data };
  }

  async function bootstrapFromServer() {
    try {
      const { data } = await apiRequest("/api/state", { method: "GET" });
      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      }
      if (data && Array.isArray(data.products) && data.products.length > 0) {
        appState.stapleProducts = data.products.map(p => ({
          ...p,
          emoji: p.emoji || p.icon || "📦"
        }));
      }
      if (data && Array.isArray(data.tingiPresets)) {
        appState.tingiPresets = data.tingiPresets;
      }
      if (!appState.customers.find(c => c.id === appState.selectedCustomerId) && appState.customers.length > 0) {
        appState.selectedCustomerId = appState.customers[0].id;
      }
      syncActiveBasketPointer();
      saveLocalState();
      updateSyncBadge(true);
      renderAll();
    } catch (_) {
      updateSyncBadge(false);
    }
  }

  function getSelectedCustomer() {
    return (
      appState.customers.find(c => c.id === appState.selectedCustomerId) ||
      appState.customers[0] ||
      null
    );
  }

  /**
   * Switches selected Suki customer while scoping draft baskets per customer (Fixes QA-002).
   */
  function selectCustomer(customerId) {
    if (!customerId || appState.selectedCustomerId === customerId) return;
    playSound("tap");
    appState.selectedCustomerId = customerId;
    syncActiveBasketPointer();
    saveLocalState();
    renderAll();
  }

  // ==========================================================================
  // Theme Management (Daylight Default + 1-Tap Dark Mode Toggle)
  // ==========================================================================

  function applyTheme(theme) {
    const cleanTheme = theme === "dark" ? "dark" : "light";
    appState.theme = cleanTheme;
    document.documentElement.setAttribute("data-theme", cleanTheme);
    const btn = document.getElementById("btn-theme-toggle");
    if (btn) {
      btn.textContent = cleanTheme === "dark" ? "☀️" : "🌙";
      btn.setAttribute(
        "title",
        cleanTheme === "dark"
          ? "Lumipat sa High-Contrast Daylight Mode"
          : "Lumipat sa Night / Dark Mode"
      );
    }
    saveLocalState();
  }

  function toggleTheme() {
    playSound("tap");
    const nextTheme = appState.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    showToast(
      nextTheme === "light"
        ? "High-Contrast Daylight Mode naka-activate! ☀️"
        : "Night / Dark Mode naka-activate! 🌙"
    );
  }

  // ==========================================================================
  // Speed Board Basket & Custom Tingi Price Drawer Operations
  // ==========================================================================

  function computeBasketTotal(basket = appState.activeBasket) {
    if (!basket) return 0;
    let sum = 0;
    for (const [id, rawQty] of Object.entries(basket.items || {})) {
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (id.startsWith("tingi_")) {
        const val = Number(id.replace("tingi_", ""));
        if (Number.isFinite(val) && val > 0) {
          sum = round2(sum + round2(val * qty));
        }
      } else {
        const prod = appState.stapleProducts.find(p => p.id === id);
        if (prod) {
          sum = round2(sum + round2(prod.price * qty));
        }
      }
    }

    if (Array.isArray(basket.customItems)) {
      for (const item of basket.customItems) {
        const price = round2(item.price || 0);
        const qty = Math.max(1, Number(item.qty || 1));
        if (price > 0) {
          sum = round2(sum + round2(price * qty));
        }
      }
    }

    basket.total = round2(sum);
    return basket.total;
  }

  function addProductToBasket(prodId) {
    playSound("tap");
    const basket = getCustomerBasket(appState.selectedCustomerId);
    if (!basket.items[prodId]) {
      basket.items[prodId] = 0;
    }
    basket.items[prodId] += 1;
    computeBasketTotal(basket);
    saveLocalState();
    renderBentaTab();
    renderTalaanTab();
  }

  function decrementProductFromBasket(prodId) {
    playSound("tap");
    const basket = getCustomerBasket(appState.selectedCustomerId);
    if (!basket.items[prodId]) return;
    basket.items[prodId] -= 1;
    if (basket.items[prodId] <= 0) {
      delete basket.items[prodId];
    }
    computeBasketTotal(basket);
    saveLocalState();
    renderBentaTab();
    renderTalaanTab();
  }

  function addTingiToBasket(amount) {
    const val = round2(amount);
    if (val <= 0) return;
    playSound("tap");
    const basket = getCustomerBasket(appState.selectedCustomerId);
    const tingiId = `tingi_${val}`;
    if (!basket.items[tingiId]) {
      basket.items[tingiId] = 0;
    }
    basket.items[tingiId] += 1;
    computeBasketTotal(basket);
    saveLocalState();
    renderBentaTab();
    renderTalaanTab();
    showToast(`+₱${val.toFixed(2)} Bilis-Tingi idinagdag sa basket!`);
  }

  function addCustomTingiItem() {
    const nameInput = document.getElementById("custom-tingi-name");
    const amountInput = document.getElementById("custom-tingi-amount");
    const label = (nameInput && nameInput.value ? nameInput.value.trim() : "") || "Custom Tingi";
    const amount = round2(amountInput ? amountInput.value : 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      playSound("alert");
      showToast("Pakilagay ang halaga ng Custom Tingi (mas malaki sa ₱0).", "warning");
      if (amountInput) amountInput.focus();
      return;
    }

    playSound("tap");
    const basket = getCustomerBasket(appState.selectedCustomerId);
    basket.customItems.push({
      id: `custom_${Date.now()}`,
      name: `${label} (₱${amount.toFixed(2)})`,
      qty: 1,
      price: amount
    });
    if (amountInput) amountInput.value = "";
    computeBasketTotal(basket);
    saveLocalState();
    renderBentaTab();
    renderTalaanTab();
    showToast(`Idinagdag: ${label} (₱${amount.toFixed(2)}) sa basket!`);
  }

  function clearBasket() {
    playSound("tap");
    appState.basketsByCustomer[appState.selectedCustomerId] = createEmptyBasket();
    syncActiveBasketPointer();
    saveLocalState();
    renderBentaTab();
    renderTalaanTab();
  }

  function buildBasketPayload(basket = appState.activeBasket) {
    const parts = [];
    const itemList = [];

    for (const [id, rawQty] of Object.entries((basket && basket.items) || {})) {
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (id.startsWith("tingi_")) {
        const val = round2(Number(id.replace("tingi_", "")));
        parts.push(`${qty}x Tingi (₱${val})`);
        itemList.push({
          id,
          name: `Tingi (₱${val})`,
          qty,
          price: val,
          subtotal: round2(val * qty)
        });
      } else {
        const prod = appState.stapleProducts.find(p => p.id === id);
        if (prod) {
          parts.push(`${qty}x ${prod.name}`);
          itemList.push({
            id: prod.id,
            name: prod.name,
            qty,
            price: prod.price,
            subtotal: round2(prod.price * qty)
          });
        }
      }
    }

    if (basket && Array.isArray(basket.customItems)) {
      for (const custom of basket.customItems) {
        parts.push(`${custom.qty}x ${custom.name}`);
        itemList.push({
          id: custom.id,
          name: custom.name,
          qty: custom.qty,
          price: custom.price,
          subtotal: round2(custom.price * custom.qty)
        });
      }
    }

    return {
      summaryText: parts.length > 0 ? parts.join(", ") : "Pumili ng paninda sa itaas",
      itemList
    };
  }

  function getBasketSummaryText() {
    return buildBasketPayload(appState.activeBasket).summaryText;
  }

  // ==========================================================================
  // Commit Utang ("ILISTA") with Flexible Warning Mode for Red / Over-Limit
  // ==========================================================================

  function openWarningConfirmationModal(evaluation) {
    const backdrop = document.getElementById("warning-modal-backdrop");
    if (!backdrop) return;
    playSound("alert");
    document.getElementById("modal-warning-message").textContent =
      evaluation.warningMessage ||
      "Ang bagong utang ay nasa kritikal na antas ng credit limit. Ituloy pa rin ba?";
    document.getElementById("modal-warn-prior").textContent = `₱${evaluation.priorDebt.toFixed(2)}`;
    document.getElementById("modal-warn-added").textContent = `+₱${evaluation.addedAmount.toFixed(2)}`;
    document.getElementById("modal-warn-projected").textContent = `₱${evaluation.projectedDebt.toFixed(2)}`;
    document.getElementById("modal-warn-limit").textContent = `₱${evaluation.creditLimit.toFixed(2)}`;
    backdrop.classList.add("is-active");
  }

  function closeWarningConfirmationModal() {
    const backdrop = document.getElementById("warning-modal-backdrop");
    if (backdrop) backdrop.classList.remove("is-active");
  }

  async function executeSubmitDebt(forceOverride = false) {
    const cust = getSelectedCustomer();
    if (!cust) return;

    const basket = getCustomerBasket(cust.id);
    const addedAmount = computeBasketTotal(basket);
    if (addedAmount <= 0) {
      showToast("Pumili muna ng paninda o Tingi sa Speed Board!", "warning");
      return;
    }

    const riskEval = evaluateProjectedUtangRisk(cust, addedAmount);

    // Flexible Warning Mode: Warn clearly when Red / Over-Limit, allow 1-tap override
    if (riskEval.requiresWarningConfirmation && !forceOverride) {
      openWarningConfirmationModal(riskEval);
      return;
    }

    closeWarningConfirmationModal();

    const todayStr = getTodayIso();
    const { summaryText, itemList } = buildBasketPayload(basket);
    const idempotencyKey = generateIdempotencyKey("utang");

    try {
      const { data } = await apiRequest("/api/transactions/utang", {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerId: cust.id,
          amount: addedAmount,
          items: summaryText,
          itemList,
          date: todayStr,
          acknowledgeWarning: true,
          forceOverride: true,
          idempotencyKey
        })
      });

      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      }
      updateSyncBadge(true);
    } catch (_) {
      // Offline Local Fallback
      updateSyncBadge(false);
      const newTx = {
        id: `tx_${Date.now()}`,
        customerId: cust.id,
        customerName: cust.name,
        type: "utang",
        amount: addedAmount,
        items: summaryText,
        itemList,
        date: todayStr
      };
      cust.totalDebt = round2(cust.totalDebt + addedAmount);
      cust.balance = cust.totalDebt;
      if (!Array.isArray(cust.history)) cust.history = [];
      cust.history.unshift(newTx);
    }

    if (riskEval.triggersRedWarning) {
      playSound("alert");
    } else {
      playSound("stamp");
    }

    appState.basketsByCustomer[cust.id] = createEmptyBasket();
    syncActiveBasketPointer();
    selectedInspectedDate = todayStr;
    saveLocalState();
    renderAll();

    showToast(
      `Nailista: ₱${addedAmount.toFixed(2)} kay ${cust.name}!`,
      riskEval.triggersRedWarning ? "warning" : "success"
    );
  }

  // ==========================================================================
  // Zero-Floor Overpayment Guard & Automatic Sukli Calculator (`Bayad` Tab)
  // ==========================================================================

  async function executeQuickPay(denomination) {
    const cust = getSelectedCustomer();
    if (!cust) return;

    const currentDebt = round2(Math.max(0, cust.totalDebt ?? cust.balance ?? 0));
    if (currentDebt <= 0) {
      showToast(`Wala nang natitirang utang si ${cust.name} (₱0.00)!`, "info");
      return;
    }

    const tendered =
      denomination === "FULL" || denomination === "full"
        ? currentDebt
        : round2(Number(denomination));

    if (!Number.isFinite(tendered) || tendered <= 0) {
      playSound("alert");
      showToast("Pakilagay ang tamang halaga ng bayad (mas malaki sa ₱0).", "warning");
      return;
    }

    // Strict Zero-Floor Clamp: deducted never exceeds currentDebt, remaining never < 0
    let bawasUtang = round2(Math.min(tendered, currentDebt));
    let remainingDebt = round2(Math.max(0, currentDebt - bawasUtang));
    let sukli = round2(Math.max(0, tendered - bawasUtang));
    const todayStr = getTodayIso();
    const idempotencyKey = generateIdempotencyKey("pay");

    try {
      const { data } = await apiRequest("/api/transactions/payment", {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerId: cust.id,
          tenderedAmount: denomination === "FULL" ? "FULL" : tendered,
          date: todayStr,
          idempotencyKey
        })
      });

      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      }
      if (data && data.paymentSummary) {
        bawasUtang = round2(data.paymentSummary.deductedAmount);
        remainingDebt = round2(data.paymentSummary.remainingDebt);
        sukli = round2(data.paymentSummary.sukli);
      }
      updateSyncBadge(true);
    } catch (_) {
      // Offline Local Fallback
      updateSyncBadge(false);
      cust.totalDebt = remainingDebt;
      cust.balance = remainingDebt;
      if (remainingDebt === 0) {
        cust.daysOverdue = 0;
      }
      const newTx = {
        id: `tx_${Date.now()}`,
        customerId: cust.id,
        customerName: cust.name,
        type: "payment",
        amount: bawasUtang,
        tendered,
        sukli,
        items: "Cash payment",
        date: todayStr
      };
      if (!Array.isArray(cust.history)) cust.history = [];
      cust.history.unshift(newTx);
    }

    const customInput = document.getElementById("custom-pay-amount");
    if (customInput) customInput.value = "";

    selectedInspectedDate = todayStr;
    saveLocalState();
    playSound("cash");
    renderAll();

    if (sukli > 0) {
      displaySukliModal(cust.name, tendered, bawasUtang, sukli, remainingDebt);
    } else {
      showToast(`Bayad natanggap: ₱${bawasUtang.toFixed(2)} mula kay ${cust.name}!`);
    }
  }

  function displaySukliModal(custName, tendered, bawasUtang, sukli, remainingDebt = 0) {
    document.getElementById("modal-sukli-cust").textContent = custName;
    document.getElementById("modal-sukli-amount").textContent = `₱${round2(sukli).toFixed(2)}`;
    document.getElementById("modal-tendered-amount").textContent = `₱${round2(tendered).toFixed(2)}`;
    document.getElementById("modal-cleared-amount").textContent = `₱${round2(bawasUtang).toFixed(2)}`;
    const remEl = document.getElementById("modal-remaining-debt");
    if (remEl) remEl.textContent = `₱${round2(remainingDebt).toFixed(2)}`;
    document.getElementById("sukli-modal-backdrop").classList.add("is-active");
  }

  function dismissSukliModal() {
    playSound("tap");
    document.getElementById("sukli-modal-backdrop").classList.remove("is-active");
  }

  // ==========================================================================
  // Add New Suki & Edit Credit Limit Modal (`POST /api/customers` & `PATCH`)
  // ==========================================================================

  function openAddSukiModal(mode = "create") {
    playSound("tap");
    sukiModalMode = mode;
    const backdrop = document.getElementById("add-suki-modal-backdrop");
    const heading = document.getElementById("modal-suki-heading");
    const nameInput = document.getElementById("input-suki-name");
    const phoneInput = document.getElementById("input-suki-phone");
    const limitInput = document.getElementById("input-suki-limit");
    const notesInput = document.getElementById("input-suki-notes");

    if (mode === "edit-limit") {
      const cust = getSelectedCustomer();
      if (!cust) return;
      heading.textContent = `⚙️ I-update si ${cust.name}`;
      nameInput.value = cust.name;
      phoneInput.value = cust.phone || "";
      limitInput.value = cust.creditLimit || 500;
      notesInput.value = cust.notes || "";
    } else {
      heading.textContent = "➕ Magdagdag ng Bagong Suki";
      nameInput.value = "";
      phoneInput.value = "";
      limitInput.value = "500";
      notesInput.value = "";
    }

    backdrop.classList.add("is-active");
    setTimeout(() => nameInput.focus(), 60);
  }

  function closeAddSukiModal() {
    const backdrop = document.getElementById("add-suki-modal-backdrop");
    if (backdrop) backdrop.classList.remove("is-active");
  }

  async function saveSukiModalForm() {
    const nameInput = document.getElementById("input-suki-name");
    const phoneInput = document.getElementById("input-suki-phone");
    const limitInput = document.getElementById("input-suki-limit");
    const notesInput = document.getElementById("input-suki-notes");

    const name = (nameInput.value || "").trim();
    const phone = (phoneInput.value || "").trim() || "Walang #";
    const creditLimit = round2(limitInput.value || 500);
    const notes = (notesInput.value || "").trim();

    if (name.length < 2) {
      playSound("alert");
      showToast("Pakilagay ang pangalan ng Suki (at least 2 letra).", "warning");
      nameInput.focus();
      return;
    }
    if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
      playSound("alert");
      showToast("Ang Credit Limit ay dapat mas malaki sa ₱0.", "warning");
      limitInput.focus();
      return;
    }

    if (sukiModalMode === "edit-limit") {
      const cust = getSelectedCustomer();
      if (!cust) return;
      try {
        const { data } = await apiRequest(`/api/customers/${cust.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, phone, creditLimit, notes })
        });
        if (data && Array.isArray(data.customers)) {
          appState.customers = data.customers.map(normalizeCustomerRecord);
        }
        updateSyncBadge(true);
      } catch (_) {
        updateSyncBadge(false);
        cust.name = name;
        cust.phone = phone;
        cust.creditLimit = creditLimit;
        cust.notes = notes;
      }
      playSound("stamp");
      closeAddSukiModal();
      saveLocalState();
      renderAll();
      showToast(`Na-update ang detalye at limit ni ${name}!`);
      return;
    }

    // Create new Suki
    try {
      const { data } = await apiRequest("/api/customers", {
        method: "POST",
        body: JSON.stringify({ name, phone, creditLimit, notes, avatar: "🧑" })
      });
      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      }
      if (data && data.customer) {
        appState.selectedCustomerId = data.customer.id;
      }
      updateSyncBadge(true);
    } catch (_) {
      updateSyncBadge(false);
      const newCust = normalizeCustomerRecord({
        id: `c_${Date.now()}`,
        name,
        phone,
        avatar: "🧑",
        balance: 0,
        totalDebt: 0,
        creditLimit,
        daysOverdue: 0,
        repaymentRate: 100,
        notes,
        history: []
      });
      appState.customers.push(newCust);
      appState.selectedCustomerId = newCust.id;
    }

    syncActiveBasketPointer();
    playSound("stamp");
    closeAddSukiModal();
    saveLocalState();
    renderAll();
    showToast(`Idinagdag si ${name} sa listahan ng Suki!`);
  }

  // ==========================================================================
  // Reset to Factory Seed (`POST /api/reset` + Local Fallback)
  // ==========================================================================

  async function resetToFactorySeed() {
    if (!window.confirm("I-reset ang SariSync sa panimulang talaan (Factory Seed Data)?")) {
      return;
    }
    try {
      const { data } = await apiRequest("/api/reset", { method: "POST" });
      appState = JSON.parse(JSON.stringify(defaultState));
      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      }
      updateSyncBadge(true);
    } catch (_) {
      updateSyncBadge(false);
      appState = JSON.parse(JSON.stringify(defaultState));
    }
    currentCalDate = new Date(2026, 9, 1);
    selectedInspectedDate = "2026-10-18";
    syncActiveBasketPointer();
    saveLocalState();
    applyTheme(appState.theme || "light");
    renderAll();
    showToast("Na-reset na ang SariSync sa panimulang talaan!");
  }

  // ==========================================================================
  // Kasunduan SMS / Clipboard Reminder Generator
  // ==========================================================================

  function generateKasunduanText(cust) {
    const lastTx =
      cust.history && cust.history[0]
        ? `${cust.history[0].type.toUpperCase()}: ₱${Number(cust.history[0].amount).toFixed(2)} (${cust.history[0].items || cust.history[0].date})`
        : "Wala";

    return `Magandang araw po ${cust.name}! Paalala lamang po mula sa aming tindahan, ang inyong kasalukuyang utang balance ay ₱${cust.totalDebt.toFixed(2)} (Limit: ₱${cust.creditLimit.toFixed(2)}). Huling tala: ${lastTx}. Maraming salamat po sa inyong suporta at tiwala sa ating munting tindahan! 🙏`;
  }

  function sendKasunduan() {
    const cust = getSelectedCustomer();
    if (!cust) return;
    playSound("tap");
    const text = generateKasunduanText(cust);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    showToast("Nakopya sa clipboard ang Kasunduan!");

    const cleanPhone = (cust.phone || "").replace(/[^0-9]/g, "");
    if (cleanPhone) {
      const encoded = encodeURIComponent(text);
      setTimeout(() => {
        window.location.href = `sms:${cleanPhone}?body=${encoded}`;
      }, 350);
    }
  }

  // ==========================================================================
  // Tab 1: Paninda (Inventory Products CRUD & Stock Tracking)
  // ==========================================================================

  function renderPanindaTab() {
    const products = appState.stapleProducts || [];
    const container = document.getElementById("products-inventory-list");
    if (!container) return;

    // Summary counts
    const totalCountEl = document.getElementById("paninda-total-count");
    const inStockEl = document.getElementById("paninda-in-stock-count");
    const lowStockEl = document.getElementById("paninda-low-stock-count");

    const inStockCount = products.filter(p => (p.stock || 0) > 0).length;
    const lowStockCount = products.filter(p => (p.stock || 0) <= 5).length;

    if (totalCountEl) totalCountEl.textContent = `${products.length} Paninda`;
    if (inStockEl) inStockEl.textContent = String(inStockCount);
    if (lowStockEl) {
      lowStockEl.textContent = String(lowStockCount);
      lowStockEl.style.color = lowStockCount > 0 ? "var(--accent-rose)" : "var(--accent-green)";
    }

    const searchQuery = (appState.productSearchQuery || "").trim().toLowerCase();
    const catFilter = appState.productCategoryFilter || "all";

    const filtered = products.filter(p => {
      if (catFilter === "low-stock") {
        if ((p.stock || 0) > 5) return false;
      } else if (catFilter !== "all" && p.category !== catFilter) {
        return false;
      }
      if (searchQuery) {
        const hay = `${p.name} ${p.category || ""} ${p.subtitle || ""}`.toLowerCase();
        return hay.includes(searchQuery);
      }
      return true;
    });

    container.innerHTML = "";

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <span class="empty-state-icon" aria-hidden="true">📦</span>
          <span class="empty-state-title">Walang nahanap na paninda</span>
          <span style="font-size: 13px; font-weight: 700;">Subukang maghanap ng ibang pangalan o magdagdag ng bagong paninda.</span>
        </div>
      `;
      return;
    }

    filtered.forEach(prod => {
      const isLow = (prod.stock || 0) <= 5;
      const card = document.createElement("div");
      card.className = "product-inventory-card";
      card.innerHTML = `
        <div class="product-card-left">
          <span class="product-card-icon" aria-hidden="true">${prod.emoji || prod.icon || "📦"}</span>
          <div class="product-card-details">
            <span class="product-card-title">${prod.name}</span>
            <span class="product-card-sub">${prod.category || "Paninda"}${prod.subtitle ? ` • ${prod.subtitle}` : ""}</span>
            <div class="product-card-pricing">
              <span class="product-price-tag">₱${Number(prod.price).toFixed(2)}</span>
              ${prod.cost ? `<span class="product-cost-tag">Puhunan: ₱${Number(prod.cost).toFixed(2)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="product-card-stock">
          <span class="stock-pill ${isLow ? "is-low-stock" : ""}">
            ${isLow ? "⚠️" : "📦"} ${prod.stock ?? 0} sa stock
          </span>
          <div class="product-card-actions">
            <button class="btn-action-small btn-edit-product touch-target" type="button" data-id="${prod.id}" title="I-edit">
              ✏️ Edit
            </button>
            <button class="btn-action-small btn-action-delete btn-delete-product touch-target" type="button" data-id="${prod.id}" title="Burahin">
              🗑️
            </button>
          </div>
        </div>
      `;

      card.querySelector(".btn-edit-product").addEventListener("click", () => openProductModal(prod.id));
      card.querySelector(".btn-delete-product").addEventListener("click", () => deleteProduct(prod.id));
      container.appendChild(card);
    });
  }

  function openProductModal(prodId = null) {
    playSound("tap");
    const backdrop = document.getElementById("product-modal-backdrop");
    const heading = document.getElementById("modal-product-heading");
    const idInput = document.getElementById("input-product-id");
    const nameInput = document.getElementById("input-product-name");
    const catInput = document.getElementById("input-product-category");
    const priceInput = document.getElementById("input-product-price");
    const costInput = document.getElementById("input-product-cost");
    const stockInput = document.getElementById("input-product-stock");

    if (prodId) {
      const prod = (appState.stapleProducts || []).find(p => p.id === prodId);
      if (!prod) return;
      heading.textContent = `✏️ I-Edit ang Paninda`;
      idInput.value = prod.id;
      nameInput.value = prod.name;
      catInput.value = prod.category || "Inumin";
      priceInput.value = prod.price;
      costInput.value = prod.cost ?? "";
      stockInput.value = prod.stock ?? 20;
    } else {
      heading.textContent = "📦 Magdagdag ng Bagong Paninda";
      idInput.value = "";
      nameInput.value = "";
      catInput.value = "Inumin";
      priceInput.value = "";
      costInput.value = "";
      stockInput.value = "20";
    }

    backdrop.classList.add("is-active");
    setTimeout(() => nameInput.focus(), 60);
  }

  function closeProductModal() {
    const backdrop = document.getElementById("product-modal-backdrop");
    if (backdrop) backdrop.classList.remove("is-active");
  }

  async function saveProductModalForm() {
    const idInput = document.getElementById("input-product-id");
    const nameInput = document.getElementById("input-product-name");
    const catInput = document.getElementById("input-product-category");
    const priceInput = document.getElementById("input-product-price");
    const costInput = document.getElementById("input-product-cost");
    const stockInput = document.getElementById("input-product-stock");

    const id = (idInput.value || "").trim();
    const name = (nameInput.value || "").trim();
    const category = catInput.value || "Paninda";
    const price = round2(priceInput.value || 0);
    const cost = costInput.value ? round2(costInput.value) : 0;
    const stock = parseInt(stockInput.value, 10) || 0;

    if (!name || name.length < 2) {
      playSound("alert");
      showToast("Pakilagay ang pangalan ng paninda.", "warning");
      nameInput.focus();
      return;
    }
    if (price <= 0) {
      playSound("alert");
      showToast("Ang presyo ay dapat mas malaki sa ₱0.", "warning");
      priceInput.focus();
      return;
    }

    const payload = { name, category, price, cost, stock };

    try {
      if (id) {
        const { data } = await apiRequest(`/api/products/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const updated = data && data.product ? data.product : { id, ...payload, emoji: "📦" };
        const idx = (appState.stapleProducts || []).findIndex(p => p.id === id);
        if (idx !== -1) {
          appState.stapleProducts[idx] = {
            ...appState.stapleProducts[idx],
            ...updated,
            emoji: updated.emoji || appState.stapleProducts[idx].emoji || "📦"
          };
        }
      } else {
        const { data } = await apiRequest("/api/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const created = data && data.product ? data.product : { id: `p_${Date.now()}`, ...payload, emoji: "📦" };
        if (!appState.stapleProducts) appState.stapleProducts = [];
        appState.stapleProducts.push({
          ...created,
          emoji: created.emoji || "📦"
        });
      }
      updateSyncBadge(true);
    } catch (_) {
      updateSyncBadge(false);
      if (id) {
        const idx = (appState.stapleProducts || []).findIndex(p => p.id === id);
        if (idx !== -1) {
          appState.stapleProducts[idx] = { ...appState.stapleProducts[idx], ...payload };
        }
      } else {
        appState.stapleProducts.push({ id: `p_${Date.now()}`, ...payload, emoji: "📦" });
      }
    }

    playSound("stamp");
    closeProductModal();
    saveLocalState();
    renderAll();
    showToast(id ? `Na-update ang panindang ${name}!` : `Naidagdag ang ${name}!`, "success");
  }

  async function deleteProduct(prodId) {
    const prod = (appState.stapleProducts || []).find(p => p.id === prodId);
    if (!prod) return;
    if (!confirm(`Sigurado ka bang nais mong burahin ang "${prod.name}" sa imbentaryo?`)) return;

    try {
      await apiRequest(`/api/products/${prodId}`, { method: "DELETE" });
      updateSyncBadge(true);
    } catch (_) {
      updateSyncBadge(false);
    }

    appState.stapleProducts = (appState.stapleProducts || []).filter(p => p.id !== prodId);
    playSound("tap");
    saveLocalState();
    renderAll();
    showToast(`Nabura ang paninda: ${prod.name}`, "info");
  }

  // ==========================================================================
  // Quick Utang Modal (BankAccount Charge Action)
  // ==========================================================================

  function openQuickUtangModal() {
    const cust = getSelectedCustomer();
    if (!cust) return;
    playSound("tap");
    const backdrop = document.getElementById("quick-utang-modal-backdrop");
    const nameEl = document.getElementById("quick-utang-cust-name");
    const idInput = document.getElementById("quick-utang-cust-id");
    const amtInput = document.getElementById("input-quick-utang-amount");
    const notesInput = document.getElementById("input-quick-utang-notes");

    if (nameEl) nameEl.textContent = cust.name;
    if (idInput) idInput.value = cust.id;
    if (amtInput) amtInput.value = "";
    if (notesInput) notesInput.value = "";

    backdrop.classList.add("is-active");
    setTimeout(() => {
      if (amtInput) amtInput.focus();
    }, 60);
  }

  function closeQuickUtangModal() {
    const backdrop = document.getElementById("quick-utang-modal-backdrop");
    if (backdrop) backdrop.classList.remove("is-active");
  }

  async function submitQuickUtangForm() {
    const idInput = document.getElementById("quick-utang-cust-id");
    const amtInput = document.getElementById("input-quick-utang-amount");
    const notesInput = document.getElementById("input-quick-utang-notes");

    const customerId = (idInput.value || "").trim();
    const amount = round2(amtInput.value || 0);
    const notes = (notesInput.value || "").trim() || "Credit Purchase (Utang)";

    if (!customerId) return;
    if (amount <= 0) {
      playSound("alert");
      showToast("Maglagay ng tamang halaga ng utang (mas malaki sa ₱0).", "warning");
      amtInput.focus();
      return;
    }

    closeQuickUtangModal();

    const cust = appState.customers.find(c => c.id === customerId);
    if (!cust) return;

    const riskEval = evaluateProjectedUtangRisk(cust, amount);
    if (riskEval.requiresWarningConfirmation) {
      openWarningConfirmationModal(riskEval);
      return;
    }

    const idempotencyKey = generateIdempotencyKey("utang_quick");
    try {
      const { data } = await apiRequest("/api/transactions/utang", {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerId,
          amount,
          items: notes,
          date: getTodayIso(),
          acknowledgeWarning: true,
          forceOverride: true,
          idempotencyKey
        })
      });

      if (data && Array.isArray(data.customers)) {
        appState.customers = data.customers.map(normalizeCustomerRecord);
      } else if (data && data.customer) {
        const idx = appState.customers.findIndex(c => c.id === customerId);
        if (idx !== -1) {
          appState.customers[idx] = normalizeCustomerRecord(data.customer);
        }
      }
      updateSyncBadge(true);
    } catch (err) {
      updateSyncBadge(false);
      // Local fallback
      cust.totalDebt = round2((cust.totalDebt || 0) + amount);
      cust.balance = cust.totalDebt;
      cust.history = cust.history || [];
      cust.history.unshift({
        id: idempotencyKey,
        customerId,
        type: "utang",
        amount,
        items: notes,
        date: getTodayIso()
      });
    }

    playSound("cash");
    saveLocalState();
    renderAll();
    showToast(`Naitala ang ₱${amount.toFixed(2)} utang ni ${cust.name}!`, "success");
  }

  // ==========================================================================
  // Rendering Routines: Tab 1 (Paninda), Tab 2 (Talaan/Suki), Tab 3 (Benta), Tab 4 (Bayad)
  // ==========================================================================

  function renderTalaanTab() {
    const customers = appState.customers || [];
    const totalDebt = round2(customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0));

    document.getElementById("talaan-total-collectibles").textContent = `₱${totalDebt.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    document.getElementById("talaan-active-pill").textContent = `${customers.length} Suki`;

    // Risk Tier Counts
    let safeCount = 0;
    let watchCount = 0;
    let dangerCount = 0;
    customers.forEach(c => {
      const st = getCustomerStatus(c);
      if (st.type === "danger") dangerCount += 1;
      else if (st.type === "watch") watchCount += 1;
      else safeCount += 1;
    });

    const safeEl = document.getElementById("tier-safe-count");
    const watchEl = document.getElementById("tier-watch-count");
    const dangerEl = document.getElementById("tier-danger-count");
    if (safeEl) safeEl.textContent = String(safeCount);
    if (watchEl) watchEl.textContent = String(watchCount);
    if (dangerEl) dangerEl.textContent = String(dangerCount);

    // Update Risk Filter Pill Labels
    const pillAll = document.getElementById("filter-pill-all");
    const pillSafe = document.getElementById("filter-pill-safe");
    const pillWatch = document.getElementById("filter-pill-watch");
    const pillDanger = document.getElementById("filter-pill-danger");
    if (pillAll) pillAll.textContent = `Lahat (${customers.length})`;
    if (pillSafe) pillSafe.textContent = `🟢 Safe (${safeCount})`;
    if (pillWatch) pillWatch.textContent = `🟡 Watch (${watchCount})`;
    if (pillDanger) pillDanger.textContent = `🔴 Kritikal (${dangerCount})`;

    // Adaptive Customer List (>5 Threshold Transformation)
    const isAdaptiveMode = customers.length > 5;
    const adaptiveControls = document.getElementById("adaptive-customer-controls");
    const adaptiveBadge = document.getElementById("adaptive-mode-badge");
    const container = document.getElementById("talaan-customer-chips");

    if (adaptiveControls) {
      adaptiveControls.classList.toggle("is-visible", isAdaptiveMode);
    }
    if (adaptiveBadge) {
      adaptiveBadge.textContent = isAdaptiveMode
        ? `⚡ Adaptive Directory (${customers.length} Suki — Search & Filter Active)`
        : `Standard Ribbon (${customers.length} Suki)`;
    }
    if (container) {
      container.classList.toggle("mode-adaptive", isAdaptiveMode);
      container.innerHTML = "";
    }

    const searchQuery = (appState.customerSearchQuery || "").trim().toLowerCase();
    const riskFilter = appState.customerRiskFilter || "all";

    const filteredCustomers = customers.filter(cust => {
      const status = getCustomerStatus(cust);
      if (riskFilter !== "all" && status.type !== riskFilter) {
        return false;
      }
      if (searchQuery) {
        const hay = `${cust.name} ${cust.phone || ""} ${cust.notes || ""}`.toLowerCase();
        return hay.includes(searchQuery);
      }
      return true;
    });

    if (filteredCustomers.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 12px; font-size: 12px; font-weight: 800; color: var(--text-muted);">Walang nahanap na Suki sa filter na ito.</div>`;
    } else {
      filteredCustomers.forEach(cust => {
        const isSelected = cust.id === appState.selectedCustomerId;
        const status = getCustomerStatus(cust);
        const draftBasket = getCustomerBasket(cust.id);
        const draftTotal = computeBasketTotal(draftBasket);

        const chip = document.createElement("button");
        chip.type = "button";
        chip.setAttribute("role", "option");
        chip.setAttribute("aria-selected", isSelected ? "true" : "false");
        chip.className = `customer-chip touch-target ${isSelected ? "active" : ""} ${status.type === "danger" ? "alert-state" : ""}`;

        const isSettled = cust.totalDebt === 0;
        const debtColor =
          isSettled
            ? "#16a34a"
            : status.type === "danger"
            ? "var(--accent-rose)"
            : status.type === "watch"
            ? "var(--accent-amber)"
            : "var(--text-primary)";

        chip.innerHTML = `
          <span class="chip-avatar" aria-hidden="true">${cust.avatar || "🧑"}</span>
          <div class="chip-meta">
            <div class="chip-name-row">
              <span class="chip-name">${cust.name}</span>
              <span class="traffic-dot ${status.dotClass}" title="${status.label}"></span>
            </div>
            <div class="chip-sub-row">
              <span class="chip-debt-text ${isSettled ? "settled" : ""}" style="color: ${debtColor}">
                ${isSettled ? "₱0.00 Settled" : `₱${cust.totalDebt.toFixed(2)}`}
              </span>
              ${draftTotal > 0 ? `<span class="chip-basket-badge" title="May naka-pending sa basket">🛒 ₱${draftTotal.toFixed(0)}</span>` : ""}
            </div>
          </div>
        `;

        chip.addEventListener("click", () => selectCustomer(cust.id));
        container.appendChild(chip);
      });
    }

    // Selected Customer Overview Card
    const cust = getSelectedCustomer();
    if (!cust) return;

    const status = getCustomerStatus(cust);
    document.getElementById("overview-cust-name").textContent = cust.name;
    const badgeEl = document.getElementById("overview-risk-badge");
    if (badgeEl) {
      badgeEl.className = `risk-status-badge ${status.badgeClass}`;
      badgeEl.textContent = `${status.label} (${Math.round(status.utilizationPercent)}%)`;
    }

    document.getElementById("overview-cust-phone").textContent = `📱 ${cust.phone || "Walang #"}`;
    const notesEl = document.getElementById("overview-cust-notes");
    if (notesEl) {
      notesEl.textContent = cust.notes ? `📝 ${cust.notes}` : "";
    }

    const debtEl = document.getElementById("overview-cust-debt");
    if (cust.totalDebt === 0) {
      debtEl.textContent = "₱0.00 Settled";
      debtEl.style.color = "#16a34a";
    } else {
      debtEl.textContent = `₱${cust.totalDebt.toFixed(2)}`;
      debtEl.style.color =
        status.type === "danger"
          ? "var(--accent-rose)"
          : status.type === "watch"
          ? "var(--accent-amber)"
          : "var(--text-primary)";
    }

    document.getElementById("overview-cust-limit").textContent = `Limit: ₱${cust.creditLimit.toFixed(2)}`;

    const percent = Math.min(100, Math.round((cust.totalDebt / cust.creditLimit) * 100));
    const fillBar = document.getElementById("overview-progress-fill");
    const progBar = document.getElementById("overview-progress-bar");
    if (progBar) progBar.setAttribute("aria-valuenow", String(percent));
    if (fillBar) {
      fillBar.style.width = `${percent}%`;
      fillBar.style.backgroundColor =
        status.type === "danger"
          ? "var(--accent-rose-fill)"
          : status.type === "watch"
          ? "var(--accent-amber-fill)"
          : "var(--accent-green-strong)";
    }

    const lastUtang = (cust.history || []).find(h => h.type === "utang");
    const pill = document.getElementById("overview-last-utang-pill");
    if (lastUtang) {
      const days = calculateDaysAgo(lastUtang.date);
      pill.textContent =
        days === 0
          ? "Huling utang: Ngayong araw"
          : days === 1
          ? "Huling utang: Kahapon"
          : `Huling utang: ${days} araw na ang nakalipas`;
      if (days >= 14 && cust.totalDebt > 0) {
        pill.style.background = "var(--accent-rose-bg)";
        pill.style.color = "var(--accent-rose)";
        pill.style.borderColor = "var(--accent-rose-border)";
      } else {
        pill.style.background = "var(--bg-card-alt)";
        pill.style.color = "var(--text-muted)";
        pill.style.borderColor = "var(--border-color)";
      }
    } else {
      pill.textContent = "Walang naitalang utang";
      pill.style.background = "var(--bg-card-alt)";
      pill.style.color = "var(--text-muted)";
      pill.style.borderColor = "var(--border-color)";
    }

    document.getElementById("overview-rating-badge").textContent = `⭐ ${cust.repaymentRate}% ${status.tagalogLabel}`;

    const warnBox = document.getElementById("overview-warning-box");
    if (warnBox) {
      if (status.warningMessage) {
        warnBox.textContent = status.warningMessage;
        warnBox.className = `overview-warning-box is-visible ${status.type === "watch" ? "is-watch" : ""}`;
      } else {
        warnBox.className = "overview-warning-box";
        warnBox.textContent = "";
      }
    }

    renderCalendar();
  }

  function renderCalendar() {
    const cust = getSelectedCustomer();
    const grid = document.getElementById("calendar-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();

    const monthNames = [
      "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
      "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"
    ];
    document.getElementById("cal-month-title").textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "cal-cell empty";
      grid.appendChild(emptyCell);
    }

    const todayStr = getTodayIso();
    const history = cust ? cust.history || [] : [];

    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement("button");
      cell.type = "button";
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedInspectedDate;

      cell.className = `cal-cell touch-target ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`;
      cell.setAttribute("aria-label", `${monthNames[month]} ${day}, ${year}`);

      const dayTxs = history.filter(t => t.date === dateStr);
      const hasUtang = dayTxs.some(t => t.type === "utang");
      const hasPayment = dayTxs.some(t => t.type === "payment");

      let markerHtml = `<div class="cal-marker-row">`;
      if (hasUtang && hasPayment) {
        markerHtml += `
          <div class="cal-split-indicator" title="Utang at Bayad">
            <div class="split-utang"></div>
            <div class="split-payment"></div>
          </div>
        `;
      } else if (hasUtang) {
        markerHtml += `<span class="cal-dot cal-dot-utang" title="Utang"></span>`;
      } else if (hasPayment) {
        markerHtml += `<span class="cal-dot cal-dot-payment" title="Bayad"></span>`;
      }
      markerHtml += `</div>`;

      cell.innerHTML = `
        <span class="cal-day-number">${day}</span>
        ${markerHtml}
      `;

      cell.addEventListener("click", () => {
        playSound("tap");
        selectedInspectedDate = dateStr;
        renderCalendar();
        renderInspectCard();
      });

      grid.appendChild(cell);
    }

    renderInspectCard();
  }

  function renderInspectCard() {
    const cust = getSelectedCustomer();
    const container = document.getElementById("inspect-content-list");
    const titleEl = document.getElementById("inspect-date-header");
    if (!container || !titleEl) return;

    const [y, m, d] = selectedInspectedDate.split("-");
    const monthNames = [
      "Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo",
      "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"
    ];
    titleEl.textContent = `📅 ${monthNames[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;

    const history = cust ? cust.history || [] : [];
    const dayTxs = history.filter(t => t.date === selectedInspectedDate);

    if (dayTxs.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; font-weight: 700; padding: 2px 0;">Walang transaksyon sa petsang ito.</div>`;
      return;
    }

    container.innerHTML = "";
    dayTxs.forEach(tx => {
      const isUtang = tx.type === "utang";
      const row = document.createElement("div");
      row.className = "inspect-row";
      row.innerHTML = `
        <div class="inspect-desc">
          ${isUtang ? "🔴 Utang:" : "🟢 Bayad:"} ${tx.items ? tx.items : "Cash payment"}
        </div>
        <div class="inspect-amount" style="color: ${isUtang ? "var(--accent-rose)" : "var(--accent-green)"}">
          ${isUtang ? `+₱${Number(tx.amount).toFixed(2)}` : `-₱${Number(tx.amount).toFixed(2)}`}
        </div>
      `;
      container.appendChild(row);
    });
  }

  /**
   * Renders Tab 2 (`Benta`): Speed Board, Custom Tingi Drawer, Basket & Dynamic Risk Pill.
   * Fixes QA-005: `#benta-cust-debt-pill` dynamically changes color/badge based on customer risk.
   */
  function renderBentaTab() {
    const cust = getSelectedCustomer();
    if (!cust) return;

    syncActiveBasketPointer();
    const status = getCustomerStatus(cust);

    document.getElementById("benta-cust-name").textContent = cust.name;
    const ownerLabel = document.getElementById("basket-owner-label");
    if (ownerLabel) ownerLabel.textContent = cust.name;

    const debtPill = document.getElementById("benta-cust-debt-pill");
    if (debtPill) {
      debtPill.className = `active-cust-debt-pill ${status.pillClass}`;
      debtPill.textContent = `${status.type === "danger" ? "🔴" : status.type === "watch" ? "🟡" : "🟢"} Utang: ₱${cust.totalDebt.toFixed(2)} / ₱${cust.creditLimit.toFixed(0)} (${status.label})`;
    }

    renderSpeedBoard();
    renderBasket();
  }

  function renderSpeedBoard() {
    const container = document.getElementById("speed-board-grid");
    if (!container) return;
    container.innerHTML = "";

    const basket = getCustomerBasket(appState.selectedCustomerId);

    appState.stapleProducts.forEach(prod => {
      const qty = basket.items[prod.id] || 0;
      const tile = document.createElement("div");
      tile.className = `product-tile touch-target ${qty > 0 ? "in-basket" : ""}`;
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", `Idagdag ang ${prod.name}, ₱${prod.price.toFixed(2)}`);

      tile.innerHTML = `
        <div class="tile-left">
          <span class="tile-emoji" aria-hidden="true">${prod.emoji || prod.icon || "📦"}</span>
          <div class="tile-info">
            <span class="tile-name">${prod.shortName || prod.name}</span>
            <span class="tile-sub">${prod.subtitle || prod.tagalog || ""}</span>
            <span class="tile-price">₱${Number(prod.price).toFixed(2)}</span>
          </div>
        </div>
        <div class="tile-controls">
          ${qty > 0 ? `<span class="tile-badge">+${qty}</span>` : ""}
          ${qty > 0 ? `<button type="button" class="btn-tile-minus touch-target" aria-label="Bawasan ang ${prod.name}" title="Bawasan ng 1">➖</button>` : ""}
        </div>
      `;

      tile.addEventListener("click", e => {
        if (e.target && e.target.closest(".btn-tile-minus")) {
          e.stopPropagation();
          decrementProductFromBasket(prod.id);
          return;
        }
        addProductToBasket(prod.id);
      });

      tile.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          addProductToBasket(prod.id);
        }
      });

      container.appendChild(tile);
    });
  }

  function renderBasket() {
    const cust = getSelectedCustomer();
    const previewEl = document.getElementById("basket-items-preview");
    const totalEl = document.getElementById("basket-total-amount");
    const ilistaBtn = document.getElementById("btn-ilista");
    const riskBanner = document.getElementById("benta-risk-banner");
    const riskBannerTitle = document.getElementById("benta-risk-banner-title");
    const riskBannerText = document.getElementById("benta-risk-banner-text");

    const basket = getCustomerBasket(appState.selectedCustomerId);
    const total = computeBasketTotal(basket);

    if (previewEl) previewEl.textContent = getBasketSummaryText();
    if (totalEl) totalEl.textContent = `₱${total.toFixed(2)}`;

    const evaluation = cust ? evaluateProjectedUtangRisk(cust, total) : null;

    if (riskBanner && evaluation) {
      if (evaluation.triggersRedWarning) {
        riskBanner.className = "benta-risk-banner is-visible";
        riskBannerTitle.textContent = "⚠️ Babala sa Kritikal na Utang (Flexible Warning Mode)";
        riskBannerText.textContent = evaluation.warningMessage;
      } else if (evaluation.projectedStatus.type === "watch") {
        riskBanner.className = "benta-risk-banner is-watch is-visible";
        riskBannerTitle.textContent = "🟡 Paalala: Watch Tier Credit Limit";
        riskBannerText.textContent = evaluation.warningMessage;
      } else {
        riskBanner.className = "benta-risk-banner";
      }
    }

    if (ilistaBtn) {
      if (total > 0) {
        ilistaBtn.disabled = false;
        const isWarn = evaluation && evaluation.requiresWarningConfirmation;
        ilistaBtn.classList.toggle("is-warning-mode", Boolean(isWarn));
        ilistaBtn.innerHTML = isWarn
          ? `<span aria-hidden="true">⚠️</span> ILISTA PA RIN (BABALA) ₱${total.toFixed(2)}`
          : `<span aria-hidden="true">✍️</span> ILISTA (UTANG) ₱${total.toFixed(2)}`;
      } else {
        ilistaBtn.disabled = true;
        ilistaBtn.classList.remove("is-warning-mode");
        ilistaBtn.innerHTML = `<span aria-hidden="true">✍️</span> ILISTA (UTANG) ₱0.00`;
      }
    }
  }

  function renderBayadTab() {
    const cust = getSelectedCustomer();
    if (!cust) return;

    const debt = round2(Math.max(0, cust.totalDebt ?? cust.balance ?? 0));
    document.getElementById("bayad-target-name").textContent = cust.name;

    const debtBig = document.getElementById("bayad-target-debt");
    debtBig.textContent = `₱${debt.toFixed(2)}`;
    debtBig.classList.toggle("is-zero", debt === 0);

    const payFullBtn = document.getElementById("btn-pay-full");
    if (payFullBtn) {
      if (debt > 0) {
        payFullBtn.innerHTML = `✅ Bayad Eksakto (₱${debt.toFixed(2)})`;
        payFullBtn.disabled = false;
      } else {
        payFullBtn.innerHTML = `✅ Bayad na Lahat (₱0.00)`;
        payFullBtn.disabled = true;
      }
    }

    document.querySelectorAll(".btn-quick-pay").forEach(btn => {
      if (btn.id !== "btn-pay-full") {
        btn.disabled = debt <= 0;
      }
    });

    const customPayBtn = document.getElementById("btn-custom-pay");
    if (customPayBtn) customPayBtn.disabled = debt <= 0;

    // Recent Activity Audit Feed (Last 5 Transactions)
    const container = document.getElementById("bayad-timeline-list");
    if (!container) return;
    container.innerHTML = "";

    const history = cust.history || [];
    const recentItems = history.slice(0, 5);

    if (recentItems.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; font-weight: 800; padding: 12px 0;">Walang nakaraang talaan para kay ${cust.name}.</div>`;
      return;
    }

    recentItems.forEach(tx => {
      const isUtang = tx.type === "utang";
      const item = document.createElement("div");
      item.className = `timeline-item ${isUtang ? "is-utang" : "is-payment"}`;

      const sukliNote =
        !isUtang && Number(tx.sukli) > 0
          ? ` (Inabot: ₱${Number(tx.tendered).toFixed(0)}, Sukli: ₱${Number(tx.sukli).toFixed(2)})`
          : "";

      item.innerHTML = `
        <div class="timeline-left">
          <span class="timeline-dot" style="background-color: ${isUtang ? "var(--accent-rose-fill)" : "var(--accent-green-strong)"}"></span>
          <div class="timeline-meta">
            <span class="timeline-tags">${isUtang ? tx.items || "Utang" : `Bayad${sukliNote}`}</span>
            <span class="timeline-date">${tx.date}</span>
          </div>
        </div>
        <div class="timeline-amt" style="color: ${isUtang ? "var(--accent-rose)" : "var(--accent-green)"}">
          ${isUtang ? `+₱${Number(tx.amount).toFixed(2)}` : `-₱${Number(tx.amount).toFixed(2)}`}
        </div>
      `;

      container.appendChild(item);
    });
  }

  function renderAll() {
    renderPanindaTab();
    renderTalaanTab();
    renderBentaTab();
    renderBayadTab();
  }

  // ==========================================================================
  // Event Listeners Binding (with Scoped Action Locks — Fixes QA-006 & QA-007)
  // ==========================================================================

  function switchTab(targetId) {
    playSound("tap");
    document.querySelectorAll(".bottom-tab-btn").forEach(b => {
      const isMatch = b.getAttribute("data-target") === targetId;
      b.classList.toggle("active", isMatch);
      b.setAttribute("aria-selected", isMatch ? "true" : "false");
    });
    document.querySelectorAll(".tab-pane").forEach(p => {
      p.classList.toggle("active", p.id === targetId);
    });
  }

  function setupEventListeners() {
    // 1. 4-Tab Bottom Navigation (ARIA Tablist)
    document.querySelectorAll(".bottom-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        if (target) switchTab(target);
      });
    });

    // 2. Header Controls
    document.getElementById("btn-theme-toggle").addEventListener("click", toggleTheme);

    const soundBtn = document.getElementById("btn-sound-toggle");
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
      if (soundEnabled) playSound("tap");
    });

    document.getElementById("btn-reset-data").addEventListener("click", resetToFactorySeed);

    // 3. Paninda (Inventory) Search & Category Filters
    const prodSearchInput = document.getElementById("product-search-input");
    const clearProdSearchBtn = document.getElementById("btn-clear-prod-search");
    if (prodSearchInput) {
      prodSearchInput.addEventListener("input", () => {
        appState.productSearchQuery = prodSearchInput.value || "";
        if (clearProdSearchBtn) {
          clearProdSearchBtn.classList.toggle("is-visible", Boolean(appState.productSearchQuery));
        }
        renderPanindaTab();
      });
    }
    if (clearProdSearchBtn) {
      clearProdSearchBtn.addEventListener("click", () => {
        playSound("tap");
        appState.productSearchQuery = "";
        if (prodSearchInput) prodSearchInput.value = "";
        clearProdSearchBtn.classList.remove("is-visible");
        renderPanindaTab();
      });
    }

    document.querySelectorAll("#prod-category-filter-row .risk-filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        playSound("tap");
        const cat = pill.getAttribute("data-prod-cat") || "all";
        appState.productCategoryFilter = cat;
        document.querySelectorAll("#prod-category-filter-row .risk-filter-pill").forEach(p => {
          p.classList.toggle("active", (p.getAttribute("data-prod-cat") || "all") === cat);
        });
        renderPanindaTab();
      });
    });

    // 4. Paninda Add / Edit Modal Controls
    const btnOpenAddProd = document.getElementById("btn-open-add-product");
    if (btnOpenAddProd) {
      btnOpenAddProd.addEventListener("click", () => openProductModal(null));
    }
    const btnCancelProd = document.getElementById("btn-cancel-product");
    if (btnCancelProd) {
      btnCancelProd.addEventListener("click", closeProductModal);
    }
    const btnSaveProd = document.getElementById("btn-save-product");
    if (btnSaveProd) {
      btnSaveProd.addEventListener("click", withActionLock("save-product", saveProductModalForm, 400));
    }

    // 5. Direct Suki Card Action Buttons
    const btnCustAddUtang = document.getElementById("btn-customer-add-utang");
    if (btnCustAddUtang) {
      btnCustAddUtang.addEventListener("click", openQuickUtangModal);
    }
    const btnCustPay = document.getElementById("btn-customer-pay");
    if (btnCustPay) {
      btnCustPay.addEventListener("click", () => switchTab("tab-bayad"));
    }

    // 6. Quick Utang Modal Controls
    const btnCancelQuickUtang = document.getElementById("btn-cancel-quick-utang");
    if (btnCancelQuickUtang) {
      btnCancelQuickUtang.addEventListener("click", closeQuickUtangModal);
    }
    const btnSubmitQuickUtang = document.getElementById("btn-submit-quick-utang");
    if (btnSubmitQuickUtang) {
      btnSubmitQuickUtang.addEventListener("click", withActionLock("quick-utang", submitQuickUtangForm, 400));
    }

    // 7. Adaptive Customer Search & Risk Filter Controls (>5 Suki Threshold)
    const searchInput = document.getElementById("customer-search-input");
    const clearSearchBtn = document.getElementById("btn-clear-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        appState.customerSearchQuery = searchInput.value || "";
        if (clearSearchBtn) {
          clearSearchBtn.classList.toggle("is-visible", Boolean(appState.customerSearchQuery));
        }
        renderTalaanTab();
      });
    }
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", () => {
        playSound("tap");
        appState.customerSearchQuery = "";
        if (searchInput) searchInput.value = "";
        clearSearchBtn.classList.remove("is-visible");
        renderTalaanTab();
      });
    }

    document.querySelectorAll("#tab-talaan .risk-filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        playSound("tap");
        const filterVal = pill.getAttribute("data-risk-filter") || "all";
        appState.customerRiskFilter = filterVal;
        document.querySelectorAll("#tab-talaan .risk-filter-pill").forEach(p => {
          p.classList.toggle("active", p.getAttribute("data-risk-filter") === filterVal);
        });
        renderTalaanTab();
      });
    });

    // 8. Add New Suki & Edit Credit Limit Modal
    document.getElementById("btn-open-add-suki").addEventListener("click", () => openAddSukiModal("create"));
    document.getElementById("btn-edit-limit").addEventListener("click", () => openAddSukiModal("edit-limit"));
    document.getElementById("btn-cancel-suki").addEventListener("click", closeAddSukiModal);
    document.getElementById("btn-save-suki").addEventListener(
      "click",
      withActionLock("save-suki", saveSukiModalForm, 400)
    );

    // 9. Kasunduan SMS / Copy
    document.getElementById("btn-kasunduan").addEventListener("click", sendKasunduan);

    // 10. Calendar Month Navigations
    document.getElementById("btn-cal-prev").addEventListener("click", () => {
      playSound("tap");
      currentCalDate.setMonth(currentCalDate.getMonth() - 1);
      renderCalendar();
    });

    document.getElementById("btn-cal-next").addEventListener("click", () => {
      playSound("tap");
      currentCalDate.setMonth(currentCalDate.getMonth() + 1);
      renderCalendar();
    });

    // 11. Bilis-Tingi Micro-Credit Buttons (Scoped lock: "tingi" — does NOT block "ilista")
    const lockedAddTingi = withActionLock("tingi", addTingiToBasket, 180);
    document.querySelectorAll(".btn-tingi-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = Number(btn.getAttribute("data-tingi"));
        lockedAddTingi(val);
      });
    });

    // 12. Custom Tingi Price Drawer
    const toggleCustomTingiBtn = document.getElementById("btn-toggle-custom-tingi");
    const customTingiDrawer = document.getElementById("custom-tingi-drawer");
    if (toggleCustomTingiBtn && customTingiDrawer) {
      toggleCustomTingiBtn.addEventListener("click", () => {
        playSound("tap");
        const isOpen = customTingiDrawer.classList.toggle("is-open");
        toggleCustomTingiBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (isOpen) {
          const amtInput = document.getElementById("custom-tingi-amount");
          if (amtInput) amtInput.focus();
        }
      });
    }

    document.querySelectorAll(".tingi-tag-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        playSound("tap");
        document.querySelectorAll(".tingi-tag-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        const label = chip.getAttribute("data-label") || "Custom Tingi";
        const nameInput = document.getElementById("custom-tingi-name");
        if (nameInput) nameInput.value = label;
      });
    });

    document.getElementById("btn-add-custom-tingi").addEventListener(
      "click",
      withActionLock("custom-tingi", addCustomTingiItem, 250)
    );

    // 13. Clear Basket & Commit Utang ("ILISTA" — Scoped lock: "ilista")
    document.getElementById("btn-clear-basket").addEventListener("click", clearBasket);

    const lockedSubmitDebt = withActionLock("ilista", () => executeSubmitDebt(false), 400);
    document.getElementById("btn-ilista").addEventListener("click", lockedSubmitDebt);

    // 14. Flexible Warning Mode Confirmation Modal Actions
    document.getElementById("btn-confirm-warning-override").addEventListener(
      "click",
      withActionLock("ilista-override", () => executeSubmitDebt(true), 400)
    );
    document.getElementById("btn-cancel-warning").addEventListener("click", () => {
      playSound("tap");
      closeWarningConfirmationModal();
    });

    // 15. Quick Pay Chips & Custom Pay Input (Scoped lock: "bayad")
    const lockedQuickPay = withActionLock("bayad", executeQuickPay, 400);
    document.querySelectorAll(".btn-quick-pay").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-pay");
        lockedQuickPay(val);
      });
    });

    document.getElementById("btn-custom-pay").addEventListener("click", () => {
      const input = document.getElementById("custom-pay-amount");
      const val = input ? Number(input.value) : 0;
      lockedQuickPay(val);
    });

    // 16. Dismiss Sukli Modal
    document.getElementById("btn-dismiss-sukli").addEventListener("click", dismissSukliModal);
  }

  // ==========================================================================
  // Expose Public Hooks for Automated QA & Integration Verification
  // ==========================================================================

  window.SariSyncApp = {
    getState: () => appState,
    selectCustomer,
    addProductToBasket,
    decrementProductFromBasket,
    addTingiToBasket,
    clearBasket,
    executeSubmitDebt,
    executeQuickPay,
    getCustomerStatus,
    evaluateProjectedUtangRisk,
    withActionLock,
    round2,
    bootstrapFromServer,
    renderPanindaTab,
    openProductModal,
    closeProductModal,
    saveProductModalForm,
    deleteProduct,
    openQuickUtangModal,
    closeQuickUtangModal,
    submitQuickUtangForm
  };

  // Initialize on DOM Ready
  document.addEventListener("DOMContentLoaded", () => {
    loadLocalState();
    applyTheme(appState.theme || "light");
    setupEventListeners();
    renderAll();
    bootstrapFromServer();
  });
})();
