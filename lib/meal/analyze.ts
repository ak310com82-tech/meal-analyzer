/**
 * 解析エンジン本体：前処理 → Gemini（またはモック）→ 厳密パース（失敗時 1 回だけリトライ）。
 * Next.js に依存しないので、そだてるダイエット本体へはこの lib/meal ごと移植できる。
 */
import { callGemini, MODEL_ID, type GeminiCallResult, type GeminiUsage } from "./gemini";
import { callMock } from "./mock";
import { preprocessImage } from "./preprocess";
import { MEAL_PROMPT, PROMPT_VERSION } from "./prompt";
import { parseMealJson, type MealAnalysis } from "./schema";

export class AnalysisFailedError extends Error {}

export interface AnalyzeOutput {
  result: MealAnalysis;
  mock: boolean;
  attempts: number;
}

/** コスト監視用のログ（1 呼び出し 1 行の JSON。Vercel のログで集計しやすい形） */
function logUsage(entry: {
  attempt: number;
  ok: boolean;
  mock: boolean;
  latencyMs: number;
  usage: GeminiUsage | null;
  error?: string;
  image: { width: number; height: number; bytes: number };
}) {
  console.log(
    JSON.stringify({
      event: "meal_analysis_call",
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      ...entry,
      at: new Date().toISOString(),
    }),
  );
}

export async function analyzeMealImage(input: Buffer, opts: { apiKey?: string; fileName: string }): Promise<AnalyzeOutput> {
  const img = await preprocessImage(input); // UnsupportedImageError はそのまま上へ
  const mock = !opts.apiKey;
  const MAX_ATTEMPTS = 2; // パース失敗時に 1 回だけリトライ
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    // API エラー（UpstreamError）はリトライせずに上へ投げる（ルート側でステータスに変換）
    const res: GeminiCallResult = mock
      ? await callMock(opts.fileName)
      : await callGemini(opts.apiKey!, MEAL_PROMPT, img.jpeg);
    const parsed = parseMealJson(res.text);
    logUsage({
      attempt,
      ok: parsed.ok,
      mock,
      latencyMs: Date.now() - t0,
      usage: res.usage,
      error: parsed.ok ? undefined : `${parsed.error} (finishReason=${res.finishReason})`,
      image: { width: img.width, height: img.height, bytes: img.jpeg.length },
    });
    if (parsed.ok) return { result: parsed.value, mock, attempts: attempt };
    lastError = parsed.error;
  }
  throw new AnalysisFailedError(lastError);
}
