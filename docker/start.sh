#!/bin/sh
set -eu

echo "Installing dependencies in container..."
npm install

echo "Generating Prisma client..."
npm run db:generate

echo "Applying migrations..."
npm run db:migrate:deploy

echo "Running seed data..."
npm run db:seed

echo "Starting Next.js dev server..."
exec npm run dev:docker
