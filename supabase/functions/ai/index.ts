import { createApp, HTTP_STATUS } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';
import { evaluateAiUsage, recordAiUsage } from '../_shared/ai.ts';

const app = createApp();

app.get('/health', (c) => c.json({ ok: true, service: 'ai' }));

// 簡易: AI使用状況の取得（デバッグ用に置いておく）
app.get('/api/usage', requireAuth, async (c) => {
  const user = c.get('user');
  const status = await evaluateAiUsage(user.id);
  return c.json({ ok: true, usage: status });
});

// DEBUG: Geminiの ping テスト相当 (/api/debug/ai に合わせた簡易版)
app.get('/api/debug/ai', requireAuth, async (c) => {
  const user = c.get('user');
  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    return c.json({ ok: false, error: 'AI利用回数の上限に達しました' }, HTTP_STATUS.TOO_MANY_REQUESTS);
  }
  // 実際の推論は未実装なのでダミー応答
  const latencyMs = Math.floor(Math.random() * 200) + 50;
  const usage = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });
  return c.json({
    ok: true,
    attempts: [{ model: 'gemini-placeholder', success: true }],
    activeModel: 'gemini-placeholder',
    pingLatencyMs: latencyMs,
    usage,
  });
});

// DEBUG: テキスト解析相当 (/api/debug/ai/analyze に合わせた簡易版)
app.get('/api/debug/ai/analyze', requireAuth, async (c) => {
  const user = c.get('user');
  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    return c.json({ ok: false, error: 'AI利用回数の上限に達しました' }, HTTP_STATUS.TOO_MANY_REQUESTS);
  }
  const url = new URL(c.req.url);
  const text = url.searchParams.get('text') ?? 'カレーライス';
  // 実際の推論は未実装なのでダミー応答
  const fakeResponse = {
    dish: text,
    confidence: 0.6,
    totals: { kcal: 500, protein_g: 20, fat_g: 15, carbs_g: 60 },
    items: [],
    warnings: [],
    landing_type: null,
    meta: { placeholder: true },
  };
  const usage = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });
  return c.json({
    ok: true,
    text,
    result: {
      ...fakeResponse,
      meta: {
        ...(fakeResponse.meta ?? {}),
        fallback_model_used: false,
      },
    },
    usage,
  });
});

export default app;
