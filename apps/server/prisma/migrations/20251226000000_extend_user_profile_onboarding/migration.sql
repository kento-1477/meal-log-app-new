-- Extend UserProfile with onboarding questionnaire fields

CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'UNSPECIFIED');
CREATE TYPE "MeasurementSystem" AS ENUM ('METRIC', 'IMPERIAL');
CREATE TYPE "PlanIntensity" AS ENUM ('GENTLE', 'STANDARD', 'INTENSE');

ALTER TABLE "UserProfile"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "birthdate" TIMESTAMP,
  ADD COLUMN "heightCm" DOUBLE PRECISION,
  ADD COLUMN "unitPreference" "MeasurementSystem" DEFAULT 'METRIC',
  ADD COLUMN "marketingSource" TEXT,
  ADD COLUMN "goals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "currentWeightKg" DOUBLE PRECISION,
  ADD COLUMN "targetWeightKg" DOUBLE PRECISION,
  ADD COLUMN "planIntensity" "PlanIntensity",
  ADD COLUMN "targetDate" TIMESTAMP,
  ADD COLUMN "appleHealthLinked" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "questionnaireCompletedAt" TIMESTAMP;

-- Existing column to track primary activity level remains TEXT for backwards compatibility

CREATE INDEX IF NOT EXISTS "UserProfile_questionnaireCompletedAt_idx" ON "UserProfile"("questionnaireCompletedAt");
