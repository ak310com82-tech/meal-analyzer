/**
 * 飲み会モード：お酒のカウンター（純粋関数）。
 * 1 杯あたりのカロリーは目安として固定。お酒は kcal のみで数え、PFC には加算しない。
 */
import type { CorrectedItem } from "./correction";
import { readJson, writeJson } from "./storage";

export const DRINKS = [
  { id: "beer", name: "ビール（中ジョッキ）", kcalPerCup: 150 },
  { id: "highball", name: "ハイボール", kcalPerCup: 100 },
  { id: "chuhai", name: "酎ハイ", kcalPerCup: 150 },
  { id: "cocktail", name: "カクテル", kcalPerCup: 180 },
] as const;

export type DrinkId = (typeof DRINKS)[number]["id"];
export type DrinkCounts = Record<DrinkId, number>;

export const MAX_CUPS = 20;
export const emptyCounts = (): DrinkCounts => ({ beer: 0, highball: 0, chuhai: 0, cocktail: 0 });
export const clampCups = (n: number) => Math.min(MAX_CUPS, Math.max(0, Math.round(n)));

export function drinksTotalKcal(c: DrinkCounts): number {
  return DRINKS.reduce((a, d) => a + d.kcalPerCup * (c[d.id] ?? 0), 0);
}

/** 杯数が 1 以上のお酒を、履歴の品目（PFC は 0）に変換する */
export function drinkItems(c: DrinkCounts): CorrectedItem[] {
  return DRINKS.filter((d) => (c[d.id] ?? 0) > 0).map((d) => ({
    name: d.name,
    amount: `${c[d.id]}杯（${d.kcalPerCup}kcal/杯の目安）`,
    multiplier: 1,
    kcal: d.kcalPerCup * c[d.id],
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  }));
}

/**
 * 飲み会の途中経過（杯数と「食べたもの」）を端末に一時保存する。
 * 飲み会は数時間かけて数えるので、タブの切り替えや再読み込みで消えないようにする。記録したら消す。
 */
const DRAFT_KEY = "meal-analyzer:party-draft:v1";

export interface PartyDraft {
  counts: DrinkCounts;
  food: string;
}

export function loadPartyDraft(): PartyDraft {
  const d = readJson<Partial<PartyDraft> | null>(DRAFT_KEY, null);
  const counts = emptyCounts();
  for (const k of Object.keys(counts) as DrinkId[]) counts[k] = clampCups(Number(d?.counts?.[k] ?? 0) || 0);
  return { counts, food: typeof d?.food === "string" ? d.food : "" };
}

export function savePartyDraft(d: PartyDraft): void {
  const empty = drinksTotalKcal(d.counts) === 0 && !d.food;
  if (empty) {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 保存できない環境では何もしない */
    }
  } else writeJson(DRAFT_KEY, d);
}
