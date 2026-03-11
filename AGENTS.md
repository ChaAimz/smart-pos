# AGENTS.md

This file defines how coding agents should work in this repository.

## Core behavior
- Prioritize correctness over speed.
- Keep changes small and reviewable.
- Avoid broad refactors unless explicitly requested.
- Prefer clear, maintainable code over clever implementations.

## Architecture guardrails
- Stack: Next.js App Router + TypeScript + Tailwind + Prisma + PostgreSQL.
- Keep server-side database access in server contexts only.
- Do not add new frameworks or ORMs without approval.
- UI baseline is shadcn/ui-first (new-york style + CSS variables).
- Prefer official shadcn patterns for layout, forms, feedback, and typography.

## File and code conventions
- Use alias imports (`@/*`) for internal modules.
- Keep UI primitives in `src/components/ui`.
- Keep shared libraries in `src/lib`.
- Use cents (`priceCents`, `totalCents`) for monetary values.
- Use `components.json` as the source of truth for shadcn config.
- New UI should compose existing `src/components/ui/*` primitives before custom Tailwind blocks.
- Use Lucide icons with shadcn patterns (`size-4`, muted icon color in labels/descriptions).

## Data safety
- Every schema change requires a Prisma migration.
- Never delete/alter production data without explicit confirmation.
- Seed scripts must be idempotent.

## Preferred skills
- Use the `playwright` skill for browser flow checks after UI changes.
- Use the `screenshot` skill only when an explicit OS-level screenshot is requested.
- Use `doc`, `pdf`, and `spreadsheet` skills only when those file formats are in scope.

## Docs layering
- Keep this file concise and behavioral.
- Detailed business rules: `docs/domain-rules.md`.
- Database conventions: `docs/db-conventions.md`.
- UI conventions: `docs/ui-conventions.md`.
- Role capability roadmap: `docs/role-flow-plan.md`.
- Active operating decisions: `docs/store-profile.md`.
