/** 解析結果の型と厳密パース（サーバー・クライアント共通。Next.js に依存しない） */

export interface MealItem {
  name: string;
  amount: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export type Confidence = "high" | "medium" | "low";

export interface MealAnalysis {
  items: MealItem[];
  total_kcal: number;
  half_total_kcal: number;
  /** 鍋・大皿など分け合う料理を全量で推定したか（v3〜） */
  is_shared: boolean;
  confidence: Confidence;
  note: string;
}

export type ParseResult = { ok: true; value: MealAnalysis } | { ok: false; error: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * モデル出力を厳密にパースする。コードブロック除去などの「救済」はしない。
 * JSON 構文エラー・スキーマ違反はどちらも失敗として扱う（呼び出し側でリトライ／502）。
 */
export function parseMealJson(text: string): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, error: "schema: top-level is not an object" };
  }
  const o = obj as Record<string, unknown>;
  const problems: string[] = [];

  if (!Array.isArray(o.items)) problems.push("items");
  else
    o.items.forEach((it, i) => {
      const x = it as Record<string, unknown> | null;
      if (!x || typeof x !== "object") return void problems.push(`items[${i}]`);
      if (!isStr(x.name)) problems.push(`items[${i}].name`);
      if (!isStr(x.amount)) problems.push(`items[${i}].amount`);
      for (const k of ["kcal", "protein_g", "fat_g", "carbs_g"]) if (!isNum(x[k])) problems.push(`items[${i}].${k}`);
    });
  if (!isNum(o.total_kcal)) problems.push("total_kcal");
  if (!isNum(o.half_total_kcal)) problems.push("half_total_kcal");
  if (typeof o.is_shared !== "boolean") problems.push("is_shared");
  if (o.confidence !== "high" && o.confidence !== "medium" && o.confidence !== "low") problems.push("confidence");
  if (!isStr(o.note)) problems.push("note");

  if (problems.length) return { ok: false, error: `schema: ${problems.slice(0, 8).join(", ")}` };

  // 余計なキーは落として、スキーマどおりの形だけ返す
  return {
    ok: true,
    value: {
      items: (o.items as MealItem[]).map((x) => ({
        name: x.name,
        amount: x.amount,
        kcal: x.kcal,
        protein_g: x.protein_g,
        fat_g: x.fat_g,
        carbs_g: x.carbs_g,
      })),
      total_kcal: o.total_kcal as number,
      half_total_kcal: o.half_total_kcal as number,
      is_shared: o.is_shared as boolean,
      confidence: o.confidence as Confidence,
      note: o.note as string,
    },
  };
}
