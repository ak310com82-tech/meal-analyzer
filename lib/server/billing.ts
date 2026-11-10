/**
 * 課金の受け皿（Stripe 決済リンク ＋ 解除コード方式）のサーバー側ロジック。
 * Stripe SDK にも Next.js にも依存しない（イベントは検証済みのものを受け取る）。
 *
 * KV の保存設計（値はすべて JSON 文字列）
 *   code:<SHA-256(コード)>  → CodeRecord   … 照合はコードをハッシュ化して引く。平文コードはキーにしない
 *   session:<Checkout Session ID> → SessionRecord（平文コード）… 支払い完了ページで表示するためだけに一時保存
 *   sub:<Subscription ID>    → SubRecord   … invoice.paid / subscription.* からコードを引くための逆引き
 */
import { createHash, randomInt } from "node:crypto";
import { kv, kvConfig, kvGetJson, kvPipeline, type Env, type KvConfig } from "./kv";

// ---------------------------------------------------------------------------
// 解除コード
// ---------------------------------------------------------------------------

/** 紛らわしい 0 / O / 1 / I を除いた英大文字＋数字（32 文字） */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_PATTERN = /^GS-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}$/;

/** GS-XXXXXX-XXXXXX（暗号論的乱数。12 文字 × 5bit = 60bit） */
export function generateCode(): string {
  const part = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `GS-${part()}-${part()}`;
}

/** 入力の揺れを吸収（小文字・空白・全角ハイフン等） */
export function normalizeCode(input: string): string {
  return input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s]/g, "")
    .replace(/[‐-―−ー－]/g, "-");
}

export const hashCode = (code: string) => createHash("sha256").update(normalizeCode(code)).digest("hex");

// ---------------------------------------------------------------------------
// KV のレコード
// ---------------------------------------------------------------------------

export interface CodeRecord {
  status: "active" | "cancelled";
  /** 有効期限（ISO 日時）。この時刻までプレミアム */
  period_end: string;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  /** 期間末で解約予定（customer.subscription.updated の cancel_at_period_end） */
  cancel_at_period_end?: boolean;
  created_at: string;
  updated_at: string;
}

interface SessionRecord {
  code: string;
  created_at: string;
  /** 支払い完了ページで最初に表示した時刻。表示後しばらくで消す */
  first_shown_at?: string;
}

interface SubRecord {
  code_hash?: string;
  /** invoice.paid が checkout.session.completed より先に届いたときのための保管 */
  period_end?: string;
  status?: "active" | "cancelled";
  cancel_at_period_end?: boolean;
}

const codeKey = (hash: string) => `code:${hash}`;
const sessionKey = (id: string) => `session:${id}`;
const subKey = (id: string) => `sub:${id}`;

/** 支払い完了ページを一度も開かなかった場合でも、平文コードは 7 日で消す */
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
/** 最初に表示してから見られる時間（再読み込みや通信の失敗で受け取り損ねないための猶予） */
export const SESSION_VIEW_GRACE_SEC = 30 * 60;

const setJson = (key: string, v: unknown, ...opts: (string | number)[]) => ["SET", key, JSON.stringify(v), ...opts];
const laterIso = (a?: string | null, b?: string | null) => (!a ? b ?? null : !b ? a : a > b ? a : b);
const toIso = (unixSec: number | null | undefined) => (typeof unixSec === "number" && unixSec > 0 ? new Date(unixSec * 1000).toISOString() : null);

// ---------------------------------------------------------------------------
// Stripe イベントの処理（検証済みイベントを受け取る）
// ---------------------------------------------------------------------------

/** 必要な項目だけの緩い型（Stripe の API バージョン差を吸収するため） */
export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface BillingDeps {
  cfg: KvConfig;
  /** サブスクリプションの現在の期間末（unix 秒）を Stripe から取得する。取れなければ null */
  fetchSubscriptionPeriodEnd: (subscriptionId: string) => Promise<number | null>;
  now?: () => number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);

/** subscription の期間末（API バージョンにより subscription 直下 or items にある） */
export function subscriptionPeriodEnd(sub: Record<string, unknown>): number | null {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const items = (sub.items as { data?: { current_period_end?: number }[] } | undefined)?.data ?? [];
  const ends = items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? Math.max(...ends) : null;
}

/** invoice の subscription ID（API バージョンにより場所が違う） */
function invoiceSubscriptionId(inv: Record<string, unknown>): string | null {
  const direct = str(inv.subscription);
  if (direct) return direct;
  const parent = inv.parent as { subscription_details?: { subscription?: unknown } } | undefined;
  return str(parent?.subscription_details?.subscription);
}

/** invoice の請求期間の末日（明細の period.end の最大） */
function invoicePeriodEnd(inv: Record<string, unknown>): number | null {
  const lines = (inv.lines as { data?: { period?: { end?: number } }[] } | undefined)?.data ?? [];
  const ends = lines.map((l) => l.period?.end).filter((n): n is number => typeof n === "number");
  return ends.length ? Math.max(...ends) : typeof inv.period_end === "number" ? inv.period_end : null;
}

export type HandleResult = { handled: boolean; note: string };

export async function handleStripeEvent(event: StripeEventLike, deps: BillingDeps): Promise<HandleResult> {
  const { cfg } = deps;
  const now = deps.now?.() ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const obj = event.data.object;

  switch (event.type) {
    // ---- 初回購入：解除コードを発行（同じ session で二重発行しない）----
    case "checkout.session.completed": {
      const sessionId = str(obj.id);
      const subscriptionId = str(obj.subscription);
      if (!sessionId || !subscriptionId) return { handled: false, note: "not a subscription checkout" };
      if (obj.payment_status && obj.payment_status !== "paid" && obj.payment_status !== "no_payment_required") {
        return { handled: false, note: `payment_status=${String(obj.payment_status)}` };
      }

      // 1) session を先に NX で確保（同時に届いた重複イベントでもコードは 1 つだけ）
      const newCode = generateCode();
      const created = await kv(cfg, setJson(sessionKey(sessionId), { code: newCode, created_at: nowIso } satisfies SessionRecord, "NX", "EX", SESSION_TTL_SEC));
      const session = created === "OK" ? { code: newCode } : await kvGetJson<SessionRecord>(cfg, sessionKey(sessionId));
      if (!session) return { handled: true, note: "session record expired (already delivered long ago)" };
      const hash = hashCode(session.code);

      // 2) コードの記録を作る／補完する（前回の処理が途中で失敗していても、再送で必ず揃う）
      const [existing, sub] = await Promise.all([kvGetJson<CodeRecord>(cfg, codeKey(hash)), kvGetJson<SubRecord>(cfg, subKey(subscriptionId))]);
      let periodEnd = laterIso(existing?.period_end, sub?.period_end);
      if (!periodEnd) periodEnd = toIso(await deps.fetchSubscriptionPeriodEnd(subscriptionId).catch(() => null));
      // 取れなかったときの暫定（invoice.paid で正しい値に上書きされる）
      if (!periodEnd) periodEnd = new Date(now + 32 * 24 * 60 * 60 * 1000).toISOString();

      const record: CodeRecord = {
        status: sub?.status === "cancelled" ? "cancelled" : existing?.status ?? "active",
        period_end: periodEnd,
        stripe_customer: str(obj.customer),
        stripe_subscription: subscriptionId,
        cancel_at_period_end: sub?.cancel_at_period_end ?? existing?.cancel_at_period_end ?? false,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      };
      await kvPipeline(cfg, [setJson(codeKey(hash), record), setJson(subKey(subscriptionId), { ...sub, code_hash: hash, period_end: periodEnd })], 3000);
      return { handled: true, note: created === "OK" ? "code issued" : "already issued (idempotent)" };
    }

    // ---- 継続課金の支払い：有効期限を新しい期間の末日まで延長 ----
    case "invoice.paid": {
      const subscriptionId = invoiceSubscriptionId(obj);
      const end = toIso(invoicePeriodEnd(obj));
      if (!subscriptionId || !end) return { handled: false, note: "no subscription/period" };
      const sub = (await kvGetJson<SubRecord>(cfg, subKey(subscriptionId))) ?? {};
      const periodEnd = laterIso(sub.period_end, end)!;
      const cmds: (string | number)[][] = [setJson(subKey(subscriptionId), { ...sub, period_end: periodEnd })];
      if (sub.code_hash) {
        const rec = await kvGetJson<CodeRecord>(cfg, codeKey(sub.code_hash));
        if (rec) cmds.push(setJson(codeKey(sub.code_hash), { ...rec, period_end: laterIso(rec.period_end, periodEnd) ?? periodEnd, updated_at: nowIso } satisfies CodeRecord));
      }
      await kvPipeline(cfg, cmds, 3000);
      return { handled: true, note: sub.code_hash ? "extended" : "stored for later (code not issued yet)" };
    }

    // ---- 解約確定：コードを無効化 ----
    case "customer.subscription.deleted":
    // ---- 状態の変化（期間末解約の予約・支払い失敗など）----
    // falls through
    case "customer.subscription.updated": {
      const subscriptionId = str(obj.id);
      if (!subscriptionId) return { handled: false, note: "no subscription id" };
      const deleted = event.type === "customer.subscription.deleted";
      const stripeStatus = String(obj.status ?? "");
      const ended = deleted || ["canceled", "incomplete_expired", "unpaid"].includes(stripeStatus);
      const cancelAtPeriodEnd = obj.cancel_at_period_end === true;
      const subEnd = deleted ? null : toIso(subscriptionPeriodEnd(obj));

      const sub = (await kvGetJson<SubRecord>(cfg, subKey(subscriptionId))) ?? {};
      const nextSub: SubRecord = {
        ...sub,
        status: ended ? "cancelled" : sub.status ?? "active",
        cancel_at_period_end: cancelAtPeriodEnd,
        // 期間の延長は「支払い済み」のときだけ（invoice.paid）。ここでは延ばさない
        period_end: sub.period_end ?? subEnd ?? undefined,
      };
      const cmds: (string | number)[][] = [setJson(subKey(subscriptionId), nextSub)];
      if (sub.code_hash) {
        const rec = await kvGetJson<CodeRecord>(cfg, codeKey(sub.code_hash));
        if (rec) {
          cmds.push(
            setJson(codeKey(sub.code_hash), {
              ...rec,
              status: ended ? "cancelled" : rec.status,
              cancel_at_period_end: cancelAtPeriodEnd,
              updated_at: nowIso,
            } satisfies CodeRecord),
          );
        }
      }
      await kvPipeline(cfg, cmds, 3000);
      return { handled: true, note: ended ? "cancelled" : cancelAtPeriodEnd ? "cancel scheduled at period end" : "updated" };
    }

    default:
      return { handled: false, note: "ignored" };
  }
}

// ---------------------------------------------------------------------------
// コード照合・支払い完了ページ
// ---------------------------------------------------------------------------

export type ValidateResult = { active: boolean; period_end: string | null };

export async function validateCode(input: string, env: Env = process.env, now = Date.now()): Promise<ValidateResult | "unavailable"> {
  const cfg = kvConfig(env);
  if (!cfg) return "unavailable";
  const code = normalizeCode(input);
  if (!CODE_PATTERN.test(code)) return { active: false, period_end: null };
  const rec = await kvGetJson<CodeRecord>(cfg, codeKey(hashCode(code)));
  if (!rec) return { active: false, period_end: null };
  return { active: rec.status === "active" && Date.parse(rec.period_end) > now, period_end: rec.period_end };
}

export const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/**
 * 支払い完了ページ用：session に紐づく平文コードを返す。
 * 最初に表示した時点から SESSION_VIEW_GRACE_SEC 後に消える（その後は再表示できない）。
 */
export async function revealSessionCode(sessionId: string, env: Env = process.env): Promise<{ status: "ok"; code: string } | { status: "pending" } | { status: "invalid" } | { status: "unavailable" }> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return { status: "invalid" };
  const cfg = kvConfig(env);
  if (!cfg) return { status: "unavailable" };
  const rec = await kvGetJson<SessionRecord>(cfg, sessionKey(sessionId));
  if (!rec) return { status: "pending" };
  if (!rec.first_shown_at) {
    await kv(cfg, setJson(sessionKey(sessionId), { ...rec, first_shown_at: new Date().toISOString() }, "EX", SESSION_VIEW_GRACE_SEC));
  }
  return { status: "ok", code: rec.code };
}
