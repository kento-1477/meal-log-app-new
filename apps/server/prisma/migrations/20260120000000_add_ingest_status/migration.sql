-- Add ingest status tracking and metadata fields.
ALTER TABLE "IngestRequest" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "IngestRequest" ADD COLUMN     "errorCode" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "errorCategory" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "userMessage" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "debugMessage" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "nextCheckAt" TIMESTAMPTZ;
ALTER TABLE "IngestRequest" ADD COLUMN     "deadlineAt" TIMESTAMPTZ;
ALTER TABLE "IngestRequest" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestRequest" ADD COLUMN     "modelAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestRequest" ADD COLUMN     "inputHash" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "inputHashBucket" DATE;
ALTER TABLE "IngestRequest" ADD COLUMN     "promptVersion" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "modelVersion" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "appVersion" TEXT;
ALTER TABLE "IngestRequest" ADD COLUMN     "startedAt" TIMESTAMPTZ;
ALTER TABLE "IngestRequest" ADD COLUMN     "finishedAt" TIMESTAMPTZ;

ALTER TABLE "IngestRequest"
  ADD CONSTRAINT "IngestRequest_status_check"
  CHECK ("status" IN ('queued', 'processing', 'done', 'failed', 'deferred'));

ALTER TABLE "IngestRequest"
  ADD CONSTRAINT "IngestRequest_errorCategory_check"
  CHECK ("errorCategory" IN ('waitable', 'actionable'));

CREATE INDEX "IngestRequest_status_nextCheck_idx"
  ON "IngestRequest" ("status", "nextCheckAt");

CREATE INDEX "IngestRequest_user_status_created_idx"
  ON "IngestRequest" ("userId", "status", "createdAt" DESC);

CREATE INDEX "IngestRequest_inputHash_idx"
  ON "IngestRequest" ("inputHash");

CREATE INDEX "IngestRequest_user_inputHash_bucket_idx"
  ON "IngestRequest" ("userId", "inputHash", "inputHashBucket");

UPDATE "IngestRequest"
SET "status" = CASE WHEN "logId" IS NOT NULL THEN 'done' ELSE 'processing' END,
    "finishedAt" = CASE WHEN "logId" IS NOT NULL THEN NOW() ELSE NULL END
WHERE "status" = 'queued';
