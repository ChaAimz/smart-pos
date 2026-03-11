-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'SALES');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'SALES';

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
