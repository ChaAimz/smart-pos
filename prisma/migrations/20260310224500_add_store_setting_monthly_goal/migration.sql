-- Persist owner-managed goals for sales dashboard.
CREATE TABLE "StoreSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "monthlySalesGoalCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id")
);
