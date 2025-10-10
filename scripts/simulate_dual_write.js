import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const inputPath = path.join(fixturesDir, 'dual_write_input.json');
const outputDir = path.join(__dirname, 'output');
const outputPath = path.join(outputDir, 'dual_write_actual.json');

const loadJson = async (filePath) => {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents);
};

const diffValue = (baselineValue, candidateValue) => {
  const baseline = Number.isFinite(baselineValue) ? Number(baselineValue) : 0;
  const candidate = Number.isFinite(candidateValue) ? Number(candidateValue) : 0;
  return Number((candidate - baseline).toFixed(6));
};

const main = async () => {
  const input = await loadJson(inputPath);
  const candidateIndex = new Map(
    input.candidate.map((record) => [record.id, record])
  );

  const perLogDiff = input.baseline.map((baselineRecord) => {
    const candidateRecord = candidateIndex.get(baselineRecord.id);
    if (!candidateRecord) {
      throw new Error(
        `Missing candidate record for baseline id ${baselineRecord.id}`
      );
    }

    return {
      id: baselineRecord.id,
      calories: diffValue(baselineRecord.calories, candidateRecord.calories),
      proteinG: diffValue(baselineRecord.proteinG, candidateRecord.proteinG),
      fatG: diffValue(baselineRecord.fatG, candidateRecord.fatG),
      carbsG: diffValue(baselineRecord.carbsG, candidateRecord.carbsG)
    };
  });

  const aggregateDiff = perLogDiff.reduce(
    (acc, log) => {
      acc.calories += log.calories;
      acc.proteinG += log.proteinG;
      acc.fatG += log.fatG;
      acc.carbsG += log.carbsG;
      return acc;
    },
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 }
  );

  const output = {
    thresholds: input.thresholds,
    aggregateDiff,
    perLogDiff
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  const relativePath = path.relative(process.cwd(), outputPath);
  console.log(`Generated dual-write diff at ${relativePath}`);
};

main().catch((error) => {
  console.error('[simulate_dual_write] Failed to produce diff snapshot');
  console.error(error);
  process.exitCode = 1;
});
