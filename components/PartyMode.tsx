"use client";

import { useEffect, useState } from "react";
import { analyzeText } from "../lib/client/api";
import { addHistory } from "../lib/client/history";
import { DRINKS, MAX_CUPS, clampCups, drinkItems, drinksTotalKcal, emptyCounts, loadPartyDraft, savePartyDraft, type DrinkCounts } from "../lib/client/party";
import { consumeQuota, getQuota } from "../lib/client/quota";
import { QuotaOver } from "./QuotaOver";

/**
 * 飲み会モード：お酒の杯数（API を使わない）＋「食べたもの」の文章（テキスト解析）を 1 件の記録にまとめる。
 * - 食べたものが空ならお酒だけで記録できる（回数は消費しない）
 * - 食べたものがあればテキスト解析で推定。推定できたら回数を 1 消費、食事と判断できなければ記録しない
 */
const r1 = (n: number) => Math.round(n * 10) / 10;

export function PartyMode({ quotaExhausted, premium, onRecorded, onHaveCode }: { quotaExhausted: boolean; premium: boolean; onRecorded: () => void; onHaveCode: () => void }) {
  // 途中経過を復元（タブ切り替え・再読み込みで杯数が消えないように）。この画面は操作後にだけ表示されるので初期値で読んでよい
  const [counts, setCounts] = useState<DrinkCounts>(() => loadPartyDraft().counts);
  const [food, setFood] = useState(() => loadPartyDraft().food);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "quota"; text: string } | null>(null);
  useEffect(() => savePartyDraft({ counts, food }), [counts, food]);

  const drinksKcal = drinksTotalKcal(counts);
  const foodText = food.trim();
  const canRecord = !busy && (drinksKcal > 0 || foodText !== "");

  function change(id: keyof DrinkCounts, delta: number) {
    setMsg(null);
    setCounts((c) => ({ ...c, [id]: clampCups(c[id] + delta) }));
  }

  async function record() {
    if (!canRecord) return;
    setMsg(null);
    let foodResult: Awaited<ReturnType<typeof analyzeText>> | null = null;

    if (foodText) {
      if (getQuota().exhausted) {
        return setMsg({ kind: "quota", text: "" });
      }
      setBusy(true);
      foodResult = await analyzeText(foodText);
      setBusy(false);
      if (!foodResult.ok) return setMsg({ kind: "err", text: foodResult.message });
      if (foodResult.result.items.length === 0) {
        // 食事と判断できない：記録しない・回数も消費しない
        return setMsg({
          kind: "err",
          text: "食べたものを推定できませんでした（食事の内容と判断できませんでした）。お酒だけ記録する場合は、食べたものの欄を消してから記録してください。",
        });
      }
      consumeQuota();
    }

    const foodOk = foodResult?.ok ? foodResult : null;
    const items = [
      ...drinkItems(counts),
      ...(foodOk?.result.items ?? []).map((it) => ({ ...it, multiplier: 1 as const })),
    ];
    const totals = items.reduce(
      (t, x) => ({ kcal: t.kcal + x.kcal, protein_g: r1(t.protein_g + x.protein_g), fat_g: r1(t.fat_g + x.fat_g), carbs_g: r1(t.carbs_g + x.carbs_g) }),
      { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    );
    const { ok } = addHistory({
      source: "party",
      mock: foodOk?.mock ?? false,
      promptVersion: foodOk?.promptVersion || undefined,
      confidence: foodOk?.result.confidence,
      note: foodOk?.result.note ?? "",
      eatenPercent: 100,
      isShared: foodOk?.result.is_shared,
      items,
      totals,
      originalTotalKcal: totals.kcal,
    });
    if (!ok) return setMsg({ kind: "err", text: "記録を保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。" });

    const foodKcal = totals.kcal - drinksKcal;
    setMsg({
      kind: "ok",
      text: foodOk
        ? `記録しました（お酒 ${drinksKcal.toLocaleString("ja-JP")}kcal ＋ 食べ物 ${foodKcal.toLocaleString("ja-JP")}kcal ＝ ${totals.kcal.toLocaleString("ja-JP")}kcal）`
        : `記録しました（お酒 ${drinksKcal.toLocaleString("ja-JP")}kcal）`,
    });
    setCounts(emptyCounts());
    setFood("");
    onRecorded();
  }

  return (
    <div data-testid="party">
      <h3 className="sub-title">お酒</h3>
      <ul className="drinks">
        {DRINKS.map((d) => (
          <li className="drink" key={d.id} data-testid={`drink-${d.id}`}>
            <div className="drink-name">
              {d.name}
              <span className="drink-kcal">{d.kcalPerCup}kcal/杯</span>
            </div>
            <div className="counter">
              <button className="counter-btn" aria-label={`${d.name}を1杯減らす`} disabled={counts[d.id] <= 0} onClick={() => change(d.id, -1)} data-testid={`minus-${d.id}`}>
                −
              </button>
              <span className="counter-num" aria-live="polite" data-testid={`count-${d.id}`}>
                {counts[d.id]}
              </span>
              <button className="counter-btn" aria-label={`${d.name}を1杯増やす`} disabled={counts[d.id] >= MAX_CUPS} onClick={() => change(d.id, +1)} data-testid={`plus-${d.id}`}>
                ＋
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="sum-line">
        <span className="sum-label">お酒の合計</span>
        <span className="sum-value" data-testid="drinks-total">
          {drinksKcal.toLocaleString("ja-JP")}
          <span className="unit">kcal</span>
        </span>
      </div>
      <p className="muted small">1杯あたりのカロリーは目安です。お酒はカロリーだけを数え、PFCには含めません。</p>

      <h3 className="sub-title">食べたもの</h3>
      <textarea
        className="text-area"
        rows={3}
        maxLength={300}
        placeholder="例：餃子3こ、もつ鍋1人前、唐揚げ2こ、枝豆ひと握り"
        value={food}
        onChange={(e) => {
          setFood(e.target.value);
          setMsg(null);
        }}
        aria-label="食べたもの"
        data-testid="party-food"
      />
      <p className="muted small">
        入れると記録するときにAIで推定します（解析を1回使います）。分け合った料理は「もつ鍋1人前」のように自分の分の量で書いてください。空欄ならお酒だけで記録できます。
        {quotaExhausted && foodText && (premium ? " 今月の上限に達しているため、食べたものの推定はできません。" : " 今月の無料枠は終わっているため、食べたものの推定はできません。")}
      </p>

      <button className="btn btn-primary btn-block" disabled={!canRecord} onClick={record} data-testid="party-record">
        {busy ? "食べたものを推定しています…" : "記録する"}
      </button>
      {msg?.kind === "quota" && (
        <div role="status" data-testid="party-msg">
          <QuotaOver premium={premium} onHaveCode={onHaveCode} note="食べたものの欄を空にすると、お酒だけ記録できます" />
        </div>
      )}
      {msg && msg.kind !== "quota" && (
        <p className={msg.kind === "ok" ? "ok-msg" : "error"} role="status" data-testid="party-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
