/**
 * POST /api/billing/validate  { code } → { active: boolean, period_end: string | null }
 *   - KV で照合（入力コードを SHA-256 にして引く）。status が active かつ period_end が未来なら有効
 *   - 総当たり対策：IP ごとに 1 時間 30 回まで（lib/server/guard.ts の仕組みを流用）。超えたら 429
 *   - 呼び出し元チェック（Origin）も解析 API と同じものをかける
 *   - レスポンスにコード以外の顧客情報（Stripe の顧客 ID 等）は含めない
 */
import { validateCode } from "../../../../lib/server/billing";
import { checkOrigin, clientIp, createRateLimiter } from "../../../../lib/server/guard";
import { kvConfig } from "../../../../lib/server/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALIDATE_LIMIT = 30;
const limiter = createRateLimiter(VALIDATE_LIMIT, 60 * 60 * 1000);

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export async function POST(req: Request): Promise<Response> {
  // KV 未設定（課金未運用）のときは、このエンドポイント自体が無いものとして 404 を返す
  if (!kvConfig()) return json(404, { error: "not_found" });

  if (!checkOrigin(req).ok) return json(403, { error: "forbidden", message: "このアプリの画面から操作してください。" });

  const limit = limiter.take(clientIp(req));
  if (!limit.ok) {
    return json(429, { error: "rate_limited", message: "確認の回数が多すぎます。1時間ほど空けてからお試しください。" }, { "retry-after": String(limit.retryAfterSec) });
  }

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.slice(0, 64) : "";
  } catch {
    return json(400, { error: "bad_request", message: "コードを入力してください。" });
  }
  if (!code.trim()) return json(400, { error: "bad_request", message: "コードを入力してください。" });

  try {
    const r = await validateCode(code);
    if (r === "unavailable") return json(503, { error: "unavailable", message: "いまはコードを確認できません。" });
    return json(200, { active: r.active, period_end: r.period_end });
  } catch (e) {
    console.error(JSON.stringify({ event: "billing_validate_failed", detail: e instanceof Error ? e.message : String(e) }));
    return json(503, { error: "unavailable", message: "いまはコードを確認できません。少し時間をおいてお試しください。" });
  }
}
