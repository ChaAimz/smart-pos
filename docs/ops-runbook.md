# Ops Runbook (P0)

## Production env baseline
- Set `NODE_ENV=production`.
- Set `AUTH_SECRET` to a strong non-default value.
- Keep `DATABASE_URL` pointed to the production PostgreSQL instance.
- Disable dev quick login by keeping production mode (`/api/auth/dev-login` is blocked in production).

## Database migration rollout
1. Apply migrations:
   ```bash
   npm run db:migrate:deploy
   ```
2. Verify API health:
   ```bash
   curl http://localhost:3000/api/health
   ```

## Checkout idempotency contract
- Every checkout request must include `Idempotency-Key` (or `X-Idempotency-Key`) header.
- Retries with the same key for the same user return the original sale instead of creating a duplicate.

## Backup (PostgreSQL in Docker)
1. Run backup:
   ```bash
   docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > backups/smart_pos_$(date +%Y%m%d_%H%M%S).dump
   ```
2. Store dumps outside the app host regularly (cloud/object storage).

## Restore drill
1. Restore into target DB:
   ```bash
   cat backups/<file>.dump | docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists
   ```
2. Validate:
   - `GET /api/health` returns `{ status: "ok", db: "up" }`.
   - Login and perform one test sale.

## Recommended cadence
- Backup at least daily.
- Perform restore drill at least monthly.
