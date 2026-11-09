/**
 * 量補正の計算（純粋関数）。
 * - 品目ごとの倍率：半分 ×0.5 ／ 普通 ×1 ／ 大盛り ×1.5
 * - 食べた割合（全品目にかける）：全部 100% ／ 3/4 75% ／ 半分 50% ／ 1/3 33% ／ 1/4 25%
 * 最終値 = AI の推定値 × 品目の倍率 × 食べた割合
 * （旧「全体がハーフサイズ」トグルは割合「半分」で代替するため廃止）
 */
import type { MealAnalysis } from "../meal/schema";

export type PortionMultiplier = 0.5 | 1 | 1.5;
export const PORTION_OPTIONS: { label: string; value: PortionMultiplier }[] = [
  { label: "半分", value: 0.5 },
  { label: "普通", value: 1 },
  { label: "大盛り", value: 1.5 },
];

/** 食べた割合。percent は表示・保存用、ratio は計算用（1/3 は 0.33 ではなく正確に 1/3 で計算） */
export type EatenPercent = 100 | 75 | 50 | 33 | 25;
export const EATEN_OPTIONS: { label: string; percent: EatenPercent; ratio: number }[] = [
  { label: "全部", percent: 100, ratio: 1 },
  { label: "3/4", percent: 75, ratio: 0.75 },
  { label: "半分", percent: 50, ratio: 0.5 },
  { label: "1/3", percent: 33, ratio: 1 / 3 },
  { label: "1/4", percent: 25, ratio: 0.25 },
];
export const ratioOf = (p: EatenPercent) => EATEN_OPTIONS.find((o) => o.percent === p)?.ratio ?? 1;

export interface CorrectedItem {
  name: string;
  amount: string;
  multiplier: PortionMultiplier;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface Totals {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface CorrectedMeal {
  items: CorrectedItem[];
  totals: Totals;
  eatenPercent: EatenPercent;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function applyCorrection(a: MealAnalysis, multipliers: PortionMultiplier[], eatenPercent: EatenPercent): CorrectedMeal {
  const ratio = ratioOf(eatenPercent);
  const items = a.items.map((it, i) => {
    const m = multipliers[i] ?? 1;
    const f = m * ratio;
    return {
      name: it.name,
      amount: it.amount,
      multiplier: m,
      kcal: it.kcal * f,
      protein_g: it.protein_g * f,
      fat_g: it.fat_g * f,
      carbs_g: it.carbs_g * f,
    };
  });
  // 合計は丸める前の値で足してから丸める（表示の端数ズレを抑える）
  const totals = items.reduce(
    (t, x) => ({ kcal: t.kcal + x.kcal, protein_g: t.protein_g + x.protein_g, fat_g: t.fat_g + x.fat_g, carbs_g: t.carbs_g + x.carbs_g }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );
  return {
    items: items.map((x) => ({ ...x, kcal: Math.round(x.kcal), protein_g: r1(x.protein_g), fat_g: r1(x.fat_g), carbs_g: r1(x.carbs_g) })),
    totals: { kcal: Math.round(totals.kcal), protein_g: r1(totals.protein_g), fat_g: r1(totals.fat_g), carbs_g: r1(totals.carbs_g) },
    eatenPercent,
  };
}
