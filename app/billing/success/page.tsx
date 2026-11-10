/**
 * /billing/success?session_id=...  支払い完了後のリダイレクト先。
 * - Webhook で発行済みなら解除コードを大きく表示（最初の表示から30分で見られなくなる）
 * - まだ届いていなければ「処理中」として数回自動で読み直す
 * - session_id が不正などのときは汎用メッセージだけを出し、内部情報は出さない
 */
import type { Metadata } from "next";
import { AutoRefresh } from "../../../components/AutoRefresh";
import { revealSessionCode, SESSION_VIEW_GRACE_SEC } from "../../../lib/server/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "お支払いありがとうございます｜ごはんスキャン", robots: { index: false, follow: false } };

export default async function BillingSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  const sp = await searchParams;
  const sessionId = (Array.isArray(sp.session_id) ? sp.session_id[0] : sp.session_id) ?? "";
  let r: Awaited<ReturnType<typeof revealSessionCode>>;
  try {
    r = await revealSessionCode(sessionId);
  } catch {
    r = { status: "pending" }; // KV の一時的な失敗は「処理中」として読み直してもらう
  }

  return (
    <main className="app billing">
      <header className="header">
        <h1 className="logo">ごはんスキャン</h1>
        <p className="tagline">プレミアム（月90回）</p>
      </header>

      {r.status === "ok" && (
        <section className="card" data-testid="billing-code">
          <h2 className="card-title">お支払いありがとうございます</h2>
          <p>下の解除コードを、アプリの「設定」→「プレミアム」で入力すると、この端末で月90回まで使えるようになります。</p>
          <p className="unlock-code" data-testid="unlock-code">
            {r.code}
          </p>
          <p className="unlock-warn">このコードは再表示できません。スクリーンショットで保存してください</p>
          <p className="muted small">
            このページは最初に表示してから約{Math.round(SESSION_VIEW_GRACE_SEC / 60)}分で見られなくなります。コードは他の端末でも入力できます。
          </p>
          <a className="btn btn-primary btn-block btn-link" href="/">
            アプリに戻ってコードを入力する
          </a>
        </section>
      )}

      {r.status === "pending" && (
        <section className="card" data-testid="billing-pending">
          <h2 className="card-title">処理中です</h2>
          <p>お支払いの確認をしています。1分ほど待って再読み込みしてください。</p>
          <AutoRefresh storageKey={`billing-retry:${sessionId}`} />
        </section>
      )}

      {(r.status === "invalid" || r.status === "unavailable") && (
        <section className="card" data-testid="billing-unknown">
          <h2 className="card-title">ページを表示できません</h2>
          <p>このページを表示できませんでした。お支払いが完了している場合は、お手数ですがお問い合わせください。</p>
          <a className="text-btn text-btn-left" href="/tokushoho">
            お問い合わせ先（特定商取引法に基づく表記）
          </a>
        </section>
      )}
    </main>
  );
}
