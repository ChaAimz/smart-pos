ALTER TABLE "Product"
ADD COLUMN "costCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product"
SET "costCents" = "priceCents"
WHERE "costCents" = 0;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_costCents_nonnegative_chk" CHECK ("costCents" >= 0);
