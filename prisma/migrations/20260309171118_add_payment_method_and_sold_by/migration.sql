-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QR_CODE');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "soldByUserId" TEXT;

-- Backfill audit owner for existing sales, using the oldest user account.
WITH first_user AS (
  SELECT "id"
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
UPDATE "Sale"
SET "soldByUserId" = (SELECT "id" FROM first_user)
WHERE "soldByUserId" IS NULL;

-- Enforce non-null audit trail after backfill.
ALTER TABLE "Sale" ALTER COLUMN "soldByUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Sale_soldByUserId_idx" ON "Sale"("soldByUserId");

-- CreateIndex
CREATE INDEX "Sale_paymentMethod_createdAt_idx" ON "Sale"("paymentMethod", "createdAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_soldByUserId_fkey" FOREIGN KEY ("soldByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
