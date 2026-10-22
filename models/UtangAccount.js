/**
 * UtangAccount.js — BankAccount-Style Customer Store Credit/Debt Model
 *
 * Direct Object-Oriented Parallel to an Introductory Java `BankAccount` Class:
 *
 * In an introductory Java OOP course, students write:
 * ```java
 * public class BankAccount {
 *     private String accountNumber;
 *     private String accountHolder;
 *     private double balance;
 *
 *     public BankAccount(String id, String name, double initialBalance) {
 *         this.accountNumber = id;
 *         this.accountHolder = name;
 *         this.balance = initialBalance;
 *     }
 *
 *     public void deposit(double amount) {
 *         if (amount <= 0) throw new IllegalArgumentException("Amount must be a positive number");
 *         this.balance += amount;
 *     }
 *
 *     public void withdraw(double amount) {
 *         if (amount <= 0) throw new IllegalArgumentException("Amount must be a positive number");
 *         this.balance -= amount;
 *     }
 *
 *     public double getBalance() {
 *         return this.balance;
 *     }
 * }
 * ```
 *
 * In a Philippine neighborhood sari-sari store ("tindahan"), informal credit ("pa-utang")
 * operates on the EXACT SAME mathematical mental model:
 * - A customer's "balance" is the unpaid credit amount they owe the tindahan (in PHP ₱).
 * - `deposit(amount)` (or `payUtang`): The customer hands cash to pay down their utang.
 *   This SUBTRACTS from their debt balance using transparent arithmetic. If they tender
 *   more than they owe, the debt clamps at ₱0.00 (Zero-Floor Guard) and exact change
 *   ("sukli") is computed.
 * - `addUtang(amount)` (or `charge` / `withdraw`): The customer takes store goods on credit.
 *   This ADDS to their debt balance (`this.balance += amount`) with exact 2-decimal precision.
 * - `getBalance()`: Returns the customer's current outstanding utang balance.
 */

class UtangAccount {
  /**
   * Constructs a new customer account instance.
   *
   * @param {Object} data - Customer data object
   * @param {string} data.id - Customer ID (e.g. "c1")
   * @param {string} [data.customerId] - Alias for customer ID
   * @param {string} data.name - Customer name (e.g. "Aling Nena")
   * @param {string} [data.customerName] - Alias for customer name
   * @param {string} [data.phone] - Optional phone number
   * @param {number} [data.balance] - Existing unpaid utang balance (defaults to 0)
   * @param {number} [data.totalDebt] - Legacy alias for balance
   * @param {number} [data.creditLimit] - Maximum allowable utang before warning (defaults to 500)
   * @param {Array} [data.transactions] - Transaction history
   * @param {string} [data.notes] - Storekeeper notes
   */
  constructor(data = {}) {
    this.customerId = String(data.id || data.customerId || `c_${Date.now()}`);
    this.customerName = String(data.name || data.customerName || "Bagong Suki").trim();
    this.phone = String(data.phone || "").trim();
    this.creditLimit = UtangAccount.round2(Number(data.creditLimit) > 0 ? Number(data.creditLimit) : 500);
    this.notes = String(data.notes || "").trim();
    this.avatar = data.avatar || "👤";
    this.daysOverdue = Number.isFinite(Number(data.daysOverdue)) ? Number(data.daysOverdue) : 0;
    this.repaymentRate = Number.isFinite(Number(data.repaymentRate)) ? Number(data.repaymentRate) : 90;
    this.createdAt = data.createdAt || new Date().toISOString();

    // Utang balance: initialized to existing balance/totalDebt, or 0.00
    const rawBalance = data.balance !== undefined ? data.balance : data.totalDebt;
    this.balance = UtangAccount.round2(Number.isFinite(Number(rawBalance)) && Number(rawBalance) > 0 ? Number(rawBalance) : 0);

    // Transaction history ledger
    this.transactions = Array.isArray(data.transactions) ? data.transactions : [];
  }

  /**
   * Helper to round numbers to 2 decimal places, avoiding IEEE-754 floating-point drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
   *
   * @param {number|string} val
   * @returns {number}
   */
  static round2(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  /**
   * Validates that an amount is a finite, positive number greater than zero.
   * Throws an error suitable for a 400 Bad Request response if invalid.
   *
   * @param {any} amount
   * @returns {number}
   */
  static validatePositiveAmount(amount) {
    if (amount === null || amount === undefined || amount === "" || typeof amount === "boolean") {
      throw new Error("Amount must be a positive number");
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || isNaN(num) || num <= 0) {
      throw new Error("Amount must be a positive number");
    }
    return UtangAccount.round2(num);
  }

  /**
   * Customer pays down their utang (identical to BankAccount.deposit()).
   *
   * In a bank account: deposit increases your cash holdings.
   * In a sari-sari utang account: deposit reduces your outstanding debt.
   *
   * Zero-Floor Guard: If tendered payment exceeds current debt balance,
   * the debt balance is clamped strictly to ₱0.00 (never negative),
   * and the exact sukli (change) is calculated and returned.
   *
   * @param {number|string} amount - Cash tendered by the customer
   * @param {string} [note="Cash payment"] - Optional note or description
   * @returns {Object} Payment result breakdown with updated balance and sukli
   */
  deposit(amount, note = "Cash payment") {
    const tendered = UtangAccount.validatePositiveAmount(amount);
    const priorDebt = this.balance;

    if (priorDebt <= 0) {
      // Customer has no unpaid debt: whole amount is returned as sukli
      return {
        customerId: this.customerId,
        customerName: this.customerName,
        priorDebt: 0,
        tenderedAmount: tendered,
        deductedAmount: 0,
        remainingDebt: 0,
        sukli: tendered,
        isOverpayment: true,
        isFullSettlement: true,
        balance: 0
      };
    }

    // Simple, transparent arithmetic:
    // Deducted amount cannot exceed current debt
    const deducted = Math.min(priorDebt, tendered);
    const sukli = UtangAccount.round2(Math.max(0, tendered - priorDebt));
    const newDebt = UtangAccount.round2(Math.max(0, priorDebt - tendered));

    // Update customer debt balance (strictly clamped at 0.00)
    this.balance = newDebt;

    // Reset overdue days if debt is fully cleared
    if (this.balance === 0) {
      this.daysOverdue = 0;
      this.repaymentRate = Math.min(100, Math.max(this.repaymentRate, 95));
    } else {
      this.repaymentRate = Math.min(100, this.repaymentRate + 1);
    }

    const txRecord = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      customerId: this.customerId,
      customerName: this.customerName,
      type: "payment",
      amount: deducted,
      tendered,
      tenderedAmount: tendered,
      deductedAmount: deducted,
      sukli,
      isOverpayment: sukli > 0,
      isFullSettlement: newDebt === 0,
      priorBalance: priorDebt,
      newBalance: newDebt,
      items: String(note || "Cash payment").trim(),
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString()
    };

    this.transactions.unshift(txRecord);

    return {
      customerId: this.customerId,
      customerName: this.customerName,
      priorDebt,
      tenderedAmount: tendered,
      deductedAmount: deducted,
      remainingDebt: newDebt,
      sukli,
      isOverpayment: sukli > 0,
      isFullSettlement: newDebt === 0,
      balance: this.balance,
      transaction: txRecord
    };
  }

  /**
   * Alias for deposit() using Philippine terminology ("payUtang").
   *
   * @param {number|string} amount
   * @param {string} [note]
   * @returns {Object}
   */
  payUtang(amount, note) {
    return this.deposit(amount, note);
  }

  /**
   * Adds an informal credit purchase ("pa-utang") to the customer's account.
   *
   * In a bank account: charge() or withdraw() increases debt or decreases cash.
   * In a sari-sari utang account: addUtang() ADDS to the customer's unpaid balance:
   *   this.balance = round2(this.balance + amount);
   *
   * @param {number|string} amount - Purchase total to be credited to utang
   * @param {string|Array} [itemsOrNote="Store goods credit"] - Description or item breakdown
   * @returns {Object} Charge result with prior debt, added amount, and new debt
   */
  addUtang(amount, itemsOrNote = "Store goods credit") {
    const chargeAmount = UtangAccount.validatePositiveAmount(amount);
    const priorDebt = this.balance;

    // Simple, transparent arithmetic:
    const newDebt = UtangAccount.round2(priorDebt + chargeAmount);
    this.balance = newDebt;

    let itemsDescription = "Store goods credit";
    let itemList = [];
    if (typeof itemsOrNote === "string") {
      itemsDescription = itemsOrNote;
    } else if (Array.isArray(itemsOrNote)) {
      itemList = itemsOrNote;
      itemsDescription = itemsOrNote.map(it => `${it.qty || it.quantity || 1}x ${it.name || it.productName || "Paninda"}`).join(", ");
    }

    const txRecord = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      customerId: this.customerId,
      customerName: this.customerName,
      type: "utang",
      amount: chargeAmount,
      items: itemsDescription,
      itemList,
      priorBalance: priorDebt,
      newBalance: newDebt,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString()
    };

    this.transactions.unshift(txRecord);

    return {
      customerId: this.customerId,
      customerName: this.customerName,
      priorDebt,
      addedAmount: chargeAmount,
      newDebt,
      balance: this.balance,
      transaction: txRecord
    };
  }

  /**
   * Alias for addUtang() (charge goods on credit).
   *
   * @param {number|string} amount
   * @param {string|Array} [itemsOrNote]
   * @returns {Object}
   */
  charge(amount, itemsOrNote) {
    return this.addUtang(amount, itemsOrNote);
  }

  /**
   * Alias for addUtang() (mirroring BankAccount.withdraw()).
   *
   * @param {number|string} amount
   * @param {string|Array} [itemsOrNote]
   * @returns {Object}
   */
  withdraw(amount, itemsOrNote) {
    return this.addUtang(amount, itemsOrNote);
  }

  /**
   * Returns current numeric utang balance rounded to 2 decimal places.
   *
   * @returns {number}
   */
  getBalance() {
    return UtangAccount.round2(this.balance);
  }

  /**
   * Returns a clean JSON representation of the customer for database storage.
   *
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.customerId,
      name: this.customerName,
      phone: this.phone,
      avatar: this.avatar,
      balance: this.balance,
      totalDebt: this.balance, // preserved for backwards compatibility with legacy UI/tests
      creditLimit: this.creditLimit,
      daysOverdue: this.daysOverdue,
      repaymentRate: this.repaymentRate,
      notes: this.notes,
      createdAt: this.createdAt
    };
  }
}

module.exports = UtangAccount;
