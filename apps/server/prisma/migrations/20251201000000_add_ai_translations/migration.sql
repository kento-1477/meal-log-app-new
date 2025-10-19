-- Add translations map to existing aiRaw payloads by nesting the current value under en-US
UPDATE "MealLog"
SET "aiRaw" = (
  (("aiRaw" - 'translations') - 'locale')
  || jsonb_build_object(
    'locale', to_jsonb('en-US'::text),
    'translations', jsonb_build_object(
      'en-US', (("aiRaw" - 'translations') - 'locale')
    )
  )
)
WHERE "aiRaw" IS NOT NULL
  AND jsonb_typeof("aiRaw") = 'object'
  AND NOT ("aiRaw" ? 'translations');
