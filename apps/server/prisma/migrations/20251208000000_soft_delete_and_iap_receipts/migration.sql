-- Add soft delete column to MealLog and introduce IAP receipt tracking

CREATE TYPE "IapPlatform" AS ENUM ('APP_STORE', 'GOOGLE_PLAY');

ALTER TABLE "MealLog"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "IapReceipt" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "platform" "IapPlatform" NOT NULL,
  "productId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "creditsGranted" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "status" TEXT NOT NULL,
  "purchasedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IapReceipt_transactionId_key" ON "IapReceipt" ("transactionId");
CREATE INDEX "IapReceipt_userId_idx" ON "IapReceipt" ("userId");

ALTER TABLE "IapReceipt"
  ADD CONSTRAINT "IapReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
