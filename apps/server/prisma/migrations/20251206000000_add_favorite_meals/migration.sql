-- Create tables for favorite meals
CREATE TABLE "FavoriteMeal" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "sourceMealLogId" TEXT,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "calories" DOUBLE PRECISION NOT NULL,
  "proteinG" DOUBLE PRECISION NOT NULL,
  "fatG" DOUBLE PRECISION NOT NULL,
  "carbsG" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FavoriteMealItem" (
  "id" SERIAL PRIMARY KEY,
  "favoriteMealId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "grams" DOUBLE PRECISION NOT NULL,
  "calories" DOUBLE PRECISION,
  "proteinG" DOUBLE PRECISION,
  "fatG" DOUBLE PRECISION,
  "carbsG" DOUBLE PRECISION,
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE "FavoriteMeal"
  ADD CONSTRAINT "FavoriteMeal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FavoriteMeal_sourceMealLogId_fkey"
    FOREIGN KEY ("sourceMealLogId") REFERENCES "MealLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FavoriteMealItem"
  ADD CONSTRAINT "FavoriteMealItem_favoriteMealId_fkey"
    FOREIGN KEY ("favoriteMealId") REFERENCES "FavoriteMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FavoriteMeal_userId_idx" ON "FavoriteMeal" ("userId");
CREATE UNIQUE INDEX "FavoriteMeal_userId_name_key" ON "FavoriteMeal" ("userId", "name");
CREATE INDEX "FavoriteMealItem_favoriteMealId_idx" ON "FavoriteMealItem" ("favoriteMealId");

-- Ensure updatedAt auto-update on modifications via trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER favorite_meal_set_updated_at
BEFORE UPDATE ON "FavoriteMeal"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
