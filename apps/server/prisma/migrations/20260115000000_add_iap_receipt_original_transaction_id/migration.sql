-- Add originalTransactionId to support App Store server notifications mapping
ALTER TABLE "IapReceipt" ADD COLUMN "originalTransactionId" TEXT;

CREATE INDEX "IapReceipt_originalTransactionId_idx" ON "IapReceipt"("originalTransactionId");
