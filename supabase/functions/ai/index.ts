import {
  GeminiNutritionResponseSchema,
  AiTimeoutConfigSchema,
  type GeminiNutritionResponse,
  type HedgeAttemptReport,
  type Locale,
} from '@shared/index.d.ts';
import { createApp, HTTP_STATUS, HttpError } from '../_shared/http.ts';
import { requireAuth } from '../_shared/auth.ts';
import { evaluateAiUsage, recordAiUsage, buildUsageLimitError } from '../_shared/ai.ts';
import { DEFAULT_LOCALE, normalizeLocale } from '../_shared/locale.ts';
import type { Context } from 'hono';

const app = createApp();

const PRIMARY_MODEL = 'models/gemini-2.5-flash';
const FALLBACK_MODEL = 'models/gemini-2.5-pro';
const timeoutConfig = AiTimeoutConfigSchema.parse({
  AI_ATTEMPT_TIMEOUT_MS: Deno.env.get('AI_ATTEMPT_TIMEOUT_MS'),
  AI_TOTAL_TIMEOUT_MS: Deno.env.get('AI_TOTAL_TIMEOUT_MS'),
  AI_HEDGE_DELAY_MS: Deno.env.get('AI_HEDGE_DELAY_MS'),
  AI_MAX_ATTEMPTS: Deno.env.get('AI_MAX_ATTEMPTS'),
});

app.get('/health', (c) => c.json({ ok: true, service: 'ai' }));

// 現在のAI使用状況を返す（デバッグ用途）
app.get('/api/usage', requireAuth, async (c) => {
  const user = c.get('user');
  const status = await evaluateAiUsage(user.id);
  return c.json({ ok: true, usage: status });
});

app.post('/api/ai/analyze', requireAuth, async (c) => {
  const user = c.get('user');
  const { message, file, locale } = await parseAnalyzeRequest(c);

  if (!message) {
    throw new HttpError('message is required', { status: HTTP_STATUS.BAD_REQUEST, expose: true });
  }

  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  const imageBase64 = file ? await fileToBase64(file) : undefined;
  const imageMimeType = file?.type || (file as { mimeType?: string }).mimeType;

  const analysis = await analyzeMeal({
    message,
    imageBase64,
    imageMimeType,
    locale: locale ? normalizeLocale(locale) : DEFAULT_LOCALE,
  });

  const usage = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  const result: GeminiNutritionResponse = {
    ...analysis.response,
    meta: {
      ...(analysis.response.meta ?? {}),
      model: analysis.meta.model,
      fallback_model_used: analysis.meta.model !== PRIMARY_MODEL,
      attempt: analysis.meta.attempt,
      latencyMs: analysis.meta.latencyMs,
      attemptReports: analysis.attemptReports,
    },
  };

  return c.json({
    ok: true,
    text: message,
    result,
    attempts: analysis.attemptReports,
    activeModel: analysis.meta.model,
    usage,
  });
});

// 簡易デバッグ: AI疎通とレイテンシ確認
app.get('/api/debug/ai', requireAuth, async (c) => {
  const user = c.get('user');
  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  const started = Date.now();
  const analysis = await analyzeMeal({ message: 'ping meal of steamed rice and grilled chicken (debug)' });
  const latencyMs = Date.now() - started;

  const usage = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  return c.json({
    ok: true,
    attempts: analysis.attemptReports,
    activeModel: analysis.meta.model,
    pingLatencyMs: latencyMs,
    usage,
  });
});

// テキスト解析デバッグ
app.get('/api/debug/ai/analyze', requireAuth, async (c) => {
  const user = c.get('user');
  const usageStatus = await evaluateAiUsage(user.id);
  if (!usageStatus.allowed) {
    throw buildUsageLimitError(usageStatus);
  }

  const url = new URL(c.req.url);
  const text = url.searchParams.get('text') ?? 'カレーライス';

  const analysis = await analyzeMeal({ message: text });

  const usage = await recordAiUsage({
    userId: user.id,
    usageDate: usageStatus.usageDate,
    consumeCredit: usageStatus.consumeCredit,
  });

  const result: GeminiNutritionResponse = {
    ...analysis.response,
    meta: {
      ...(analysis.response.meta ?? {}),
      model: analysis.meta.model,
      fallback_model_used: analysis.meta.model !== PRIMARY_MODEL,
      attempt: analysis.meta.attempt,
      latencyMs: analysis.meta.latencyMs,
      attemptReports: analysis.attemptReports,
    },
  };

  return c.json({
    ok: true,
    text,
    result,
    attempts: analysis.attemptReports,
    activeModel: analysis.meta.model,
    usage,
  });
});

export default app;

async function parseAnalyzeRequest(c: Context) {
  const contentType = c.req.header('content-type') ?? '';
  const acceptLanguage = c.req.header('accept-language') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.parseBody();
    const message = typeof form['message'] === 'string' ? form['message'].trim() : '';
    const locale = resolveLocale(typeof form['locale'] === 'string' ? form['locale'] : undefined, acceptLanguage);
    const file = form['image'] instanceof File ? (form['image'] as File) : undefined;
    return { message, file, locale };
  }

  // Fallback: JSON body
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
  const imageMimeType = typeof body.imageMimeType === 'string' ? body.imageMimeType : undefined;
  const locale = resolveLocale(typeof body.locale === 'string' ? body.locale : undefined, acceptLanguage);

  let file: File | undefined;
  if (imageBase64) {
    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    file = new File([bytes], 'upload', { type: imageMimeType ?? 'application/octet-stream' });
  }

  return { message, file, locale };
}

async function analyzeMeal(params: { message: string; imageBase64?: string; imageMimeType?: string; locale?: Locale }) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    const mock = buildMockResponse(params.message, params.locale ?? DEFAULT_LOCALE);
    const meta = { model: 'mock', attempt: 1, latencyMs: 10, rawText: JSON.stringify(mock) };
    return {
      response: mock,
      attemptReports: [
        { model: 'mock', ok: true, latencyMs: meta.latencyMs, attempt: 1, textLen: meta.rawText.length },
      ],
      meta,
    };
  }

  const attemptReports: HedgeAttemptReport[] = [];

  const primary = await attemptModel(PRIMARY_MODEL, params, apiKey, 1).catch((error) => {
    attemptReports.push(error.report);
    return null;
  });

  if (primary) {
    attemptReports.push(primary.report);
    return {
      response: primary.response,
      attemptReports,
      meta: { model: PRIMARY_MODEL, attempt: 1, latencyMs: primary.report.latencyMs, rawText: primary.rawText },
    };
  }

  const fallback = await attemptModel(FALLBACK_MODEL, params, apiKey, 2);
  attemptReports.push(fallback.report);
  const response: GeminiNutritionResponse = {
    ...fallback.response,
    meta: { ...(fallback.response.meta ?? {}), fallback_model_used: true },
  };
  return {
    response,
    attemptReports,
    meta: { model: FALLBACK_MODEL, attempt: 2, latencyMs: fallback.report.latencyMs, rawText: fallback.rawText },
  };
}

async function attemptModel(
  model: string,
  params: { message: string; imageBase64?: string; imageMimeType?: string; locale?: Locale },
  apiKey: string,
  attemptNumber: number,
) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`);
  url.searchParams.set('key', apiKey);

  const prompt = buildPrompt(params.message, params.locale ?? DEFAULT_LOCALE);
  const requestBody: Record<string, unknown> = {
    contents: [
      {
        parts: [
          ...(params.imageBase64 && params.imageMimeType
            ? [
                {
                  inline_data: {
                    mime_type: params.imageMimeType,
                    data: params.imageBase64,
                  },
                },
              ]
            : []),
          { text: prompt },
        ],
        role: 'user',
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topK: 32,
      topP: 0.8,
      responseMimeType: 'application/json',
    },
  };

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('AI_ATTEMPT_TIMEOUT'), timeoutConfig.AI_ATTEMPT_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const text = await resp.text();
    const latencyMs = Date.now() - started;

    if (!resp.ok) {
      throw buildAttemptError(model, latencyMs, `Gemini error ${resp.status}: ${text}`);
    }

    const data = JSON.parse(text) as any;
    const first = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!first) {
      throw buildAttemptError(model, latencyMs, 'Gemini returned no content');
    }

    const parsed = GeminiNutritionResponseSchema.parse(JSON.parse(first));
    const report: HedgeAttemptReport = { model, ok: true, latencyMs, attempt: attemptNumber, textLen: first.length };

    return { response: parsed, rawText: first, report };
  } catch (error) {
    const latencyMs = Date.now() - started;
    throw buildAttemptError(
      model,
      latencyMs,
      attemptNumber,
      error instanceof Error ? error.message : 'Unknown AI error',
    );
  } finally {
    clearTimeout(timer);
  }
}

function buildAttemptError(model: string, latencyMs: number, attemptNumber: number, message: string) {
  const report: HedgeAttemptReport = { model, ok: false, latencyMs, attempt: attemptNumber, error: message, textLen: 0 };
  const err = new Error(message) as Error & { report: HedgeAttemptReport };
  err.report = report;
  return err;
}

async function fileToBase64(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i += 1) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function buildPrompt(userMessage: string, locale: Locale = DEFAULT_LOCALE) {
  return `You are a nutrition analyst. Analyze the following meal description and respond ONLY with a JSON object that matches this TypeScript type: {
  "dish": string,
  "confidence": number between 0 and 1,
  "totals": { "kcal": number, "protein_g": number, "fat_g": number, "carbs_g": number },
  "items": Array<{ "name": string, "grams": number, "protein_g"?: number, "fat_g"?: number, "carbs_g"?: number }>,
  "warnings"?: string[],
  "landing_type"?: string | null,
  "meta"?: { "model": string, "fallback_model_used"?: boolean }
}.
Numbers must be floats, never strings. Calories must be > 0 when meal is realistic. Use realistic default assumptions if unspecified. The end-user locale is ${locale}; consider locale-specific context but keep all text fields in English (United States).
User description: ${userMessage}`;
}

function buildMockResponse(message: string, locale: Locale): GeminiNutritionResponse {
  const baseCalories = Math.max(200, Math.min(900, message.length * 15));
  const totals = {
    kcal: baseCalories,
    protein_g: Math.round(baseCalories * 0.25) / 10,
    fat_g: Math.round(baseCalories * 0.3) / 10,
    carbs_g: Math.round(baseCalories * 0.4) / 10,
  };
  return {
    dish: message || 'meal',
    confidence: 0.5,
    totals,
    items: [
      {
        name: message || 'meal item',
        grams: 150,
        protein_g: totals.protein_g / 2,
        fat_g: totals.fat_g / 2,
        carbs_g: totals.carbs_g / 2,
      },
    ],
    warnings: [],
    landing_type: null,
    meta: { model: 'mock', translation: { locale } },
  };
}

function resolveLocale(requested?: string, acceptLanguage?: string) {
  const fromHeader = (acceptLanguage ?? '')
    .split(',')
    .map((v) => v.trim())
    .find((v) => v.length > 0);
  const candidate = (requested ?? '').trim() || fromHeader || DEFAULT_LOCALE;
  return candidate || DEFAULT_LOCALE;
}
