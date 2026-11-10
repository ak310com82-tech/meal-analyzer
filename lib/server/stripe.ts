/**
 * Stripe SDK の薄いラッパー（サーバー専用。秘密鍵は STRIPE_SECRET_KEY だけで扱い、NEXT_PUBLIC_ を付けない）。
 * 課金ロジック本体は lib/server/billing.ts（SDK に依存しない）。
 */
import Stripe from "stripe";
import { subscriptionPeriodEnd, type StripeEventLike } from "./billing";

let client: Stripe | null = null;

export function stripeConfigured(env = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_WEBHOOK_SECRET?.trim());
}

function getStripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
  return client;
}

/**
 * Webhook の署名を検証してイベントを返す（raw body をそのまま渡すこと）。
 * 署名が無い・合わない・古すぎる場合は例外。
 */
export function verifyWebhook(rawBody: string, signature: string): StripeEventLike {
  const event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!.trim());
  return event as unknown as StripeEventLike;
}

/** サブスクリプションの現在の期間末（unix 秒）。取れなければ null */
export async function fetchSubscriptionPeriodEnd(subscriptionId: string): Promise<number | null> {
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    return subscriptionPeriodEnd(sub as unknown as Record<string, unknown>);
  } catch (e) {
    console.warn(JSON.stringify({ event: "stripe_subscription_retrieve_failed", detail: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}
