#!/bin/sh
set -eu

echo "Installing dependencies in container..."
npm install --include=dev

echo "Generating Prisma client..."
npm run db:generate

echo "Applying migrations..."
npm run db:migrate:deploy

if [ "${RUN_DB_SEED:-false}" = "true" ]; then
  echo "Running seed data..."
  npm run db:seed
else
  echo "Skipping seed data (set RUN_DB_SEED=true to enable)."
fi

echo "Building Next.js app..."
npm run build

echo "Starting Next.js production server..."
exec npm run start -- --hostname 0.0.0.0 --port 3000
