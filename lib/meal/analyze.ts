/**
 * 解析エンジン本体：写真／テキスト → Gemini（またはモック）→ 厳密パース（失敗時 1 回だけリトライ）。
 * Next.js に依存しないので、そだてるダイエット本体へはこの lib/meal ごと移植できる。
 */
import { callGemini, MODEL_ID, photoParts, textParts, type GeminiCallResult, type GeminiUsage } from "./gemini";
import { callMock, callMockText } from "./mock";
import { preprocessImage } from "./preprocess";
import { MEAL_PROMPT, PROMPT_VERSION, TEXT_INPUT_LABEL, TEXT_PROMPT, TEXT_PROMPT_VERSION } from "./prompt";
import { parseMealJson, type MealAnalysis } from "./schema";

export class AnalysisFailedError extends Error {}

export type AnalysisMode = "photo" | "text";

export interface AnalyzeOutput {
  result: MealAnalysis;
  mock: boolean;
  attempts: number;
  mode: AnalysisMode;
  promptVersion: string;
}

/** テキスト入力の上限（文字数） */
export const MAX_TEXT_LENGTH = 300;

/** コスト監視用のログ（1 呼び出し 1 行の JSON。写真・テキスト共通。Vercel のログで集計しやすい形） */
function logUsage(entry: {
  mode: AnalysisMode;
  promptVersion: string;
  attempt: number;
  ok: boolean;
  mock: boolean;
  latencyMs: number;
  usage: GeminiUsage | null;
  error?: string;
  image?: { width: number; height: number; bytes: number };
  textLength?: number;
}) {
  console.log(JSON.stringify({ event: "meal_analysis_call", model: MODEL_ID, ...entry, at: new Date().toISOString() }));
}

/** 呼び出し → 厳密パース。パース失敗時は 1 回だけリトライ。API エラー（UpstreamError）はそのまま上へ */
async function runWithRetry(
  call: () => Promise<GeminiCallResult>,
  meta: { mode: AnalysisMode; promptVersion: string; mock: boolean; image?: { width: number; height: number; bytes: number }; textLength?: number },
): Promise<AnalyzeOutput> {
  const MAX_ATTEMPTS = 2;
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    const res = await call();
    const parsed = parseMealJson(res.text);
    logUsage({
      ...meta,
      attempt,
      ok: parsed.ok,
      latencyMs: Date.now() - t0,
      usage: res.usage,
      error: parsed.ok ? undefined : `${parsed.error} (finishReason=${res.finishReason})`,
    });
    if (parsed.ok) return { result: parsed.value, mock: meta.mock, attempts: attempt, mode: meta.mode, promptVersion: meta.promptVersion };
    lastError = parsed.error;
  }
  throw new AnalysisFailedError(lastError);
}

export async function analyzeMealImage(input: Buffer, opts: { apiKey?: string; fileName: string }): Promise<AnalyzeOutput> {
  const img = await preprocessImage(input); // UnsupportedImageError はそのまま上へ
  const mock = !opts.apiKey;
  return runWithRetry(
    () => (mock ? callMock(opts.fileName) : callGemini(opts.apiKey!, photoParts(MEAL_PROMPT, img.jpeg))),
    { mode: "photo", promptVersion: PROMPT_VERSION, mock, image: { width: img.width, height: img.height, bytes: img.jpeg.length } },
  );
}

export async function analyzeMealText(text: string, opts: { apiKey?: string }): Promise<AnalyzeOutput> {
  const mock = !opts.apiKey;
  return runWithRetry(
    () => (mock ? callMockText(text) : callGemini(opts.apiKey!, textParts(TEXT_PROMPT, TEXT_INPUT_LABEL, text))),
    { mode: "text", promptVersion: TEXT_PROMPT_VERSION, mock, textLength: text.length },
  );
}
