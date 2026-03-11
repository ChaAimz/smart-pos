# Domain Rules: POS / Inventory / Expiry

## POS rules
- Every sale must include one or more sale items.
- `Sale.totalCents` is the sum of all `SaleItem.quantity * SaleItem.unitPriceCents` at sale time.
- `unitPriceCents` is immutable historical pricing for that sale item.
- Currency is stored as integer cents only.
- `Sale.paymentMethod` is recorded per sale (`CASH` or `QR_CODE`).
- `Sale.soldByUserId` must point to the user who completed that sale for audit trail.
- Checkout shift requirement is configurable (`POS_REQUIRE_SHIFT`).

## Inventory rules
- Product identity is `sku` (must be unique and stable).
- Product display name can change, but SKU cannot be reused for a different product.
- Price updates affect new sales only; old sales remain unchanged.
- A product can have multiple barcodes mapped to one SKU.
- `Product.stockQty` is on-hand quantity and must never become negative.
- `Product.isSellable = false` means the product cannot be sold even if stock remains.
- Checkout must validate stock + sellable status and reject invalid tickets.
- Inventory deduction and sale creation must happen in one transaction.
- All stock changes must write an inventory movement ledger entry.
- Any manual stock adjustment must include a reason.
- Adjustment approval requirement is configurable (`POS_REQUIRE_APPROVAL`).

## Role capability baseline
- `SALES`: checkout, open/close own shift, receive stock, submit stock adjustment.
- `MANAGER`: product + pricing + barcode management, stock movement review, approve/reject pending adjustments.
- `OWNER`: full access across manager capabilities and strategic reporting.

## Current operating profile
- Current active store decisions are tracked in `docs/store-profile.md`.
- Default small-store mode currently runs with `POS_REQUIRE_SHIFT=false`.
- Default small-store mode currently runs with `POS_REQUIRE_APPROVAL=false`.
- Default small-store mode currently runs with `POS_SMALL_STORE_STRICT=true`.
- In strict mode, owner dashboard remains available while front-staff operations stay sales-first.

## Expiry policy (for inventory batches)
- Expiry should be tracked at batch/lot level, not product master level.
- FEFO policy: when selecting stock, earliest expiry should be consumed first.
- Expired stock cannot be sold.
- Near-expiry threshold defaults to 7 days unless overridden by business settings.

## Operational defaults
- Dashboard KPIs should tolerate temporary DB unavailability and fail gracefully.
- Seed data is for non-production use and may be reset in development.
