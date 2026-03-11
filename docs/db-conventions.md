# Database Conventions

## Naming
- Tables/models: singular PascalCase in Prisma (`Product`, `Sale`, `SaleItem`).
- Fields: camelCase (`priceCents`, `createdAt`).
- IDs: `id` as string with Prisma `cuid()`.
- Foreign keys: `<entity>Id` (e.g., `saleId`, `productId`).

## Prisma usage
- Use `schema.prisma` as the source of truth.
- Generate client after schema changes (`npm run db:generate`).
- Use explicit `select` in queries for API responses when possible.
- Prefer transactions for multi-write business operations.

## Migration policy
- Every schema change must include a migration folder under `prisma/migrations`.
- Use forward-only migrations; do not edit applied migration files.
- For local/dev deploy flow, use `prisma migrate deploy` in container startup.

## Transaction policy
- Use `prisma.$transaction` when writes must succeed/fail together.
- Avoid long-running transactions.
- Enforce idempotency for retry-prone flows (seed scripts, startup tasks).

## Data integrity
- Add unique constraints for business identifiers (SKU).
- Barcode alias uniqueness must be global (`ProductBarcode.code` unique).
- Add indexes for frequent filters/sorts (`createdAt`, foreign keys).
- Sales checkout idempotency is enforced by (`Sale.soldByUserId`, `Sale.idempotencyKey`) unique key.
- Use cascade deletes only where ownership is strict (`Sale -> SaleItem`).
- Inventory movement rows are immutable audit records (no hard updates/deletes in normal flow).
- Keep check constraints in SQL migrations for non-negative stock/prices and positive quantities.

## Role-aware data conventions
- `User.role` drives route and action authorization (`SALES`, `MANAGER`, `OWNER`).
- Shift lifecycle is modeled per user (`Shift.openedByUserId`, `closedByUserId`).
- Manual stock adjustments use approval status (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`).
