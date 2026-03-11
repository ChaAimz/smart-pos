# Smart POS App

Next.js + PostgreSQL starter for POS dashboards with Prisma and a minimal flat shadcn-inspired UI baseline.

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL 16
- Prisma ORM
- Cookie-based login auth (JWT)
- Docker Compose (DB-first workflow)

## Recommended dev workflow (DB in Docker, Next.js on host)
1. Ensure Docker Desktop is running.
2. Copy env file if needed:
   ```bash
   cp .env.example .env
   ```
3. Start PostgreSQL only:
   ```bash
   docker compose up -d db
   ```
   or
   ```bash
   npm run db:up
   ```
4. Install dependencies and setup Prisma:
   ```bash
   npm install
   npm run db:generate
   npm run db:migrate:deploy
   npm run db:seed
   ```
5. Start Next.js on host:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:3000`.

## Login (dev)
- URL: `http://localhost:3000/login`
- Owner email: `admin@smartpos.local`
- Manager email: `manager@smartpos.local`
- Sales email: `sales@smartpos.local`
- Default password: `ChangeMe123!`
- Quick Login is available only when `NODE_ENV !== "production"`.
- Dev quick actions always show `Quick Owner/Admin`, `Quick Manager`, and `Quick Sales`.
- With `POS_SMALL_STORE_STRICT=true` (default), owner can still use owner dashboard (`/owner`).
- Configure via `.env`:
  - `AUTH_SECRET`
  - `POS_SMALL_STORE_STRICT`
  - `POS_REQUIRE_SHIFT`
  - `POS_REQUIRE_APPROVAL`
  - `SEED_ADMIN_EMAIL`
  - `SEED_ADMIN_PASSWORD`
  - `SEED_MANAGER_EMAIL`
  - `SEED_MANAGER_PASSWORD`
  - `SEED_SALES_EMAIL`
  - `SEED_SALES_PASSWORD`

## Current runtime defaults (small-store strict)
- `POS_SMALL_STORE_STRICT=true`
- `POS_REQUIRE_SHIFT=false`
- `POS_REQUIRE_APPROVAL=false`
- `NODE_ENV=development` (local)

## Role routes
- `OWNER` lands on `/owner`.
- `SALES` and `MANAGER` land on `/sales`.
- In small-store strict mode, sales workspace remains the primary operational flow for front staff.
- Owner workspace routes:
  - `/owner` for owner dashboard overview
  - `/owner/products` for dialog-based item management (new/edit/delete) with single primary barcode
  - `/owner/reports` for KPI reports + CSV export (`/api/reports/sales`)

## Build Docker image after local dev
When your local dev is ready, build/run the web image:

```bash
npm run docker:build
npm run docker:up
```

Then open `http://localhost` (port `80`).

Note: HTTPS on port `443` requires a reverse proxy + TLS certificate (for example Nginx/Caddy + Let's Encrypt).

## Optional: full Docker stack (web + db)
The `web` service is optional and behind a profile.

```bash
docker compose --profile fullstack up --build -d
```

## Useful commands
- `npm run db:up`
- `npm run db:down`
- `npm run docker:build`
- `npm run docker:up`
- `npm run lint`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:deploy`
- `npm run db:seed`
- `npm run db:studio`

## Data model (starter)
- `User`: login account with `email`, `passwordHash`
- `Product`: catalog items with `sku`, `priceCents`
- `Sale`: sale header with `totalCents`
- `SaleItem`: line items with quantity and locked unit price

## Repository rules
- Agent behavior rules: `AGENTS.md`
- Domain rules: `docs/domain-rules.md`
- DB conventions: `docs/db-conventions.md`
- Ops runbook: `docs/ops-runbook.md`
