/**
 * 特定商取引法に基づく表記
 *
 * ⚠️ 運用者が下の定数に実値を入れるまで、課金を開始してはいけない（決済リンクを公開しない）。
 *    事業者名・メールアドレスはプレースホルダのまま。実在の氏名・住所をここに勝手に書かないこと。
 */
import type { Metadata } from "next";

// ---- 運用者が入力する値 ---------------------------------------------------
const SELLER_NAME = "【未設定：販売事業者名（屋号または氏名）】";
const EMAIL = "【未設定：連絡先メールアドレス】";
/** 個人事業の慣行に沿った定型文（差し替え可） */
const ADDRESS_TEXT = "個人事業のため住所は非公開としています。請求があった場合は遅滞なく開示します。";
const PHONE_TEXT = "個人事業のため電話番号は非公開としています。請求があった場合は遅滞なく開示します。";
// ---------------------------------------------------------------------------

const PRICE_TEXT = "月額300円（税込）";

export const metadata: Metadata = { title: "特定商取引法に基づく表記｜ごはんスキャン" };

const ROWS: [string, string][] = [
  ["販売事業者", SELLER_NAME],
  ["所在地", ADDRESS_TEXT],
  ["電話番号", PHONE_TEXT],
  ["メールアドレス", EMAIL],
  ["販売価格", `${PRICE_TEXT}（ごはんスキャン プレミアム：月90回まで解析）`],
  ["商品代金以外の必要料金", "なし（インターネット接続の通信費はお客様のご負担となります）"],
  ["支払方法", "クレジットカード（決済代行：Stripe）"],
  ["支払時期", "お申し込み時、および以後毎月の更新時"],
  ["サービス提供時期", "お支払い完了後、解除コードの発行をもって即時"],
  ["解約", "いつでも解約できます。解約後も、お支払い済みの期間の末日まではご利用いただけます。日割りでの返金はありません。"],
  ["返金", "デジタルサービスの性質上、提供開始後の返金はお受けしていません。ただし、二重課金など当方の不具合による場合はこの限りではありません。"],
];

export default function TokushohoPage() {
  return (
    <main className="app legal">
      <header className="header">
        <h1 className="logo">ごはんスキャン</h1>
        <p className="tagline">特定商取引法に基づく表記</p>
      </header>
      <section className="card">
        <dl className="legal-list">
          {ROWS.map(([k, v]) => (
            <div className="legal-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <a className="text-btn text-btn-left" href="/">
          アプリに戻る
        </a>
      </section>
    </main>
  );
}
