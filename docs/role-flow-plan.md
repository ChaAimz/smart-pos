# Role Flow Plan (Cashier / Manager / Owner)

## Current state check (from AGENTS.md + code)
- `AGENTS.md` currently defines behavior/architecture/style guardrails only.
- Detailed role capability flow is not explicitly documented yet.
- Implemented now: login, sales checkout (`cash`/`qr`), user/role management (`OWNER`/`SALES`), basic inventory deduction.
- Missing from requested flow: `Store Admin/Manager` role, shift lifecycle, barcode aliases per SKU, stock movement ledger + approval workflow, manager operations pages.

## Target role matrix

### 1) Cashier / Sales Staff
- login
- open/close shift
- scan barcode / manual code entry
- set quantity
- checkout (`QR` / `Cash`)
- receive inventory
- submit inventory adjustment with reason
- view assigned stock list and movement history

### 2) Store Admin / Manager
- manage products
- set price
- manage multiple barcodes per SKU
- view stock movement
- approve/reject high-risk stock adjustments
- store-level reports

### 3) Super Admin / Owner
- full dashboard
- profit view
- inventory valuation
- manage user/role/branch (branch is planned, not fully modeled yet)
- trend view
- export report

## Delivery phases

### Phase A (this implementation)
- Add `MANAGER` role.
- Add `ProductBarcode` model (multi barcode per SKU).
- Add `Shift` model (open/close).
- Add `InventoryMovement` model + approval status.
- Enforce open-shift requirement in checkout.
- Record inventory movement on sale deduction.
- Add APIs for:
  - shift open/close
  - inventory receive/adjust
  - manager approve/reject pending adjustments
- Add manager workspace pages for products + stock movements.
- For small stores, shift enforcement can be soft-disabled (`POS_REQUIRE_SHIFT=false`).
- For small stores, approval can be soft-disabled (`POS_REQUIRE_APPROVAL=false`).
- For small stores, strict mode (`POS_SMALL_STORE_STRICT=true`) keeps front-staff operations sales-first while owner dashboard remains available.

### Phase B (next)
- Owner analytics: profit, inventory value, trend charts.
- Export CSV/report endpoints.
- Branch model + branch-scoped permissions.
- Advanced scanning UX and FEFO expiry flow.

## Approval policy (Phase A default)
- Approval flow is configurable (`POS_REQUIRE_APPROVAL`).
- Inventory receive: applies immediately.
- Inventory adjust:
  - by `MANAGER` / `OWNER`: applies immediately.
  - by `SALES`: if `abs(quantityDelta) > 10` then `PENDING_APPROVAL`; otherwise immediate.
- Rejected adjustments do not change stock.

## Technical notes
- Use server-only Prisma access.
- Keep monetary fields in cents.
- Keep migration forward-only and seed idempotent.
- Keep UI shadcn/ui-first and minimal flat style.
