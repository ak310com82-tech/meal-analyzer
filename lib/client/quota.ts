/**
 * 解析回数の月間上限：無料は 5 回、プレミアム（解除コードが有効）は 90 回。
 *
 * ⚠️ MVP の簡易実装：localStorage で当月の回数を数えているだけなので、
 *    ブラウザのデータ削除や別端末・シークレットウィンドウで簡単にリセットできる。
 *    本格運用（有料化）ではアカウントに紐づけてサーバー側（DB）で管理すること。
 *
 * 数え方：解析が成功して食事の結果が返ってきた回だけ数える。
 *         「食事が写っていない」結果（items が空）・API エラー・JSON 崩れの回は数えない。
 */
import { isPremiumActive } from "./premium";
import { localMonthKey, readJson, writeJson } from "./storage";

export const FREE_MONTHLY_LIMIT = 5;
export const PREMIUM_MONTHLY_LIMIT = 90;
const KEY = "meal-analyzer:quota:v1";

interface QuotaState {
  month: string;
  count: number;
}

function load(now: Date): QuotaState {
  const month = localMonthKey(now);
  const s = readJson<QuotaState | null>(KEY, null);
  return s && s.month === month && Number.isFinite(s.count) ? s : { month, count: 0 }; // 月が変わったら 0 から
}

/** 上限はプレミアム状態で切り替える（数え方は無料・プレミアム共通、同じカウンタ） */
export function getQuota(now = new Date()) {
  const s = load(now);
  const premium = isPremiumActive(now.getTime());
  const limit = premium ? PREMIUM_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
  return { used: s.count, limit, remaining: Math.max(0, limit - s.count), exhausted: s.count >= limit, premium };
}

export function consumeQuota(now = new Date()) {
  const s = load(now);
  writeJson(KEY, { month: s.month, count: s.count + 1 });
  return getQuota(now);
}
