import { GeminiNutritionResponseSchema, type GeminiNutritionResponse, type HedgeAttemptReport } from '@meal-log/shared';
import { env, timeoutConfig } from '../env.js';

interface AnalyzeMealParams {
  message: string;
  imageBase64?: string;
  imageMimeType?: string;
}

interface AnalyzeMealResult {
  response: GeminiNutritionResponse;
  attemptReports: HedgeAttemptReport[];
  meta: {
    model: string;
    attempt: number;
    latencyMs: number;
    rawText: string;
  };
}

const PRIMARY_MODEL = 'models/gemini-2.5-flash';
const FALLBACK_MODEL = 'models/gemini-2.5-pro';

class AiAttemptError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AiAttemptError';
  }
}

export async function analyzeMealWithGemini(params: AnalyzeMealParams): Promise<AnalyzeMealResult> {
  if (!env.GEMINI_API_KEY) {
    const mock = buildMockResponse(params.message);
    const meta = { model: 'mock', attempt: 1, latencyMs: 12, rawText: JSON.stringify(mock) };
    return { response: mock, attemptReports: [{ model: 'mock', ok: true, latencyMs: 12, attempt: 1, textLen: meta.rawText.length }], meta };
  }

  const attempts: HedgeAttemptReport[] = [];
  let settled = false;
  let completed = 0;
  const errors: Error[] = [];

  const totalTimeout = timeoutConfig.AI_TOTAL_TIMEOUT_MS;

  return await new Promise<AnalyzeMealResult>((resolve, reject) => {
    const totalTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('AI_TIMEOUT_TOTAL'));
    }, totalTimeout);

    const finishSuccess = (result: AnalyzeMealResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      resolve(result);
    };

    const finishFailure = (error: Error) => {
      errors.push(error);
      completed += 1;
      if (completed >= timeoutConfig.AI_MAX_ATTEMPTS && !settled) {
        settled = true;
        clearTimeout(totalTimer);
        const aggregate = new AggregateError(errors, 'AI_ALL_ATTEMPTS_FAILED');
        reject(aggregate);
      }
    };

    for (let attemptIndex = 0; attemptIndex < timeoutConfig.AI_MAX_ATTEMPTS; attemptIndex += 1) {
      const attemptNumber = attemptIndex + 1;
      const model = attemptNumber === timeoutConfig.AI_MAX_ATTEMPTS ? FALLBACK_MODEL : PRIMARY_MODEL;
      const delay = attemptIndex * timeoutConfig.AI_HEDGE_DELAY_MS;

      setTimeout(async () => {
        if (settled) return;
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort('AI_ATTEMPT_TIMEOUT'), timeoutConfig.AI_ATTEMPT_TIMEOUT_MS);

        try {
          const rawText = await callGemini(model, params, controller.signal);
          const parsed = GeminiNutritionResponseSchema.parse(JSON.parse(rawText));
          const latencyMs = Date.now() - started;

          const report: HedgeAttemptReport = {
            model,
            ok: true,
            latencyMs,
            textLen: rawText.length,
            attempt: attemptNumber,
          };
          attempts.push(report);
          finishSuccess({
            response: parsed,
            attemptReports: attempts,
            meta: { model, attempt: attemptNumber, latencyMs, rawText },
          });
        } catch (error) {
          const latencyMs = Date.now() - started;
          const err = error instanceof Error ? error : new AiAttemptError('Unknown AI error', error);
          attempts.push({
            model,
            ok: false,
            latencyMs,
            textLen: 0,
            attempt: attemptNumber,
            error: err.message,
          });
          finishFailure(err);
        } finally {
          clearTimeout(timer);
        }
      }, delay);
    }
  });
}

async function callGemini(model: string, params: AnalyzeMealParams, signal: AbortSignal) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`);
  url.searchParams.set('key', env.GEMINI_API_KEY!);

  const prompt = buildPrompt(params.message);

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
          {
            text: prompt,
          },
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AiAttemptError(`Gemini responded with ${response.status}`, text);
  }

  const data = (await response.json()) as any;
  const firstCandidate: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!firstCandidate) {
    throw new AiAttemptError('Gemini returned no candidates');
  }

  return firstCandidate;
}

function buildPrompt(userMessage: string) {
  return `You are a nutrition analyst. Analyze the following meal description and respond ONLY with a JSON object that matches this TypeScript type: {
  "dish": string,
  "confidence": number between 0 and 1,
  "totals": { "kcal": number, "protein_g": number, "fat_g": number, "carbs_g": number },
  "items": Array<{ "name": string, "grams": number, "protein_g"?: number, "fat_g"?: number, "carbs_g"?: number }>,
  "warnings"?: string[],
  "landing_type"?: string | null,
  "meta"?: { "model": string, "fallback_model_used"?: boolean }
}.
Numbers must be floats, never strings. Calories must be > 0 when meal is realistic. Use realistic default assumptions if unspecified.
User description: ${userMessage}`;
}

function buildMockResponse(message: string): GeminiNutritionResponse {
  const baseCalories = Math.max(200, Math.min(900, message.length * 15));
  const protein = Math.round(baseCalories * 0.3);
  const fat = Math.round(baseCalories * 0.25);
  const carbs = Math.round(baseCalories * 0.45);

  return {
    dish: message.slice(0, 60) || 'Meal',
    confidence: 0.65,
    totals: {
      kcal: baseCalories,
      protein_g: Number((protein / 4).toFixed(1)),
      fat_g: Number((fat / 9).toFixed(1)),
      carbs_g: Number((carbs / 4).toFixed(1)),
    },
    items: [
      {
        name: message || 'Assorted ingredients',
        grams: 300,
        protein_g: Number(((protein / 4) * 0.8).toFixed(1)),
        fat_g: Number(((fat / 9) * 0.7).toFixed(1)),
        carbs_g: Number(((carbs / 4) * 0.85).toFixed(1)),
      },
    ],
    warnings: [],
    landing_type: 'mock',
    meta: {
      model: 'mock-gemini',
      fallback_model_used: false,
      attempt: 1,
      latencyMs: 12,
    },
  };
}
