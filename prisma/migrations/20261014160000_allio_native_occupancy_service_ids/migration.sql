-- AlterTable
ALTER TABLE "AllioNativeOccupancy" ADD COLUMN IF NOT EXISTS "serviceIds" TEXT NOT NULL DEFAULT '[]';
