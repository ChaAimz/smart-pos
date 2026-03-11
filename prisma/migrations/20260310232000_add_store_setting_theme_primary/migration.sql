-- Persist owner-managed primary color theme.
ALTER TABLE "StoreSetting"
ADD COLUMN "themePrimaryHex" TEXT NOT NULL DEFAULT '#111315';
