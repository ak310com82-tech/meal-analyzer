/**
 * POST /api/meal-analysis
 *   入力：multipart/form-data、フィールド名 image（JPEG / PNG / WebP / HEIC）
 *   出力：解析結果 JSON（lib/meal/schema.ts の MealAnalysis そのまま）
 *         モック応答のときはレスポンスヘッダ x-meal-mock: 1
 *   エラー：{ error: string, message: string } と適切なステータス
 *
 * APIキーはサーバーの環境変数 GEMINI_API_KEY のみ。クライアントには一切返さない。
 */
import { analyzeMealImage, AnalysisFailedError } from "../../../lib/meal/analyze";
import { UpstreamError } from "../../../lib/meal/gemini";
import { UnsupportedImageError } from "../../../lib/meal/preprocess";

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
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, "bad_request", "画像を受け取れませんでした。もう一度お試しください。");
  }
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

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const out = await analyzeMealImage(buf, { apiKey: process.env.GEMINI_API_KEY?.trim() || undefined, fileName });
    return Response.json(out.result, {
      status: 200,
      headers: { "x-meal-mock": out.mock ? "1" : "0", "cache-control": "no-store" },
    });
  } catch (e) {
    if (e instanceof UnsupportedImageError) {
      const heic = isHeicByName || type.includes("hei");
      console.warn(JSON.stringify({ event: "meal_analysis_unsupported_image", fileName, type, detail: e.message }));
      return err(
        415,
        "unreadable_image",
        heic
          ? "HEIC形式の画像を読み込めませんでした。カメラの設定で「互換性優先（JPEG）」にするか、スクリーンショットでお試しください。"
          : "画像を読み込めませんでした。別の写真でお試しください。",
      );
    }
    if (e instanceof AnalysisFailedError) {
      console.error(JSON.stringify({ event: "meal_analysis_parse_failed", detail: e.message }));
      return err(502, "parse_failed", "解析結果を読み取れませんでした。少し時間をおいてもう一度お試しください。");
    }
    if (e instanceof UpstreamError) {
      console.error(JSON.stringify({ event: "meal_analysis_upstream_error", status: e.status, detail: e.message }));
      if (e.status === 429) return err(503, "busy", "混み合っています。少し時間をおいてもう一度お試しください。");
      return err(502, "upstream_error", "解析サービスに接続できませんでした。少し時間をおいてもう一度お試しください。");
    }
    console.error(JSON.stringify({ event: "meal_analysis_unknown_error", detail: String(e) }));
    return err(500, "internal_error", "予期しないエラーが起きました。もう一度お試しください。");
  }
}
