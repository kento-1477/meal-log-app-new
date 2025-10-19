-- Ensure aiRaw locale/translations exist for existing records
UPDATE "MealLog" AS m
SET "aiRaw" = jsonb_set(
                jsonb_set(
                  m."aiRaw",
                  '{locale}',
                  to_jsonb(COALESCE(m."aiRaw"->>'locale', 'en-US')),
                  true
                ),
                '{translations}',
                jsonb_set(
                  COALESCE(m."aiRaw"->'translations', '{}'::jsonb),
                  ARRAY[COALESCE(m."aiRaw"->>'locale', 'en-US')],
                  jsonb_strip_nulls(m."aiRaw" - 'translations' - 'locale'),
                  true
                ),
                true
              )
WHERE m."aiRaw" IS NOT NULL;
