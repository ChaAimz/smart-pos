-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isSellable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stockQty" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_isSellable_stockQty_idx" ON "Product"("isSellable", "stockQty");
