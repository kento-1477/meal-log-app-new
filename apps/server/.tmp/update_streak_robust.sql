WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (ORDER BY "createdAt" DESC) - 1 AS day_offset
  FROM "MealLog"
  WHERE "userId" = 1
  ORDER BY "createdAt" DESC
  LIMIT 30
)
UPDATE "MealLog" AS m
SET "createdAt" = (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Tokyo')) - (ranked.day_offset || ' days')::interval
FROM ranked
WHERE m."id" = ranked."id";