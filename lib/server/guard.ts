/**
 * 公開前の軽い不正対策（POST /api/meal-analysis 用）。
 *   1. 呼び出し元チェック：Origin（なければ Referer）のホストが自サイトのときだけ通す
 *   2. IP ごとの回数制限：同じ IP から 1 時間に 20 回まで（写真・テキスト合算）
 *
 * どちらも「叩かれ放題」を防ぐための最小限の対策。Origin や IP は curl 等で偽装できるので、
 * 本格的な防御（ログイン・サーバー側の回数管理・WAF）の代わりにはならない。
 */

/** 本番ドメイン */
export const PRODUCTION_HOST = "meal-analyzer-kohl.vercel.app";

/**
 * Vercel のプレビュードメイン（このプロジェクトのもの）。
 * 例：meal-analyzer-abc123-team.vercel.app ／ meal-analyzer-git-feature-team.vercel.app
 */
const PREVIEW_HOST = /^meal-analyzer-[a-z0-9-]+\.vercel\.app$/;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function hostOf(url: string | null): string | null {
  if (!url || url === "null") return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 許可するホストか。env は差し替えテスト用（既定は process.env） */
export function isAllowedHost(host: string, env: Record<string, string | undefined> = process.env): boolean {
  if (host === PRODUCTION_HOST || PREVIEW_HOST.test(host)) return true;
  // Vercel が自動で入れるデプロイ先のホスト（独自ドメインを付けたときもこれで通る）
  for (const k of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    if (env[k] && env[k]!.toLowerCase() === host) return true;
  }
  // 開発時（next dev / ローカル実行）だけ localhost を許可
  if (env.NODE_ENV !== "production" && LOCAL_HOST.test(host)) return true;
  return false;
}

/** 呼び出し元チェック。Origin がなければ Referer を見る。どちらもなければ不許可 */
export function checkOrigin(req: Request, env?: Record<string, string | undefined>): { ok: true } | { ok: false; reason: string } {
  const origin = req.headers.get("origin");
  const host = hostOf(origin) ?? hostOf(req.headers.get("referer"));
  if (!host) return { ok: false, reason: origin === "null" ? "origin_null" : "no_origin" };
  return isAllowedHost(host, env) ? { ok: true } : { ok: false, reason: `host_not_allowed:${host}` };
}

// ---------------------------------------------------------------------------
// IP ごとの回数制限
// ---------------------------------------------------------------------------

export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * インメモリの Map（IP → 直近1時間の呼び出し時刻）。
 * サーバーレスではインスタンスごとに別々の Map になり、コールドスタートで消える。
 * 「インスタンス単位のベストエフォート」で十分という前提の簡易実装。
 * 本格的に絞るなら Upstash Redis / Vercel KV などの共有ストアに移すこと。
 */
const hits = new Map<string, number[]>();
const MAX_TRACKED_IPS = 10_000;

export function clientIp(req: Request): string {
  // Vercel では x-forwarded-for の先頭がクライアントの IP
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip || "unknown";
}

/** 1 回分を数えて、上限を超えていれば ok: false と再試行までの秒数を返す */
export function takeRateLimit(ip: string, now = Date.now()): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  const since = now - RATE_WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > since);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + RATE_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > MAX_TRACKED_IPS) prune(now);
  return { ok: true, remaining: RATE_LIMIT - recent.length };
}

/** 古い記録を掃除（メモリが増え続けないように） */
function prune(now: number) {
  const since = now - RATE_WINDOW_MS;
  for (const [ip, ts] of hits) {
    const recent = ts.filter((t) => t > since);
    if (recent.length) hits.set(ip, recent);
    else hits.delete(ip);
  }
}

/** テスト用：記録を消す */
export function resetRateLimit() {
  hits.clear();
}
