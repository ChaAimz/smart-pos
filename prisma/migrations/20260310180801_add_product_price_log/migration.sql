-- CreateTable
CREATE TABLE "ProductPriceLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "previousCostCents" INTEGER NOT NULL,
    "previousPriceCents" INTEGER NOT NULL,
    "nextCostCents" INTEGER NOT NULL,
    "nextPriceCents" INTEGER NOT NULL,

    CONSTRAINT "ProductPriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceLog_createdAt_idx" ON "ProductPriceLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProductPriceLog_productId_createdAt_idx" ON "ProductPriceLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductPriceLog_changedByUserId_createdAt_idx" ON "ProductPriceLog"("changedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductPriceLog" ADD CONSTRAINT "ProductPriceLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceLog" ADD CONSTRAINT "ProductPriceLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
