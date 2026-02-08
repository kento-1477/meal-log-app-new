import assert from 'node:assert/strict';

Deno.env.set('SUPABASE_URL', Deno.env.get('SUPABASE_URL') ?? 'http://localhost:54321');
Deno.env.set('SERVICE_ROLE_KEY', Deno.env.get('SERVICE_ROLE_KEY') ?? 'service-role-test-key');
Deno.env.set('REPORT_VOICE_MODE_ENABLED', 'true');
Deno.env.set('REPORT_REQUEST_TIMEZONE_ENABLED', 'true');

const { supabaseAdmin } = await import('../_shared/supabase.ts');
const { __testables } = await import('./index.ts');

type MealLogRow = {
  userId: number;
  createdAt: string;
  deletedAt: string | null;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  mealPeriod: string | null;
};

type MockState = {
  mealLogs: MealLogRow[];
  userProfile: {
    targetCalories?: number | null;
    targetProteinG?: number | null;
    targetFatG?: number | null;
    targetCarbsG?: number | null;
  } | null;
  preferenceRow: {
    goal: string;
    focusAreas: string[];
    adviceStyle: string;
    updatedAt?: string;
    voiceMode?: string;
  } | null;
  capturedUpsert: Record<string, unknown> | null;
};

const originalFrom = (supabaseAdmin as { from: unknown }).from as (table: string) => unknown;

class MockQuery {
  #table: string;
  #state: MockState;
  #filters: Record<string, unknown> = {};
  #operation: 'select' | 'upsert' = 'select';
  #payload: Record<string, unknown> | null = null;

  constructor(table: string, state: MockState) {
    this.#table = table;
    this.#state = state;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.#filters[`eq:${column}`] = value;
    return this;
  }

  is(column: string, value: unknown) {
    this.#filters[`is:${column}`] = value;
    return this;
  }

  gte(column: string, value: unknown) {
    this.#filters[`gte:${column}`] = value;
    return this;
  }

  lt(column: string, value: unknown) {
    this.#filters[`lt:${column}`] = value;
    return this;
  }

  upsert(values: Record<string, unknown>) {
    this.#operation = 'upsert';
    this.#payload = values;
    this.#state.capturedUpsert = values;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.#runSingle());
  }

  single() {
    return Promise.resolve(this.#runSingle());
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.#runAwait()).then(resolve, reject);
  }

  #runAwait() {
    if (this.#table === 'MealLog') {
      const userId = this.#filters['eq:userId'] as number | undefined;
      const deletedAt = this.#filters['is:deletedAt'];
      const from = this.#filters['gte:createdAt'] as string | undefined;
      const to = this.#filters['lt:createdAt'] as string | undefined;

      let rows = this.#state.mealLogs.slice();
      if (typeof userId === 'number') {
        rows = rows.filter((row) => row.userId === userId);
      }
      if (deletedAt === null) {
        rows = rows.filter((row) => row.deletedAt === null);
      }
      if (typeof from === 'string') {
        rows = rows.filter((row) => row.createdAt >= from);
      }
      if (typeof to === 'string') {
        rows = rows.filter((row) => row.createdAt < to);
      }

      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }

  #runSingle() {
    if (this.#table === 'UserProfile') {
      return { data: this.#state.userProfile, error: null };
    }

    if (this.#table === 'UserReportPreference') {
      if (this.#operation === 'upsert') {
        const saved = {
          goal: this.#payload?.goal,
          focusAreas: this.#payload?.focusAreas,
          adviceStyle: this.#payload?.adviceStyle,
          voiceMode: this.#payload?.voiceMode,
          updatedAt: this.#payload?.updatedAt ?? new Date().toISOString(),
        };
        return { data: saved, error: null };
      }
      return { data: this.#state.preferenceRow, error: null };
    }

    return { data: null, error: null };
  }
}

async function withMockSupabase(state: MockState, fn: () => Promise<void> | void) {
  (supabaseAdmin as { from: unknown }).from = (table: string) => new MockQuery(table, state);
  try {
    await fn();
  } finally {
    (supabaseAdmin as { from: unknown }).from = originalFrom;
  }
}

async function withFixedNow(nowIso: string, fn: () => Promise<void> | void) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) {
        super(nowIso);
      } else {
        super(value);
      }
    }
    static override now() {
      return new RealDate(nowIso).getTime();
    }
  }

  (globalThis as { Date: typeof Date }).Date = FixedDate as typeof Date;
  try {
    await fn();
  } finally {
    (globalThis as { Date: typeof Date }).Date = RealDate;
  }
}

const {
  parseRolloutPercent,
  resolveUserRolloutBucket,
  isFeatureEnabledForUser,
  normalizeReportPreference,
  buildReportPrompt,
  normalizeReportTone,
  resolveReportRange,
  getDashboardSummary,
  normalizeStoredReport,
  getUserReportPreference,
  upsertUserReportPreference,
} = __testables;

Deno.test('rollout helpers clamp value and gate by stable user bucket', () => {
  assert.equal(parseRolloutPercent('150', 100), 100);
  assert.equal(parseRolloutPercent('-20', 100), 0);
  assert.equal(parseRolloutPercent('foo', 100), 100);

  const userId = 42;
  const bucket = resolveUserRolloutBucket(userId);
  assert.equal(resolveUserRolloutBucket(userId), bucket);
  assert.ok(bucket >= 0 && bucket <= 99);

  assert.equal(isFeatureEnabledForUser(true, 100, userId), true);
  assert.equal(isFeatureEnabledForUser(true, 0, userId), false);
  assert.equal(isFeatureEnabledForUser(false, 100, userId), false);
  assert.equal(isFeatureEnabledForUser(true, Math.min(100, bucket + 1), userId), true);
  if (bucket > 0) {
    assert.equal(isFeatureEnabledForUser(true, bucket, userId), false);
  }
});

Deno.test('normalizeReportPreference fills missing voiceMode with balanced', () => {
  const normalized = normalizeReportPreference({
    goal: 'maintain',
    focusAreas: ['habit'],
    adviceStyle: 'simple',
  });

  assert.equal(normalized.voiceMode, 'balanced');
});

Deno.test('buildReportPrompt reflects selected voice mode', () => {
  const baseContext = {
    period: 'daily',
    range: { from: '2025-01-01', to: '2025-01-01', timezone: 'Asia/Tokyo' },
    days: { total: 1, logged: 1 },
    calories: { total: 1800, average: 1800 },
    macros: {
      total: { calories: 1800, protein_g: 90, fat_g: 60, carbs_g: 210 },
      targets: { calories: 2000, protein_g: 120, fat_g: 55, carbs_g: 240 },
      delta: { calories: -200, protein_g: -30, fat_g: 5, carbs_g: -30 },
    },
    mealPeriods: { breakfast: 500, lunch: 700, dinner: 500, snack: 100, unknown: 0 },
    daily: [{ date: '2025-01-01', total: 1800 }],
    comparison: null,
  };

  const sharpPrompt = buildReportPrompt(
    {
      ...baseContext,
      preference: { goal: 'cut', focusAreas: ['weight'], adviceStyle: 'concrete', voiceMode: 'sharp' },
    },
    'ja',
  );
  const gentlePrompt = buildReportPrompt(
    {
      ...baseContext,
      preference: { goal: 'maintain', focusAreas: ['habit'], adviceStyle: 'motivational', voiceMode: 'gentle' },
    },
    'ja',
  );

  assert.match(sharpPrompt, /Voice mode: sharp/);
  assert.match(sharpPrompt, /Never insult, shame, or attack/);
  assert.match(gentlePrompt, /Voice mode: gentle/);
  assert.match(gentlePrompt, /Be warm and supportive/);
});

Deno.test('normalizeReportTone applies mode-specific adjustment and keeps metrics intact', () => {
  const report = {
    summary: {
      headline: '改善ポイントがあります',
      score: 58,
      highlights: ['記録は継続できています', 'たんぱく質が不足しています', '間食が多めです'],
    },
    metrics: [{ label: '平均カロリー', value: '1850 kcal' }],
    advice: [
      { priority: 'high', title: '夕食を調整', detail: '夕食で脂質を10g減らしてください' },
      { priority: 'medium', title: '間食管理', detail: '間食は200kcal以内にしましょう' },
    ],
    ingredients: [{ name: '鶏むね肉', reason: '脂質を抑えてたんぱく質を増やせる' }],
  };

  const sharp = normalizeReportTone(report, 'ja', 'sharp');
  const gentle = normalizeReportTone(report, 'ja', 'gentle');

  assert.match(sharp.advice[0].detail, /^最優先で修正:/);
  assert.match(gentle.advice[0].detail, /^まず良い点として、/);
  assert.equal(sharp.summary.score, report.summary.score);
  assert.equal(gentle.summary.score, report.summary.score);
  assert.deepEqual(sharp.metrics, report.metrics);
  assert.deepEqual(gentle.metrics, report.metrics);
});

Deno.test('resolveReportRange keeps timezone on DST boundary', () => {
  const resolved = resolveReportRange(
    'daily',
    { from: '2025-03-09', to: '2025-03-10' },
    'America/Los_Angeles',
  );

  assert.equal(resolved.timezone, 'America/Los_Angeles');
  assert.equal(resolved.from, '2025-03-09');
  assert.equal(resolved.to, '2025-03-10');
});

Deno.test('getDashboardSummary buckets daily totals by timezone', async () => {
  const state: MockState = {
    mealLogs: [
      {
        userId: 7,
        createdAt: '2024-12-31T23:30:00.000Z',
        deletedAt: null,
        calories: 100,
        proteinG: 10,
        fatG: 5,
        carbsG: 12,
        mealPeriod: 'dinner',
      },
      {
        userId: 7,
        createdAt: '2025-01-01T08:00:00.000Z',
        deletedAt: null,
        calories: 200,
        proteinG: 20,
        fatG: 10,
        carbsG: 24,
        mealPeriod: 'breakfast',
      },
    ],
    userProfile: {
      targetCalories: 2200,
      targetProteinG: 130,
      targetFatG: 70,
      targetCarbsG: 260,
    },
    preferenceRow: null,
    capturedUpsert: null,
  };

  await withFixedNow('2025-01-01T12:00:00.000Z', async () => {
    await withMockSupabase(state, async () => {
      const tokyo = await getDashboardSummary({
        userId: 7,
        period: 'custom',
        from: '2024-12-31',
        to: '2025-01-01',
        timezone: 'Asia/Tokyo',
      });
      const losAngeles = await getDashboardSummary({
        userId: 7,
        period: 'custom',
        from: '2024-12-31',
        to: '2025-01-01',
        timezone: 'America/Los_Angeles',
      });

      const tokyoByDate = Object.fromEntries(tokyo.calories.daily.map((entry: { date: string; total: number }) => [entry.date, entry.total]));
      const laByDate = Object.fromEntries(losAngeles.calories.daily.map((entry: { date: string; total: number }) => [entry.date, entry.total]));

      assert.equal(tokyoByDate['2024-12-31'], 0);
      assert.equal(tokyoByDate['2025-01-01'], 300);
      assert.equal(laByDate['2024-12-31'], 300);
      assert.equal(laByDate['2025-01-01'], 0);
    });
  });
});

Deno.test('getDashboardSummary assigns 2am log to previous logical day', async () => {
  const state: MockState = {
    mealLogs: [
      {
        userId: 8,
        createdAt: '2025-01-07T17:00:00.000Z', // 2025-01-08 02:00 JST
        deletedAt: null,
        calories: 180,
        proteinG: 12,
        fatG: 6,
        carbsG: 20,
        mealPeriod: 'snack',
      },
      {
        userId: 8,
        createdAt: '2025-01-07T20:00:00.000Z', // 2025-01-08 05:00 JST
        deletedAt: null,
        calories: 220,
        proteinG: 18,
        fatG: 7,
        carbsG: 24,
        mealPeriod: 'breakfast',
      },
    ],
    userProfile: {
      targetCalories: 2200,
      targetProteinG: 130,
      targetFatG: 70,
      targetCarbsG: 260,
    },
    preferenceRow: null,
    capturedUpsert: null,
  };

  await withFixedNow('2025-01-07T18:00:00.000Z', async () => {
    await withMockSupabase(state, async () => {
      const summary = await getDashboardSummary({
        userId: 8,
        period: 'custom',
        from: '2025-01-07',
        to: '2025-01-07',
        timezone: 'Asia/Tokyo',
      });

      const byDate = Object.fromEntries(summary.calories.daily.map((entry: { date: string; total: number }) => [entry.date, entry.total]));
      assert.equal(byDate['2025-01-07'], 180);
      assert.equal(byDate['2025-01-08'], undefined);
    });
  });
});

Deno.test('normalizeStoredReport supports legacy streakDays object', () => {
  const legacy = {
    period: 'daily',
    range: {
      from: '2025-01-01',
      to: '2025-01-01',
      timezone: 'Asia/Tokyo',
    },
    summary: {
      headline: 'テスト',
      score: 72,
      highlights: ['継続できています'],
    },
    metrics: [{ label: '記録日数', value: '7日' }],
    advice: [{ priority: 'medium', title: '継続', detail: '今日も記録しましょう' }],
    ingredients: [{ name: '豆腐', reason: '高たんぱくで扱いやすい' }],
    uiMeta: {
      effect: 'neutral',
      lowData: false,
      streakDays: { current: 9 },
      weeklyPrompt: true,
    },
  };

  const normalized = normalizeStoredReport(legacy);
  assert.ok(normalized);
  assert.equal(normalized?.uiMeta?.streakDays, 9);
});

Deno.test('GET/PUT report preference remains compatible without voiceMode', async () => {
  const state: MockState = {
    mealLogs: [],
    userProfile: null,
    preferenceRow: {
      goal: 'maintain',
      focusAreas: ['habit'],
      adviceStyle: 'simple',
      updatedAt: '2026-02-07T00:00:00.000Z',
    },
    capturedUpsert: null,
  };

  await withMockSupabase(state, async () => {
    const fetched = await getUserReportPreference(1);
    assert.equal(fetched.preference.voiceMode, 'balanced');

    const saved = await upsertUserReportPreference(1, {
      goal: 'cut',
      focusAreas: ['weight'],
      adviceStyle: 'concrete',
    });

    assert.equal((state.capturedUpsert as { voiceMode?: string } | null)?.voiceMode, 'balanced');
    assert.equal(saved.preference.voiceMode, 'balanced');
  });
});
