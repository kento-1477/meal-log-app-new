import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const outputDir = path.join(__dirname, 'output');
const expectedPath = path.join(fixturesDir, 'dual_write_expected.json');
const inputPath = path.join(fixturesDir, 'dual_write_input.json');
const actualPath = path.join(outputDir, 'dual_write_actual.json');

const loadJson = async (filePath) => {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents);
};

const epsilon = 1e-3;

const assertClose = (messages, contextLabel, expected, actual) => {
  const delta = Math.abs(expected - actual);
  if (delta > epsilon) {
    messages.push(
      `${contextLabel} differs (expected ${expected}, actual ${actual}, |Δ|=${delta.toFixed(4)})`
    );
  }
};

const enforceThreshold = (messages, label, value, limit) => {
  if (typeof limit !== 'number') return;
  if (Math.abs(value) > limit) {
    messages.push(
      `${label} exceeded limit ${limit} (observed ${value})`
    );
  }
};

const main = async () => {
  const [expected, actual, input] = await Promise.all([
    loadJson(expectedPath),
    loadJson(actualPath),
    loadJson(inputPath)
  ]);

  const messages = [];

  assertClose(messages, 'aggregate.calories', expected.aggregateDiff.calories, actual.aggregateDiff.calories);
  assertClose(messages, 'aggregate.proteinG', expected.aggregateDiff.proteinG, actual.aggregateDiff.proteinG);
  assertClose(messages, 'aggregate.fatG', expected.aggregateDiff.fatG, actual.aggregateDiff.fatG);
  assertClose(messages, 'aggregate.carbsG', expected.aggregateDiff.carbsG, actual.aggregateDiff.carbsG);

  const expectedPerLog = new Map(expected.perLogDiff.map((item) => [item.id, item]));
  const actualPerLog = new Map(actual.perLogDiff.map((item) => [item.id, item]));

  for (const [id, expectedLog] of expectedPerLog.entries()) {
    const actualLog = actualPerLog.get(id);
    if (!actualLog) {
      messages.push(`Missing actual diff for log ${id}`);
      continue;
    }

    assertClose(messages, `${id}.calories`, expectedLog.calories, actualLog.calories);
    assertClose(messages, `${id}.proteinG`, expectedLog.proteinG, actualLog.proteinG);
    assertClose(messages, `${id}.fatG`, expectedLog.fatG, actualLog.fatG);
    assertClose(messages, `${id}.carbsG`, expectedLog.carbsG, actualLog.carbsG);
    actualPerLog.delete(id);
  }

  for (const id of actualPerLog.keys()) {
    messages.push(`Unexpected log diff produced for ${id}`);
  }

  const thresholds = input.thresholds ?? {};
  enforceThreshold(messages, 'aggregate calories drift', actual.aggregateDiff.calories, thresholds.maxAggregateCalories);
  enforceThreshold(messages, 'aggregate protein drift', actual.aggregateDiff.proteinG, thresholds.maxMacroDiff);
  enforceThreshold(messages, 'aggregate fat drift', actual.aggregateDiff.fatG, thresholds.maxMacroDiff);
  enforceThreshold(messages, 'aggregate carbs drift', actual.aggregateDiff.carbsG, thresholds.maxMacroDiff);

  for (const perLog of actual.perLogDiff) {
    enforceThreshold(messages, `${perLog.id} calories drift`, perLog.calories, thresholds.maxPerLogCalories);
    enforceThreshold(messages, `${perLog.id} protein drift`, perLog.proteinG, thresholds.maxMacroDiff);
    enforceThreshold(messages, `${perLog.id} fat drift`, perLog.fatG, thresholds.maxMacroDiff);
    enforceThreshold(messages, `${perLog.id} carbs drift`, perLog.carbsG, thresholds.maxMacroDiff);
  }

  if (messages.length > 0) {
    console.error('[check_diffs] Dual-write regression detected:');
    for (const message of messages) {
      console.error(` - ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[check_diffs] Dual-write diffs match expected snapshot and thresholds.');
};

main().catch((error) => {
  console.error('[check_diffs] Failed to verify dual-write diffs');
  console.error(error);
  process.exitCode = 1;
});
