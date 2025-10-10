-- Create enum for meal period tagging
CREATE TYPE "MealPeriod" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- Add mealPeriod column to existing MealLog entries
ALTER TABLE "MealLog" ADD COLUMN "mealPeriod" "MealPeriod";

-- Track manual edit history for each meal log
CREATE TABLE "MealLogEdit" (
    "id" SERIAL PRIMARY KEY,
    "mealLogId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealLogEdit_mealLogId_fkey"
        FOREIGN KEY ("mealLogId") REFERENCES "MealLog"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MealLogEdit_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
