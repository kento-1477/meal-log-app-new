import assert from 'node:assert/strict';
import { DateTime } from 'luxon';

// Ensure required env vars are present before loading modules under test.
Deno.env.set('SUPABASE_URL', Deno.env.get('SUPABASE_URL') ?? 'http://localhost:54321');
Deno.env.set('SERVICE_ROLE_KEY', Deno.env.get('SERVICE_ROLE_KEY') ?? 'service-role-test-key');

const { supabaseAdmin } = await import('./supabase.ts');
const { evaluateAiUsage, recordAiUsage, buildUsageLimitError, summarizeUsageStatus } = await import('./ai.ts');
const { HttpError, HTTP_STATUS } = await import('./http.ts');

interface CounterState {
  userId: number;
  usageDate: string;
  count: number;
  lastUsedAt?: string;
}

interface PremiumGrant {
  userId: number;
  startDate: string;
  endDate: string;
}

interface MockState {
  users: Record<number, { aiCredits: number }>;
  counters: Record<string, CounterState>;
  premium: PremiumGrant[];
}

type Operation = 'select' | 'update' | 'insert';

interface Filter {
  op: 'eq' | 'lte' | 'gte';
  value: unknown;
}

const originalFrom = (supabaseAdmin as { from: unknown }).from as (table: string) => unknown;

function counterKey(userId: number, usageDate: string) {
  return `${userId}-${usageDate}`;
}

class MockQuery {
  #table: string;
  #state: MockState;
  #filters: Record<string, Filter> = {};
  #operation: Operation = 'select';
  #payload: Record<string, unknown> | null = null;

  constructor(table: string, state: MockState) {
    this.#table = table;
    this.#state = state;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.#filters[column] = { op: 'eq', value };
    return this;
  }

  lte(column: string, value: unknown) {
    this.#filters[column] = { op: 'lte', value };
    return this;
  }

  gte(column: string, value: unknown) {
    this.#filters[column] = { op: 'gte', value };
    return this;
  }

  limit(_value: number) {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.#operation = 'update';
    this.#payload = values;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.#operation = 'insert';
    this.#payload = values;
    return this;
  }

  async maybeSingle() {
    return this.#run();
  }

  async single() {
    return this.#run();
  }

  async #run() {
    if (this.#table === 'User') {
      return this.#runUser();
    }
    if (this.#table === 'AiUsageCounter') {
      return this.#runCounter();
    }
    if (this.#table === 'PremiumGrant') {
      return this.#runPremiumGrant();
    }

    return { data: null, error: new Error(`Unknown table ${this.#table}`) };
  }

  #runUser() {
    const id = this.#filters.id?.value as number | undefined;
    const current = id === undefined ? undefined : this.#state.users[id];

    if (this.#operation === 'update') {
      if (id === undefined || !current) return { data: null, error: new Error('User not found') };
      const updated = { ...current, ...(this.#payload ?? {}) };
      this.#state.users[id] = updated;
      return { data: updated, error: null };
    }

    return { data: current ?? null, error: null };
  }

  #runCounter() {
    const userId = this.#filters.userId?.value as number | undefined;
    const usageDate = this.#filters.usageDate?.value as string | undefined;
    const payloadUserId = typeof this.#payload?.userId === 'number' ? this.#payload.userId : undefined;
    const payloadUsageDate = typeof this.#payload?.usageDate === 'string' ? this.#payload.usageDate : undefined;
    const effectiveUserId = userId ?? payloadUserId ?? -1;
    const effectiveUsageDate = usageDate ?? payloadUsageDate ?? '';
    const key = counterKey(effectiveUserId, effectiveUsageDate);
    const current = this.#state.counters[key];

    if (this.#operation === 'insert') {
      const count = typeof this.#payload?.count === 'number' ? this.#payload.count : 0;
      const inserted: CounterState = {
        userId: effectiveUserId,
        usageDate: effectiveUsageDate,
        count,
        lastUsedAt: typeof this.#payload?.lastUsedAt === 'string' ? this.#payload.lastUsedAt : undefined,
      };
      this.#state.counters[key] = inserted;
      return { data: { count: inserted.count, lastUsedAt: inserted.lastUsedAt }, error: null };
    }

    if (this.#operation === 'update') {
      if (!current) return { data: null, error: new Error('Counter not found') };
      const updatedCount = typeof this.#payload?.count === 'number' ? this.#payload.count : current.count;
      const updated: CounterState = {
        ...current,
        count: updatedCount,
        lastUsedAt: typeof this.#payload?.lastUsedAt === 'string' ? this.#payload.lastUsedAt : current.lastUsedAt,
      };
      this.#state.counters[key] = updated;
      return { data: { count: updated.count, lastUsedAt: updated.lastUsedAt }, error: null };
    }

    return { data: current ? { count: current.count, lastUsedAt: current.lastUsedAt } : null, error: null };
  }

  #runPremiumGrant() {
    const userId = this.#filters.userId?.value as number | undefined;
    const after = this.#filters.startDate?.value as string | undefined;
    const before = this.#filters.endDate?.value as string | undefined;

    const found = this.#state.premium.find((grant) => {
      if (userId !== undefined && grant.userId !== userId) return false;
      if (after && grant.startDate > after) return false;
      if (before && grant.endDate < before) return false;
      return true;
    });

    return { data: found ?? null, error: null };
  }
}

function withMockSupabase(state: MockState, fn: () => Promise<void> | void) {
  const restore = () => {
    (supabaseAdmin as { from: unknown }).from = originalFrom;
  };

  (supabaseAdmin as { from: unknown }).from = (table: string) => new MockQuery(table, state);

  return (async () => {
    try {
      await fn();
    } finally {
      restore();
    }
  })();
}

function withFixedNow(nowIso: string, fn: () => Promise<void> | void) {
  const RealDate = Date;

  class FixedDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) {
        super(nowIso);
      } else {
        // @ts-ignore: allow forwarding arbitrary constructor params
        super(value);
      }
    }

    static override now() {
      return new RealDate(nowIso).getTime();
    }
  }

  (globalThis as { Date: typeof Date }).Date = FixedDate as typeof Date;

  return (async () => {
    try {
      await fn();
    } finally {
      (globalThis as { Date: typeof Date }).Date = RealDate;
    }
  })();
}

function usageDateIso(nowIso: string) {
  return DateTime.fromISO(nowIso).setZone('Asia/Tokyo').startOf('day').toISODate() ?? '';
}

Deno.test('ai usage helpers', async (t) => {
  await t.step('evaluateAiUsage reports remaining allowance for free plan', async () => {
    const nowIso = '2025-06-01T00:00:00Z';
    const usageIso = usageDateIso(nowIso);
    const state: MockState = {
      users: { 1: { aiCredits: 0 } },
      counters: { [counterKey(1, usageIso)]: { userId: 1, usageDate: usageIso, count: 1 } },
      premium: [],
    };

    await withFixedNow(nowIso, async () => {
      await withMockSupabase(state, async () => {
        const status = await evaluateAiUsage(1);
        assert.equal(status.plan, 'FREE');
        assert.equal(status.limit, 3);
        assert.equal(status.used, 1);
        assert.equal(status.remaining, 2);
        assert.equal(status.allowed, true);
        assert.equal(status.consumeCredit, false);
      });
    });
  });

  await t.step('evaluateAiUsage allows credit consumption when limit is reached', async () => {
    const nowIso = '2025-06-01T00:00:00Z';
    const usageIso = usageDateIso(nowIso);
    const state: MockState = {
      users: { 42: { aiCredits: 5 } },
      counters: { [counterKey(42, usageIso)]: { userId: 42, usageDate: usageIso, count: 3 } },
      premium: [],
    };

    await withFixedNow(nowIso, async () => {
      await withMockSupabase(state, async () => {
        const status = await evaluateAiUsage(42);
        assert.equal(status.allowed, true);
        assert.equal(status.consumeCredit, true);
        assert.equal(status.remaining, 0);
        assert.equal(status.credits, 5);
      });
    });
  });

  await t.step('recordAiUsage updates counters, credits, and premium tier', async () => {
    const nowIso = '2025-05-01T00:00:00Z';
    const usageIso = usageDateIso(nowIso);
    const usageDate = DateTime.fromISO(nowIso).toJSDate();
    const state: MockState = {
      users: { 99: { aiCredits: 2 } },
      counters: { [counterKey(99, usageIso)]: { userId: 99, usageDate: usageIso, count: 20 } },
      premium: [
        {
          userId: 99,
          startDate: '2025-04-01T00:00:00Z',
          endDate: '2026-01-01T00:00:00Z',
        },
      ],
    };

    await withFixedNow(nowIso, async () => {
      await withMockSupabase(state, async () => {
        const summary = await recordAiUsage({ userId: 99, usageDate, consumeCredit: true });
        assert.equal(summary.plan, 'PREMIUM');
        assert.equal(summary.limit, 20);
        assert.equal(summary.used, 21);
        assert.equal(summary.remaining, 0);
        assert.equal(summary.credits, 1);
        assert.equal(summary.consumedCredit, true);
        assert.ok(summary.resetsAt.startsWith('2025-05-02'));
      });
    });
  });

  await t.step('recordAiUsage inserts counter when no prior usage exists', async () => {
    const nowIso = '2025-02-10T12:00:00Z';
    const usageIso = usageDateIso(nowIso);
    const usageDate = DateTime.fromISO(nowIso).toJSDate();
    const state: MockState = {
      users: { 5: { aiCredits: 1 } },
      counters: {},
      premium: [],
    };

    await withFixedNow(nowIso, async () => {
      await withMockSupabase(state, async () => {
        const summary = await recordAiUsage({ userId: 5, usageDate, consumeCredit: false });
        assert.equal(summary.plan, 'FREE');
        assert.equal(summary.used, 1);
        assert.equal(summary.remaining, 2);
        assert.equal(summary.credits, 1);
        assert.equal(summary.consumedCredit, false);
        assert.ok(summary.resetsAt.startsWith('2025-02-11'));
        assert.equal(state.counters[counterKey(5, usageIso)]?.count, 1);
      });
    });
  });

  await t.step('evaluateAiUsage throws a HttpError when user row is missing', async () => {
    const nowIso = '2025-06-01T00:00:00Z';
    const state: MockState = { users: {}, counters: {}, premium: [] };

    await withFixedNow(nowIso, async () => {
      await withMockSupabase(state, async () => {
        await assert.rejects(() => evaluateAiUsage(123), (error: unknown) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.status, HTTP_STATUS.NOT_FOUND);
          return true;
        });
      });
    });
  });

  await t.step('buildUsageLimitError exposes limit metadata', () => {
    const usageDay = DateTime.fromISO('2025-06-01T03:00:00+09:00');
    const status = {
      allowed: false,
      plan: 'FREE' as const,
      limit: 3,
      used: 3,
      remaining: 0,
      credits: 0,
      consumeCredit: false,
      usageDate: usageDay.startOf('day').toJSDate(),
    };

    const error = buildUsageLimitError(status);
    assert.equal(error.status, HTTP_STATUS.TOO_MANY_REQUESTS);
    assert.equal(error.code, 'AI_USAGE_LIMIT');
    assert.equal(error.expose, true);
    assert.equal((error.data as { limit: number }).limit, 3);
    const expectedReset = summarizeUsageStatus(status).resetsAt;
    assert.equal((error.data as { resetsAt: string }).resetsAt, expectedReset);
  });
});
