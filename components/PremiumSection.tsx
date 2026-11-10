"use client";

import { useEffect, useRef, useState } from "react";
import { activateCode, clearPremium, formatPeriodEnd, loadPremium, PAYMENT_LINK_URL, PORTAL_URL, type PremiumState } from "../lib/client/premium";

/**
 * 設定画面の「プレミアム」欄。
 * - 未加入：解除コードの入力＋有効化（決済リンクが設定されていれば購入ボタンも）
 * - 加入中：有効期限の表示（カスタマーポータルが設定されていれば解約・支払い方法の変更リンク）
 */
export function PremiumSection({ focus, onFocused, onChange }: { focus: boolean; onFocused: () => void; onChange: () => void }) {
  const [state, setState] = useState<PremiumState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setState(loadPremium()), []);

  // 「解除コードをお持ちの方」から来たときは、この欄までスクロールして入力欄にフォーカス
  useEffect(() => {
    if (!focus) return;
    sectionRef.current?.scrollIntoView({ block: "start" });
    inputRef.current?.focus({ preventScroll: true });
    onFocused();
  }, [focus, onFocused]);

  const active = Boolean(state?.periodEnd && Date.parse(state.periodEnd) > Date.now());

  async function activate() {
    setBusy(true);
    setMsg(null);
    const r = await activateCode(code);
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "err", text: r.message });
    setState(loadPremium());
    setCode("");
    setMsg({ kind: "ok", text: `プレミアムが有効になりました（${formatPeriodEnd(r.periodEnd)} まで）` });
    onChange();
  }

  return (
    <section className="card" id="premium" ref={sectionRef} data-testid="premium">
      <h2 className="card-title">プレミアム</h2>

      {active && state ? (
        <div data-testid="premium-active">
          <p className="premium-status">
            月90回まで使えます。<strong>{formatPeriodEnd(state.periodEnd)}</strong> まで有効
          </p>
          <p className="muted small">毎月の更新が確認できると、有効期限は自動で延びます。</p>
          {PORTAL_URL && (
            <a className="text-btn text-btn-left" href={PORTAL_URL} target="_blank" rel="noopener noreferrer" data-testid="portal-link">
              解約・支払い方法の変更
            </a>
          )}
          <button
            className="text-btn text-btn-left"
            onClick={() => {
              if (!window.confirm("この端末から解除コードを外しますか？（契約は解約されません）")) return;
              clearPremium();
              setState(null);
              setMsg(null);
              onChange();
            }}
          >
            この端末からコードを外す
          </button>
        </div>
      ) : (
        <div data-testid="premium-inactive">
          <p className="muted small">
            無料では月5回まで解析できます。プレミアム（月300円）なら月90回まで。お支払い後に表示される解除コードを入力してください。
            {state && !active && " 登録されていたコードは、有効期限が切れたか解約済みです。"}
          </p>
          {PAYMENT_LINK_URL && (
            <a className="btn btn-primary btn-block btn-link" href={PAYMENT_LINK_URL} data-testid="premium-buy">
              月300円で月90回まで使う
            </a>
          )}
          <label className="field">
            <span className="field-label">解除コード</span>
            <span className="field-row">
              <input
                ref={inputRef}
                className="text-input code-input"
                placeholder="GS-XXXXXX-XXXXXX"
                value={code}
                maxLength={32}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setMsg(null);
                }}
                data-testid="code-input"
              />
              <button className="btn btn-primary" onClick={activate} disabled={busy || !code.trim()} data-testid="code-activate">
                {busy ? "確認中…" : "有効化"}
              </button>
            </span>
          </label>
        </div>
      )}
      {msg && (
        <p className={msg.kind === "ok" ? "ok-msg" : "error"} role="status" data-testid="premium-msg">
          {msg.text}
        </p>
      )}
      <a className="text-btn text-btn-left legal-link" href="/tokushoho" data-testid="tokushoho-link">
        特定商取引法に基づく表記
      </a>
    </section>
  );
}
