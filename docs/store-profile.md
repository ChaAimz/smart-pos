# Store Profile (Active Decisions)

This file is the single source for current operating decisions that agents must keep in mind.

## Current profile
- Store size: small store, single branch scope for now.
- Team shape: front staff may operate both cashier and manager tasks.
- Layout policy: sales-first, no persistent sidebar for checkout flow.
- UI layout default: viewport-constrained working cards with internal scroll areas.
- Runtime mode: dual-mode UI (`Sales Mode` + `Manage Mode`) in `/sales`.
- Default language: English (`en`) across UI copy unless explicitly overridden.

## Active runtime flags
- `POS_REQUIRE_SHIFT=false`
  - Shift is soft-disabled for checkout in current operations.
  - Shift APIs/models remain in codebase for future re-enable.
- `POS_REQUIRE_APPROVAL=false`
  - Approval is soft-disabled in normal flow.
  - Inventory adjustments apply immediately (with required reason + movement log).
  - Approval APIs remain in codebase for future re-enable.
- `POS_SMALL_STORE_STRICT=true`
  - Sales workspace remains the primary operational flow for front staff.
  - Owner workspace remains available at `/` and `/owner/*`.
  - In development login, quick actions still show all roles for testing.

## Ops policy
- Inventory movement log is required for all stock changes.
- Manual stock adjustment must include a reason.
- Money fields remain stored as cents.

## Change protocol
- When user changes business policy, update:
  - `docs/store-profile.md` (this file)
  - `docs/domain-rules.md` (business behavior)
  - `docs/db-conventions.md` (if schema/transaction policy changes)
