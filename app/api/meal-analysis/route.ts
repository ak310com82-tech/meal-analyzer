/**
 * POST /api/meal-analysis
 *   入力：multipart/form-data
 *     - 写真モード：フィールド image（JPEG / PNG / WebP / HEIC）
 *     - テキストモード：フィールド text（食事内容の文章、300 文字まで）。image より優先しない（どちらか一方を送る）
 *   出力：解析結果 JSON（lib/meal/schema.ts の MealAnalysis そのまま）
 *         モック応答のときはレスポンスヘッダ x-meal-mock: 1
 *   エラー：{ error: string, message: string } と適切なステータス
 *
 * APIキーはサーバーの環境変数 GEMINI_API_KEY のみ。クライアントには一切返さない。
 *
 * 不正対策（lib/server/guard.ts）：
 *   - 呼び出し元チェック：Origin（なければ Referer）が自サイトでなければ 403
 *   - IP ごとの回数制限：1 時間に 20 回まで（写真・テキスト合算）。超えたら 429
 */
import { analyzeMealImage, analyzeMealText, AnalysisFailedError, MAX_TEXT_LENGTH, type AnalyzeOutput } from "../../../lib/meal/analyze";
import { UpstreamError } from "../../../lib/meal/gemini";
import { UnsupportedImageError } from "../../../lib/meal/preprocess";
import { checkOrigin, clientIp, takeRateLimit } from "../../../lib/server/guard";

export const runtime = "nodejs"; // sharp を使うため
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Vercel のリクエスト本文上限は 4.5MB。クライアントで縮小してから送る前提で、余裕を見て 4MB で弾く */
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function err(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  // ---- 1. 呼び出し元チェック（ブラウザの fetch は Origin を自動で送る）----
  const origin = checkOrigin(req);
  if (!origin.ok) {
    console.warn(JSON.stringify({ event: "meal_analysis_forbidden", reason: origin.reason }));
    return err(403, "forbidden", "このアプリの画面から操作してください。");
  }

  // ---- 2. IP ごとの回数制限（写真・テキスト合算）----
  const ip = clientIp(req);
  const limit = takeRateLimit(ip);
  if (!limit.ok) {
    console.warn(JSON.stringify({ event: "meal_analysis_rate_limited", retryAfterSec: limit.retryAfterSec }));
    return Response.json(
      { error: "rate_limited", message: "短い時間に解析が続いたため、少し止めています。少し時間を空けてからお試しください。" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec), "cache-control": "no-store" } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, "bad_request", "画像を受け取れませんでした。もう一度お試しください。");
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;

  // ---- テキストモード ----
  const textField = form.get("text");
  if (typeof textField === "string") {
    const text = textField.trim();
    if (!text) return err(400, "no_text", "食べたものを入力してください。");
    if ([...text].length > MAX_TEXT_LENGTH) return err(400, "text_too_long", `食べたものは${MAX_TEXT_LENGTH}文字以内で入力してください。`);
    return respond(() => analyzeMealText(text, { apiKey }), { kind: "text" });
  }

  // ---- 写真モード ----
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return err(400, "no_image", "画像が選択されていません。");
  }
  const fileName = typeof (file as File).name === "string" ? (file as File).name : "image";
  const type = (file.type || "").toLowerCase();
  const isHeicByName = /\.(heic|heif)$/i.test(fileName);
  if (type && !ACCEPTED.has(type) && !isHeicByName) {
    return err(415, "unsupported_type", "対応していない形式です。JPEG・PNG・WebP・HEIC の写真を選んでください。");
  }
  if (file.size > MAX_BYTES) {
    return err(413, "too_large", "画像が大きすぎます（4MBまで）。もう一度選び直してください。");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  return respond(() => analyzeMealImage(buf, { apiKey, fileName }), { kind: "photo", isHeic: isHeicByName || type.includes("hei"), fileName, type });
}

/** 解析を実行してレスポンスに変換する（写真・テキスト共通のエラー処理） */
async function respond(
  run: () => Promise<AnalyzeOutput>,
  ctx: { kind: "photo"; isHeic: boolean; fileName: string; type: string } | { kind: "text" },
): Promise<Response> {
  try {
    const out = await run();
    return Response.json(out.result, {
      status: 200,
      headers: { "x-meal-mock": out.mock ? "1" : "0", "x-meal-prompt-version": out.promptVersion, "cache-control": "no-store" },
    });
  } catch (e) {
    if (e instanceof UnsupportedImageError && ctx.kind === "photo") {
      console.warn(JSON.stringify({ event: "meal_analysis_unsupported_image", fileName: ctx.fileName, type: ctx.type, detail: e.message }));
      return err(
        415,
        "unreadable_image",
        ctx.isHeic
          ? "HEIC形式の画像を読み込めませんでした。カメラの設定で「互換性優先（JPEG）」にするか、スクリーンショットでお試しください。"
          : "画像を読み込めませんでした。別の写真でお試しください。",
      );
    }
    if (e instanceof AnalysisFailedError) {
      console.error(JSON.stringify({ event: "meal_analysis_parse_failed", mode: ctx.kind, detail: e.message }));
      return err(502, "parse_failed", "解析結果を読み取れませんでした。少し時間をおいてもう一度お試しください。");
    }
    if (e instanceof UpstreamError) {
      console.error(JSON.stringify({ event: "meal_analysis_upstream_error", mode: ctx.kind, status: e.status, detail: e.message }));
      if (e.status === 429) return err(503, "busy", "混み合っています。少し時間をおいてもう一度お試しください。");
      return err(502, "upstream_error", "解析サービスに接続できませんでした。少し時間をおいてもう一度お試しください。");
    }
    console.error(JSON.stringify({ event: "meal_analysis_unknown_error", mode: ctx.kind, detail: String(e) }));
    return err(500, "internal_error", "予期しないエラーが起きました。もう一度お試しください。");
  }
}
