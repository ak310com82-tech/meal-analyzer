/**
 * 解析 API（POST /api/meal-analysis）の呼び出し。写真・テキスト共通。
 * 回数の消費はここではしない（呼び出し側で「食事の結果が返ったときだけ」消費する）。
 */
import type { MealAnalysis } from "../meal/schema";

export type AnalysisResponse =
  | { ok: true; result: MealAnalysis; mock: boolean; promptVersion: string }
  | { ok: false; message: string };

async function post(fd: FormData): Promise<AnalysisResponse> {
  try {
    const res = await fetch("/api/meal-analysis", { method: "POST", body: fd });
    const body = (await res.json().catch(() => null)) as (MealAnalysis & { message?: string }) | null;
    if (!res.ok || !body) {
      const fallback =
        res.status === 413 ? "画像が大きすぎます。別の写真でお試しください。" : "解析できませんでした。少し時間をおいてもう一度お試しください。";
      return { ok: false, message: body?.message || fallback };
    }
    return {
      ok: true,
      result: body,
      mock: res.headers.get("x-meal-mock") === "1",
      promptVersion: res.headers.get("x-meal-prompt-version") ?? "",
    };
  } catch {
    return { ok: false, message: "通信できませんでした。電波の良いところでもう一度お試しください。" };
  }
}

export function analyzePhoto(blob: Blob, fileName: string) {
  const fd = new FormData();
  fd.append("image", blob, fileName);
  return post(fd);
}

export function analyzeText(text: string) {
  const fd = new FormData();
  fd.append("text", text);
  return post(fd);
}
