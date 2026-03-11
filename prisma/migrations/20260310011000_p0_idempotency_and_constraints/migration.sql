ALTER TABLE "Sale"
ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "Sale_idempotencyKey_idx" ON "Sale"("idempotencyKey");
CREATE UNIQUE INDEX "Sale_soldByUserId_idempotencyKey_key" ON "Sale"("soldByUserId", "idempotencyKey");

ALTER TABLE "Product"
ADD CONSTRAINT "Product_priceCents_nonnegative_chk" CHECK ("priceCents" >= 0),
ADD CONSTRAINT "Product_stockQty_nonnegative_chk" CHECK ("stockQty" >= 0);

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_totalCents_positive_chk" CHECK ("totalCents" > 0);

ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_quantity_positive_chk" CHECK ("quantity" > 0),
ADD CONSTRAINT "SaleItem_unitPriceCents_nonnegative_chk" CHECK ("unitPriceCents" >= 0);

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_quantityDelta_nonzero_chk" CHECK ("quantityDelta" <> 0),
ADD CONSTRAINT "InventoryMovement_quantityBefore_nonnegative_chk" CHECK ("quantityBefore" >= 0),
ADD CONSTRAINT "InventoryMovement_quantityAfter_nonnegative_chk" CHECK ("quantityAfter" >= 0),
ADD CONSTRAINT "InventoryMovement_reason_minlen_chk" CHECK (char_length(trim("reason")) >= 3);
