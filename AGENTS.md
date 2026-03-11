# AGENTS.md

## Project identity
This repository is a production-oriented retail system built with:

- Next.js (App Router, TypeScript)
- shadcn/ui + Tailwind CSS
- PostgreSQL
- Prisma ORM
- Hostinger VPS deployment with Docker Compose + Nginx

The application scope includes:

- POS front store selling screen
- Inventory control
- Admin dashboard
- Barcode scanner workflow (1D/2D)
- QR payment / cash payment
- Expiry-date and lot-aware inventory
- Real-time web application behavior for operational pages

---

## Mission for Codex
When working in this repository, act as a senior full-stack engineer focused on:

1. Correctness of stock and sales transactions
2. Maintainable architecture
3. Clean UI/UX for fast cashier workflow
4. Safe database changes
5. Production readiness on VPS
6. Minimal complexity unless complexity is justified

Always optimize for real business usage, not demo-only code.

---

## Product rules
The system supports these roles:

### 1. Cashier / Store Staff
- Login to POS
- Scan product barcode or QR code
- Manually enter product code if scan fails
- Add items to cart
- Receive payment by:
  - QR transfer
  - Cash
- Create completed sale
- Receive stock into inventory
- Adjust inventory quantity with reason

### 2. Admin / Manager
- View real-time summary dashboards
- Manage products, prices, users, branches
- Review daily / monthly / yearly sales
- Review inventory value, gross profit, trends
- Monitor low stock and expiry alerts

---

## Inventory and expiry rules
This project MUST treat product identity and stock lots as different concerns.

### Product identity
A barcode or QR code printed on the product usually identifies the SKU/product only.

### Lot / expiry tracking
Lot number and expiry date are tracked in the system during stock receiving.

### Required behavior
- If `trackExpiry = true`, receiving stock MUST require:
  - lot number
  - expiry date
  - quantity
  - unit cost
- Sales must deduct inventory using FEFO:
  - First Expired, First Out
- Expired stock must not be sold
- Near-expiry stock must be visible in dashboard and inventory pages
- All stock changes must be recorded in stock movement history
- Every sale must create stock deduction records
- Inventory valuation should be derived from available lots and their cost

### Important assumption
If the supplier barcode does not encode lot/expiry, the system still works by:
- scanning barcode to identify product
- storing lot/expiry at receiving time
- allocating sold quantity from available lots by FEFO logic

Do not assume lot is available from product barcode unless explicitly implemented and tested.

---

## Engineering priorities
Follow this priority order when making changes:

1. Data integrity
2. Business rule correctness
3. Readability
4. Simplicity
5. Performance optimization
6. Nice-to-have polish

Do not trade transaction correctness for UI convenience.

---

## Architecture rules
Prefer a modular monolith unless explicitly asked to split services.

### Expected app structure
- `app/(auth)` -> authentication
- `app/pos` -> cashier workflows
- `app/inventory` -> stock receiving, adjustments, lot management
- `app/admin` -> dashboard and admin tools
- `app/api` -> route handlers if needed
- `components/ui` -> shadcn/ui primitives
- `components/shared` -> reusable business UI
- `lib` -> utilities, db, auth, permissions, domain helpers
- `server` -> server-only business logic
- `prisma` -> schema and migrations

### Separation of concerns
- UI components should stay presentation-focused
- Business rules should live in server/domain services
- Database access should be centralized and consistent
- Never scatter stock calculation logic across many pages

---

## UI/UX rules
This is a retail operational system, so speed matters more than flashy design.

### POS screen rules
- The POS screen must be fast and keyboard-friendly
- Scanner input should be easy to focus and reuse
- Manual code entry must exist as fallback
- Payment interaction must be minimal and fast
- Buttons must be large enough for touch screens
- Avoid unnecessary modal spam
- Show meaningful error messages
- Show connection/loading state clearly

### Design style
Use:
- shadcn/ui components
- Tailwind utility classes
- clean spacing
- strong visual hierarchy
- readable text sizes
- consistent form layouts
- responsive layout for admin pages

Do not overdesign the POS screen.

---

## Coding standards
### General
- Use TypeScript strictly
- Prefer explicit types for domain models and service inputs
- Avoid `any`
- Keep functions small and named clearly
- Write code that another engineer can debug quickly

### Next.js
- Prefer Server Components by default
- Use Client Components only when needed for interaction
- Use Server Actions or route handlers carefully for mutations
- Keep server-only logic off the client
- Validate all mutation inputs

### Forms and validation
- Use Zod for validation
- Validate on server even if already validated on client

### Database
- Use Prisma
- All sale completion flows must use database transactions
- All stock receiving flows that affect lots and balances must use database transactions
- Never update stock by naive direct arithmetic without movement logging
- Prefer append-only stock movement history plus derived balance updates

### Error handling
- Fail loudly for business-critical inconsistencies
- Return user-safe messages to UI
- Log technical details on server side

---

## Database rules
The schema should generally include these concepts:

### Core entities
- users
- roles
- branches
- products
- productBarcodes
- categories
- suppliers

### Inventory entities
- stockLots
- stockBalances
- stockMovements
- goodsReceipts
- goodsReceiptItems
- inventoryAdjustments
- inventoryAdjustmentItems

### POS entities
- sales
- saleItems
- saleItemLotAllocations
- payments
- cashSessions

### Analytics / snapshot entities
- dailySalesSummary
- inventorySnapshots
- profitSnapshots

Do not remove lot-aware structures just to simplify UI implementation.

---

## Transaction rules
### Sale completion must be atomic
When a sale is completed, the system must perform these steps in one transaction:

1. Create sale header
2. Create sale items
3. Allocate lots by FEFO
4. Deduct stock from lots/balances
5. Insert stock movement records
6. Insert payment records
7. Commit only if all steps succeed

If any step fails, rollback.

### Receiving stock must be atomic
When receiving stock:
1. Create goods receipt
2. Create lot records or update matching lot
3. Update stock balance
4. Insert stock movement records
5. Commit only if all steps succeed

---

## Reporting rules
The admin dashboard should support:
- today sales
- month sales
- year sales
- gross profit
- inventory value
- low stock alerts
- near-expiry alerts
- expired stock loss
- sales trends
- inventory trends

For heavy analytics:
- prefer summary tables or snapshots
- avoid making every dashboard widget depend on massive live queries

Real-time should be used where it matters operationally, not everywhere.

---

## Security and audit rules
This system handles money and stock.

Always preserve auditability.

### Required audit areas
- stock adjustment
- price changes
- voided sale
- returned sale
- expired stock write-off
- manual overrides
- user actions on critical workflows

Never implement hidden stock edits without traceability.

---

## Testing rules
When making business logic changes, prioritize tests for:
- FEFO allocation
- expiry blocking
- sale transaction integrity
- stock receiving integrity
- stock adjustments
- payment flow transitions
- inventory valuation calculations

If tests do not exist yet, add focused tests for business-critical logic before or with the change.

---

## Performance rules
- Optimize for responsive POS operations
- Avoid unnecessary re-renders on large tables
- Paginate admin data where appropriate
- Cache safe read-heavy queries when useful
- Do not prematurely optimize away clarity in core stock logic

---

## Deployment rules
Production target is Hostinger VPS.

Assume deployment stack:
- Docker Compose
- Next.js app container
- PostgreSQL container or managed PostgreSQL
- Nginx reverse proxy
- environment variables from VPS
- persistent database volume
- regular backups

Do not hardcode local-only assumptions.

When writing deployment-related code:
- respect production environment variables
- do not assume localhost-only networking in production
- prefer health-check-friendly services

---

## Commands
If package manager is not explicitly specified, prefer `pnpm`.

Typical commands should be kept working:
- install dependencies
- run dev server
- run lint
- run typecheck
- run tests
- run Prisma migration / generate
- build production app

If adding tooling, document the command in README or package.json scripts.

---

## Change policy for Codex
When given a task:

1. First understand the affected business flow
2. Identify impacted files and domain rules
3. Make the smallest complete change that solves the problem
4. Preserve existing style unless a cleanup is requested
5. Explain trade-offs briefly in PR/summary style
6. Flag risky assumptions clearly

Do not do broad refactors unless explicitly requested.

---

## Things to avoid
- Do not rewrite the whole app for a small request
- Do not mix stock logic into UI-only components
- Do not bypass transactions in sale/inventory flows
- Do not fake expiry handling with a single field on product only
- Do not assume barcode always contains lot or expiry
- Do not add unnecessary third-party dependencies without reason
- Do not introduce overly abstract architecture too early

---

## Preferred implementation mindset
Build for a real store.

That means:
- reliable
- explainable
- easy to operate
- easy to debug
- safe with money and inventory
- practical over fancy

When in doubt, choose the approach that reduces business risk.