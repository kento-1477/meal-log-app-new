-- AlterEnum
CREATE TYPE "UserPlan" AS ENUM ('FREE', 'STANDARD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "AiUsageCounter" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "usageDate" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageCounter_userId_usageDate_key" ON "AiUsageCounter"("userId", "usageDate");

-- AddForeignKey
ALTER TABLE "AiUsageCounter" ADD CONSTRAINT "AiUsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
