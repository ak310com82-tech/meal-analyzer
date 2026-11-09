/**
 * 食事履歴（localStorage）。
 * プライバシー配慮：写真そのもの・サムネイルは保存しない。保存するのは数値とテキストのみ。
 */
import type { Confidence } from "../meal/schema";
import type { CorrectedItem, EatenPercent, Totals } from "./correction";
import { localDateKey, readJson, writeJson } from "./storage";

const KEY = "meal-analyzer:history:v1";

export interface HistoryEntry {
  id: string;
  createdAt: string; // ISO
  promptVersion: string;
  mock: boolean;
  confidence: Confidence;
  note: string;
  /** 食べた割合（%）。第2弾〜。古い記録には無い（＝100%扱い） */
  eatenPercent?: EatenPercent;
  /** 旧「全体がハーフサイズ」トグル（廃止）。古い記録の表示用に残す */
  halfMode?: boolean;
  /** 鍋・大皿を全量で推定した結果か（v3〜。古い記録には無い） */
  isShared?: boolean;
  /** 補正後の品目（倍率込み） */
  items: CorrectedItem[];
  /** 補正後の合計 */
  totals: Totals;
  /** AI が返した元の合計 kcal（補正前） */
  originalTotalKcal: number;
}

export interface DayGroup {
  date: string; // YYYY-MM-DD（端末のローカル日付）
  entries: HistoryEntry[];
  totals: Totals;
}

export function loadHistory(): HistoryEntry[] {
  const list = readJson<HistoryEntry[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "createdAt">, now = new Date()): { ok: boolean; entry: HistoryEntry } {
  const e: HistoryEntry = { ...entry, id: newId(), createdAt: now.toISOString() };
  const ok = writeJson(KEY, [e, ...loadHistory()]);
  return { ok, entry: e };
}

export function deleteHistory(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  writeJson(KEY, next);
  return next;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 日別にグルーピング（新しい日が先、日内も新しい順）し、1日の合計を出す */
export function groupByDay(list: HistoryEntry[]): DayGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const k = localDateKey(new Date(e.createdAt));
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => {
      const t = entries.reduce(
        (s, e) => ({
          kcal: s.kcal + e.totals.kcal,
          protein_g: s.protein_g + e.totals.protein_g,
          fat_g: s.fat_g + e.totals.fat_g,
          carbs_g: s.carbs_g + e.totals.carbs_g,
        }),
        { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      );
      return { date, entries, totals: { kcal: Math.round(t.kcal), protein_g: r1(t.protein_g), fat_g: r1(t.fat_g), carbs_g: r1(t.carbs_g) } };
    });
}
