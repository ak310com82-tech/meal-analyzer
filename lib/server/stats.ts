/**
 * 解析回数の日次カウンタ（Vercel KV ＝ Upstash Redis の REST API）。
 *
 * - 環境変数 KV_REST_API_URL / KV_REST_API_TOKEN があるときだけ動く（無ければ何もしない）。
 *   Upstash を直接つないだ場合の UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN でも動く。
 * - キー：stats:YYYY-MM-DD（日付は JST）。ハッシュのフィールド：
 *     photo_ok / photo_nofood / photo_err / text_ok / text_nofood / text_err
 * - 保存するのは日次の合計数だけ。IP・User-Agent・リクエスト内容など個別の情報は保存しない。
 * - 記録の失敗は握りつぶす（解析レスポンスには一切影響させない）。KV が遅いときは短いタイムアウトで打ち切る。
 *
 * 実装メモ：@upstash/redis と同じ Upstash REST API（/pipeline）を fetch で直接呼んでいる。
 * 依存を増やさずにタイムアウトを AbortSignal で確実にかけられ、KV なしの環境でも何も読み込まないため。
 */

export type StatMode = "photo" | "text";
export type StatOutcome = "ok" | "nofood" | "err";
export const STAT_FIELDS = ["photo_ok", "photo_nofood", "photo_err", "text_ok", "text_nofood", "text_err"] as const;
export type StatField = (typeof STAT_FIELDS)[number];
export type DayStats = Record<StatField, number>;

/** 記録の打ち切り時間（ミリ秒）。解析レスポンスをこれ以上遅らせない */
export const RECORD_TIMEOUT_MS = 500;
/** 読み出し（/stats ページ）のタイムアウト */
const READ_TIMEOUT_MS = 3000;
/** 日次キーの保存期間。古い日は自動で消える */
const KEY_TTL_SEC = 400 * 24 * 60 * 60;

import { kvConfig, kvPipeline as pipeline, type Env } from "./kv";
export { kvConfig };

/** JST の日付 YYYY-MM-DD（サーバーのタイムゾーンに依存しない） */
export function jstDate(at: Date | number = Date.now()): string {
  const t = typeof at === "number" ? at : at.getTime();
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const statsKey = (date: string) => `stats:${date}`;

/**
 * 1 回分を数える。KV 未設定なら何もしない。失敗しても例外を投げない（ログだけ残す）。
 * 呼び出し側は await してよい（最長 RECORD_TIMEOUT_MS で必ず戻る）。
 */
export async function recordAnalysis(mode: StatMode, outcome: StatOutcome, env: Env = process.env): Promise<void> {
  const cfg = kvConfig(env);
  if (!cfg) return;
  try {
    const key = statsKey(jstDate());
    await pipeline(
      cfg,
      [
        ["HINCRBY", key, `${mode}_${outcome}`, 1],
        ["EXPIRE", key, KEY_TTL_SEC],
      ],
      RECORD_TIMEOUT_MS,
    );
  } catch (e) {
    // 集計の失敗は解析に影響させない
    console.warn(JSON.stringify({ event: "stats_record_failed", detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }));
  }
}

const emptyDay = (): DayStats => ({ photo_ok: 0, photo_nofood: 0, photo_err: 0, text_ok: 0, text_nofood: 0, text_err: 0 });

/** HGETALL の返り値（[field, value, field, value, ...] または object）を DayStats に */
function toDayStats(raw: unknown): DayStats {
  const d = emptyDay();
  const set = (k: string, v: unknown) => {
    if ((STAT_FIELDS as readonly string[]).includes(k)) d[k as StatField] = Number(v) || 0;
  };
  if (Array.isArray(raw)) for (let i = 0; i + 1 < raw.length; i += 2) set(String(raw[i]), raw[i + 1]);
  else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) set(k, v);
  return d;
}

/** 今日（JST）から n 日前までの日付（新しい順） */
export function lastDates(n: number, now = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => jstDate(now - i * 24 * 60 * 60 * 1000));
}

export type StatsResult =
  | { status: "ok"; days: { date: string; stats: DayStats }[] }
  | { status: "not_configured" }
  | { status: "error"; message: string };

/** 直近 days 日分（＋今月分が漏れないように今月 1 日まで）を読む */
export async function fetchStats(days = 30, env: Env = process.env, now = Date.now()): Promise<StatsResult> {
  const cfg = kvConfig(env);
  if (!cfg) return { status: "not_configured" };
  const dayOfMonth = Number(jstDate(now).slice(8, 10));
  const dates = lastDates(Math.max(days, dayOfMonth), now);
  try {
    const results = await pipeline(cfg, dates.map((d) => ["HGETALL", statsKey(d)]), READ_TIMEOUT_MS);
    return { status: "ok", days: dates.map((date, i) => ({ date, stats: toDayStats(results[i]) })) };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 表示用：1 日分の集計列 */
export function summarize(s: DayStats) {
  const nofood = s.photo_nofood + s.text_nofood;
  const err = s.photo_err + s.text_err;
  return { photoOk: s.photo_ok, textOk: s.text_ok, nofood, err, total: s.photo_ok + s.text_ok + nofood + err };
}
