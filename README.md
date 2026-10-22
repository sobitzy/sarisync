# SariSync Speed Board

A sari-sari store point-of-sale and digital utang ledger built for everyday tindahan workflows in the Philippines.

SariSync brings product inventory, customer accounts, cash and credit sales, repayments, and credit-risk indicators into one browser-based application. Its interface uses familiar terms such as Paninda, Suki, Benta, Bayad, and Sukli.

## Features

- Product inventory: manage products, prices, costs, and stock quantities.
- Customer accounts: maintain customer details, credit limits, balances, and transaction histories.
- Cash and utang sales: record purchases and deduct inventory through the sales API.
- Fast basket entry: add staple products, preset tingi amounts, and custom-priced items, with separate draft baskets per customer.
- Repayments and sukli: accept payments, prevent negative debt balances, and calculate change on overpayment.
- Credit-risk indicators: display Green, Amber, and Red account statuses using transparent rules.
- Flexible warnings: preview how additional credit affects an account and optionally require acknowledgement before recording risky credit.
- Browser persistence: retain interface state and draft baskets in localStorage, with a cached-state fallback when the backend is unavailable.
- Light and dark themes: switch between a daylight-oriented interface and dark mode.
- Local JSON storage: persist backend data without configuring an external database.

## Technology

| Layer | Implementation |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js and Express |
| Persistence | JSON file at `data/db.json` |
| Browser storage | localStorage |
| Tests | Node.js built-in test runner (`node --test`) |

`lib/express.js` loads the installed Express package when available. It also includes a lightweight native Node.js HTTP adapter as a fallback. Install dependencies for the normal development setup; the fallback is not a promise of full Express compatibility.

## Getting started

### Requirements

- A current Node.js LTS release with npm and support for `node --test`.
- Git and access to this repository.
- A modern browser.

The package currently does not declare a minimum Node.js version in an `engines` field.

### Install and run

```bash
git clone https://github.com/sobitzy/sarisync.git
cd sarisync
npm install
npm start
```

Open `http://localhost:3000`.

The server serves the application from `public/`. Use the running application rather than opening the root-level `index.html` directly when working with backend data.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listening port |

Example for macOS or Linux:

```bash
PORT=4000 npm start
```

No database connection string or API key is required by the inspected server code. The current startup script does not load a `.env` file.

## Demo data and storage

The seed includes six sample customers, twelve staple products, transaction history, tingi presets, and quick-payment presets. The seeded customer balances total PHP 2,185.00.

Backend records live in `data/db.json`. If that file is missing, the application creates it from the seed. The current loader also replaces unreadable JSON or data that fails its basic schema check with seed data, so keep backups before troubleshooting storage problems.

Database updates write a temporary file and rename it over the database file. This reduces exposure to partial writes, but is not a substitute for backups, database transactions, or multi-process concurrency control.

### Reset the demo

`POST /api/reset` replaces the current database with the initial seed. It is destructive: back up any records you need first. Reload the application afterward to fetch the server state again.

Do not use this endpoint on a live store dataset.

## Typical workflow

1. Manage Paninda: add products and update prices, costs, and stock.
2. Register Suki: create customer records and set credit limits.
3. Record Benta: build a basket and choose cash or utang. The sales endpoint deducts stock for matched inventory products.
4. Review credit: inspect the customer's current and projected risk before extending additional utang.
5. Accept Bayad: enter the repayment amount, review the remaining debt, and return any sukli.
6. Review the talaan: inspect recorded purchases and payments.

Example: a customer with PHP 320.00 in debt tenders PHP 500.00. The payment reduces debt to PHP 0.00 and returns PHP 180.00 in sukli, rather than creating a negative balance.

## Credit-risk rules

The risk engine is rule-based, not a trained machine-learning model or a validated prediction of default.

Credit utilization is the current debt divided by the customer's credit limit, expressed as a percentage.

| Status | Rule for an account with an outstanding balance |
| --- | --- |
| Green / Safe | Utilization below 50% and fewer than 7 days overdue |
| Amber / Watch | Utilization at least 50% or at least 7 days overdue, unless a Red rule applies |
| Red / High Risk | Utilization at least 85%, balance at or above the credit limit, or at least 14 days overdue |

Accounts with no outstanding balance are classified as Safe. The backend also calculates a numerical risk score from utilization, overdue days, and repayment-rate fields.

### Flexible Warning Mode

For `POST /api/transactions/utang`, sending `requireConfirmation: true` requests a warning check. If the account is already Red or the added credit would make it Red, the server returns HTTP `409` unless `acknowledgeWarning` or `forceOverride` is supplied.

This is an advisory workflow, not a hard credit-limit enforcement mechanism. The separate `POST /api/sales` route does not apply this same confirmation check.

## API overview

All paths below are relative to the running server.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server health and application metadata |
| GET | `/api/state` | Customers, products, transactions, presets, and summary |
| GET | `/api/bootstrap` | Redirect to `/api/state` |
| GET | `/api/transactions` | All ledger transactions |
| GET | `/api/sales` | Sales and utang records; optional `customerId` filter |
| GET | `/api/sales/:id` | Individual sale record |
| POST | `/api/sales` | Record a cash or utang sale |
| DELETE | `/api/sales/:id` | Void a sale, restore inventory, and reverse associated debt |
| POST | `/api/transactions/utang/preview` | Preview the impact of added credit |
| POST | `/api/transactions/utang` | Record utang with optional warning confirmation |
| POST | `/api/transactions/payment` | Record a repayment |
| GET | `/api/utang` | Ledger with optional `customerId` and `type` filters |
| DELETE | `/api/utang/:id` | Reverse a ledger transaction's balance effect and remove it |
| POST | `/api/reset` | Replace stored data with the demo seed |

Product and customer CRUD routes are mounted at `/api/products` and `/api/customers`.

Payment aliases include `/api/utang/payments`, `/api/utang/payment`, `/api/utang/deposit`, `/api/customers/:id/deposit`, and `/api/bayad`. Utang creation also has a `/api/utang` alias.

Use the sales endpoint for inventory-aware sales. Recording a direct ledger utang entry is not the same operation and does not deduct inventory. Likewise, ledger deletion does not restore product stock; the sale-void route handles inventory restoration.

### Example: inspect application state

```bash
curl http://localhost:3000/api/state
```

### Example: preview additional credit

```bash
curl -X POST http://localhost:3000/api/transactions/utang/preview \
  -H "Content-Type: application/json" \
  -d '{"customerId":"c1","amount":50}'
```

### Example: record a repayment

This request modifies the local database. Use a demo dataset.

```bash
curl -X POST http://localhost:3000/api/transactions/payment \
  -H "Content-Type: application/json" \
  -d '{"customerId":"c1","tenderedAmount":100,"idempotencyKey":"demo-payment-001"}'
```

The utang and repayment handlers accept `idempotencyKey` in the JSON body or `X-Idempotency-Key` in a header. Their shared cache is in memory and expires entries after approximately 10 seconds. It does not survive server restarts and does not cover the sales endpoint. Use a distinct key for each intended transaction and reuse it only when retrying that transaction.

## Project structure

```text
sarisync/
├── data/
│   └── db.json                 # Local persistent records
├── lib/
│   └── express.js              # Express loader and native HTTP fallback
├── models/
│   ├── UtangAccount.js         # Customer debt and repayment model
│   └── db.js                   # Storage, seeding, risk rules, and summaries
├── public/
│   ├── index.html              # Server-served interface
│   ├── styles.css              # Interface styling
│   └── app.js                  # Browser state and API interactions
├── routes/
│   ├── products.js             # Product operations
│   ├── customers.js            # Customer operations
│   ├── sales.js                # Sales and inventory operations
│   └── utang.js                # Credit ledger and repayments
├── test/
│   └── qa.test.js              # Automated QA suite
├── index.html                 # Additional root-level HTML file
├── package.json
├── QA_RELIABILITY_REPORT.md
└── server.js                  # Application entry point
```

## Tests

```bash
npm test
```

The repository includes `test/qa.test.js` and a QA report documenting 15 passing tests from a previous run. Reported coverage includes credit-risk tiers, payment/change calculations, idempotency, inventory operations, customer debt protection, and routing behavior.

That historical report is not evidence that tests pass in every environment. Run the suite locally before relying on the result, preferably on a disposable checkout rather than a live store dataset.

## Offline behavior and limitations

The frontend stores browser state in localStorage and falls back to cached state when server bootstrap fails. The interface distinguishes Live DB from Offline Cache mode.

Treat this as a cached-state fallback, not guaranteed offline-first transaction synchronization. Do not assume browser-only changes will automatically merge into the server database after reconnecting. localStorage is specific to the browser and origin and can be cleared by the user or browser.

## Deployment and data-safety notes

Treat the current application as a local development/demo starting point until its deployment and security requirements have been reviewed.

- The inspected server mounts API routes without authentication or authorization middleware, including the destructive reset endpoint. Do not expose it directly to the public internet with real customer data.
- Protect customer names, phone numbers, debt records, and browser-cached data.
- Keep backups of `data/db.json` and use persistent storage if deploying to a hosted environment.
- Do not run multiple server instances against the same JSON file without adding appropriate storage coordination.
- Financial values use JavaScript numbers rounded to two decimal places; this is not an arbitrary-precision accounting system.
- The summary field named `todaySales` currently adds amounts across today's transactions, including repayments. Do not interpret it as sales-only revenue without adjusting that calculation.
- Package metadata reports version `1.0.0`, while health and seed metadata report `2.0.0`. Align these before publishing a release.

## Contributing

1. Create a feature branch.
2. Keep changes focused and add or update tests for changed behavior.
3. Run `npm test` in a disposable development environment.
4. Open a pull request describing the change and how it was checked.

## License

`package.json` declares MIT. The inspected repository root does not include a standalone `LICENSE` file; add the intended license text and copyright notice before public distribution.
