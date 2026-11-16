/**
 * 日々の体重記録（localStorage、端末内保存のみ・サーバー送信なし）。
 * プロフィールの体重（BMR計算用）とは独立した記録で、互いに干渉しない。
 * キーは端末のローカル日付 YYYY-MM-DD。同日は1件で上書き。
 */
import { readJson, writeJson } from "./storage";

const KEY = "meal-analyzer:weight:v1";

/** 体重として受け付ける範囲（プロフィールの体重と同じ 25〜250kg） */
export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 250;

export interface WeightEntry {
  date: string; // YYYY-MM-DD（端末のローカル日付）
  kg: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function isValidWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG;
}

/** 日付の昇順で返す。不正な要素は落とす */
export function loadWeights(): WeightEntry[] {
  const list = readJson<WeightEntry[]>(KEY, []);
  if (!Array.isArray(list)) return [];
  const byDate = new Map<string, number>();
  for (const e of list) {
    if (e && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && isValidWeight(e.kg)) {
      byDate.set(e.date, r1(e.kg));
    }
  }
  return [...byDate.entries()]
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** その日の体重を保存（同日は上書き）。保存後の全件を返す。保存できなければ null */
export function saveWeight(date: string, kg: number): WeightEntry[] | null {
  if (!isValidWeight(kg)) return null;
  const next = [...loadWeights().filter((e) => e.date !== date), { date, kg: r1(kg) }].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return writeJson(KEY, next) ? next : null;
}

/** その日の記録を削除。削除後の全件を返す */
export function removeWeight(date: string): WeightEntry[] {
  const next = loadWeights().filter((e) => e.date !== date);
  writeJson(KEY, next);
  return next;
}

export interface WeightSummary {
  latest: WeightEntry;
  /** 直前の記録（無ければ null） */
  prev: WeightEntry | null;
  /** 前回からの増減 kg（前回が無ければ null） */
  diff: number | null;
}

/** 最新の記録と前回比。記録が無ければ null */
export function weightSummary(list: WeightEntry[]): WeightSummary | null {
  if (list.length === 0) return null;
  const latest = list[list.length - 1];
  const prev = list.length >= 2 ? list[list.length - 2] : null;
  return { latest, prev, diff: prev ? r1(latest.kg - prev.kg) : null };
}
