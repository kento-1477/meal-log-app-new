-- CreateEnum
CREATE TYPE "PremiumSource" AS ENUM ('REFERRAL_FRIEND', 'REFERRAL_REFERRER', 'PURCHASE', 'ADMIN_GRANT');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FRAUD');

-- CreateTable
CREATE TABLE "PremiumGrant" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "source" "PremiumSource" NOT NULL,
    "days" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "referralId" INTEGER,
    "iapReceiptId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "referrerUserId" INTEGER NOT NULL,
    "referredUserId" INTEGER NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "friendPremiumGranted" BOOLEAN NOT NULL DEFAULT false,
    "referrerPremiumGranted" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveDaysAchieved" INTEGER NOT NULL DEFAULT 0,
    "deviceFingerprint" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralInviteLink" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "signupCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralInviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PremiumGrant_userId_endDate_idx" ON "PremiumGrant"("userId", "endDate");

-- CreateIndex
CREATE INDEX "PremiumGrant_source_idx" ON "PremiumGrant"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "Referral_deviceFingerprint_idx" ON "Referral"("deviceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralInviteLink_code_key" ON "ReferralInviteLink"("code");

-- CreateIndex
CREATE INDEX "ReferralInviteLink_userId_idx" ON "ReferralInviteLink"("userId");

-- CreateIndex
CREATE INDEX "ReferralInviteLink_code_idx" ON "ReferralInviteLink"("code");

-- AddForeignKey
ALTER TABLE "PremiumGrant" ADD CONSTRAINT "PremiumGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumGrant" ADD CONSTRAINT "PremiumGrant_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumGrant" ADD CONSTRAINT "PremiumGrant_iapReceiptId_fkey" FOREIGN KEY ("iapReceiptId") REFERENCES "IapReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralInviteLink" ADD CONSTRAINT "ReferralInviteLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropEnum (will be executed after data migration)
-- DROP TYPE "UserPlan";

-- AlterTable (will be executed after data migration)
-- ALTER TABLE "User" DROP COLUMN "plan";
