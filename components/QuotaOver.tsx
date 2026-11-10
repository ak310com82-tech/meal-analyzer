"use client";

import { PAYMENT_LINK_URL } from "../lib/client/premium";

/** 決済リンクが未設定のときの文言（現行のまま） */
export const QUOTA_MESSAGE = "今月の無料枠は終わりです。有料プランは準備中です";

/**
 * 月の上限に達したときの表示（解析タブ・飲み会モードで共通）。
 * - 決済リンクが設定されていれば：購入ボタン＋「解除コードをお持ちの方」
 * - 未設定なら：現行の文言をそのまま
 * - プレミアムで 90 回を使い切った場合：来月まで待つ案内
 */
export function QuotaOver({ premium, onHaveCode, note }: { premium: boolean; onHaveCode: () => void; note?: string }) {
  if (premium) {
    return (
      <div className="quota-over" data-testid="quota-over">
        今月の上限（90回）に達しました。来月1日からまた使えます。
        {note && <span className="quota-note">{note}</span>}
      </div>
    );
  }
  if (!PAYMENT_LINK_URL) {
    return (
      <div className="quota-over" data-testid="quota-over">
        {QUOTA_MESSAGE}
        {note && <span className="quota-note">（{note}）</span>}
      </div>
    );
  }
  return (
    <div className="quota-over quota-over-paid" data-testid="quota-over">
      <span>今月の無料枠は終わりです</span>
      {note && <span className="quota-note">{note}</span>}
      <a className="btn btn-primary btn-block btn-link" href={PAYMENT_LINK_URL} data-testid="buy-premium">
        月300円で月90回まで使う
      </a>
      <button className="text-btn" onClick={onHaveCode} data-testid="have-code">
        解除コードをお持ちの方
      </button>
    </div>
  );
}
