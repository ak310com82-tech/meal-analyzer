/**
 * POST /api/stripe/webhook  … Stripe からの通知（ブラウザからは呼ばない）
 *   - 署名検証を必ず行う（raw body で検証）。署名なし・不一致は 400
 *   - checkout.session.completed / invoice.paid / customer.subscription.deleted / customer.subscription.updated を処理
 *   - 処理は冪等（再送・重複に耐える）。KV の書き込みに失敗したら 500 を返し、Stripe の再送に任せる
 *   - Stripe・KV の環境変数が無ければ 500（課金機能は無効。Stripe 側は再送する）
 *
 * Stripe のサーバーから届くため、Origin チェック（lib/server/guard.ts）は対象外。代わりに署名で守る。
 */
import { handleStripeEvent } from "../../../../lib/server/billing";
import { kvConfig } from "../../../../lib/server/kv";
import { fetchSubscriptionPeriodEnd, stripeConfigured, verifyWebhook } from "../../../../lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  const cfg = kvConfig();
  if (!stripeConfigured() || !cfg) return json(500, { error: "billing_disabled" });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json(400, { error: "missing_signature" });

  const raw = await req.text(); // 署名検証は raw body で行う（JSON.parse してから検証しない）
  let event;
  try {
    event = verifyWebhook(raw, signature);
  } catch (e) {
    console.warn(JSON.stringify({ event: "stripe_webhook_bad_signature", detail: e instanceof Error ? e.message : String(e) }));
    return json(400, { error: "invalid_signature" });
  }

  try {
    const r = await handleStripeEvent(event, { cfg, fetchSubscriptionPeriodEnd });
    console.log(JSON.stringify({ event: "stripe_webhook", type: event.type, id: event.id, ...r }));
    return json(200, { received: true });
  } catch (e) {
    console.error(JSON.stringify({ event: "stripe_webhook_failed", type: event.type, id: event.id, detail: e instanceof Error ? e.message : String(e) }));
    return json(500, { error: "processing_failed" }); // Stripe が再送する
  }
}
