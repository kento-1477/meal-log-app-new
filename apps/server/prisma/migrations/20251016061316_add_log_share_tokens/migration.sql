-- DropIndex
DROP INDEX "MealLog_aiRaw_gin";

-- CreateTable
CREATE TABLE "LogShareToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "mealLogId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessed" TIMESTAMP(3),

    CONSTRAINT "LogShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogShareToken_token_key" ON "LogShareToken"("token");

-- CreateIndex
CREATE INDEX "LogShareToken_userId_mealLogId_idx" ON "LogShareToken"("userId", "mealLogId");

-- AddForeignKey
ALTER TABLE "LogShareToken" ADD CONSTRAINT "LogShareToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogShareToken" ADD CONSTRAINT "LogShareToken_mealLogId_fkey" FOREIGN KEY ("mealLogId") REFERENCES "MealLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
