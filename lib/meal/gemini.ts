/**
 * Gemini API 呼び出し（REST / generateContent）。
 * - モデルは gemini-3.5-flash-lite 固定
 * - generationConfig に thinkingConfig を入れない（このモデルは thinkingBudget 指定で HTTP 400 になる。
 *   既定で思考は最小レベル）
 * - temperature 0、responseMimeType "application/json"
 */
export const MODEL_ID = "gemini-3.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

export interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  imageTokens: number | null;
}

export interface GeminiCallResult {
  text: string;
  usage: GeminiUsage | null;
  finishReason: string | null;
}

export class UpstreamError extends Error {
  constructor(message: string, public status: number | null) {
    super(message);
  }
}

interface RawResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    promptTokensDetails?: { modality: string; tokenCount: number }[];
  };
}

export async function callGemini(apiKey: string, prompt: string, jpeg: Buffer, timeoutMs = 30_000): Promise<GeminiCallResult> {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: jpeg.toString("base64") } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      // thinkingConfig は入れない（上記参照）
    },
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new UpstreamError(`network: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  const raw = await res.text();
  if (!res.ok) throw new UpstreamError(`HTTP ${res.status}: ${raw.slice(0, 300)}`, res.status);

  let json: RawResponse;
  try {
    json = JSON.parse(raw) as RawResponse;
  } catch {
    throw new UpstreamError(`non-JSON API response: ${raw.slice(0, 200)}`, res.status);
  }

  const u = json.usageMetadata;
  const cand = json.candidates?.[0];
  return {
    text: (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join(""),
    finishReason: cand?.finishReason ?? null,
    usage: u
      ? {
          inputTokens: u.promptTokenCount ?? 0,
          outputTokens: u.candidatesTokenCount ?? 0,
          thoughtsTokens: u.thoughtsTokenCount ?? 0,
          imageTokens: u.promptTokensDetails?.find((d) => d.modality === "IMAGE")?.tokenCount ?? null,
        }
      : null,
  };
}
