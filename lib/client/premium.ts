/**
 * プレミアム（解除コード）の状態。localStorage に { code, lastValidatedAt, periodEnd } を保存する。
 * quota.ts がこのファイルを読む（このファイルは quota.ts に依存しない：循環 import を作らない）。
 */
import { readJson, writeJson } from "./storage";

const KEY = "meal-analyzer:premium:v1";
/** 前回の照合からこれだけ経ったら、起動時に静かに再照合する */
const REVALIDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** 決済リンク・カスタマーポータル（未設定なら課金 UI は出さない） */
export const PAYMENT_LINK_URL = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL || "";
export const PORTAL_URL = process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL || "";

export interface PremiumState {
  code: string;
  lastValidatedAt: string; // ISO
  periodEnd: string | null; // ISO
}

export function loadPremium(): PremiumState | null {
  const s = readJson<PremiumState | null>(KEY, null);
  return s && typeof s.code === "string" && s.code ? s : null;
}

export function isPremiumActive(now = Date.now()): boolean {
  const s = loadPremium();
  return Boolean(s?.periodEnd && Date.parse(s.periodEnd) > now);
}

/** YYYY/MM/DD（端末のローカル日付） */
export function formatPeriodEnd(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export type ActivateResult =
  | { ok: true; periodEnd: string }
  | { ok: false; message: string };

async function callValidate(code: string): Promise<{ status: number; body: { active?: boolean; period_end?: string | null; message?: string } | null }> {
  const res = await fetch("/api/billing/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** 設定画面の「有効化」：照合して有効なら保存する */
export async function activateCode(input: string): Promise<ActivateResult> {
  const code = input.trim().toUpperCase();
  if (!code) return { ok: false, message: "解除コードを入力してください。" };
  try {
    const { status, body } = await callValidate(code);
    if (status !== 200 || !body) return { ok: false, message: body?.message || "いまはコードを確認できません。少し時間をおいてお試しください。" };
    if (!body.active || !body.period_end) {
      return {
        ok: false,
        message: body.period_end ? "このコードは有効期限が切れているか、解約済みです。" : "コードが見つかりません。入力に間違いがないか確かめてください。",
      };
    }
    writeJson(KEY, { code, lastValidatedAt: new Date().toISOString(), periodEnd: body.period_end } satisfies PremiumState);
    return { ok: true, periodEnd: body.period_end };
  } catch {
    return { ok: false, message: "通信できませんでした。電波の良いところでもう一度お試しください。" };
  }
}

/**
 * アプリ起動時に呼ぶ：前回の照合から7日以上経った、または有効期限を過ぎていれば静かに再照合する。
 * 失敗（通信エラー・サーバー側の一時エラー）のときは前回の状態を保つ。状態が変わったら true。
 */
export async function revalidateIfNeeded(now = Date.now()): Promise<boolean> {
  const s = loadPremium();
  if (!s) return false;
  const stale = now - Date.parse(s.lastValidatedAt || "0") >= REVALIDATE_AFTER_MS;
  const expired = !s.periodEnd || Date.parse(s.periodEnd) <= now;
  if (!stale && !expired) return false;
  try {
    const { status, body } = await callValidate(s.code);
    if (status !== 200 || !body) return false; // 失敗時は前回状態を維持
    const next: PremiumState = { code: s.code, lastValidatedAt: new Date(now).toISOString(), periodEnd: body.active ? body.period_end ?? null : null };
    writeJson(KEY, next);
    return next.periodEnd !== s.periodEnd;
  } catch {
    return false;
  }
}

/** この端末からコードを外す */
export function clearPremium(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
