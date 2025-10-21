-- Add meal period history tracking table
CREATE TABLE "MealLogPeriodHistory" (
  "id" SERIAL PRIMARY KEY,
  "mealLogId" TEXT NOT NULL,
  "previousMealPeriod" "MealPeriod",
  "nextMealPeriod" "MealPeriod",
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "MealLogPeriodHistory_mealLogId_fkey" FOREIGN KEY ("mealLogId") REFERENCES "MealLog"("id") ON DELETE CASCADE
);

CREATE INDEX "MealLogPeriodHistory_mealLogId_createdAt_idx"
  ON "MealLogPeriodHistory" ("mealLogId", "createdAt");
