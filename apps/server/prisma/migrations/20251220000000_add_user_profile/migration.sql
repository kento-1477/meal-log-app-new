CREATE TABLE "UserProfile" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "targetCalories" INTEGER,
  "targetProteinG" DOUBLE PRECISION,
  "targetFatG" DOUBLE PRECISION,
  "targetCarbsG" DOUBLE PRECISION,
  "bodyWeightKg" DOUBLE PRECISION,
  "activityLevel" TEXT,
  "language" TEXT,
  "referralCode" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
