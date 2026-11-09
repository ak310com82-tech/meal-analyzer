"use client";

import type { MealAnalysis } from "../lib/meal/schema";
import { EATEN_OPTIONS, PORTION_OPTIONS, type CorrectedMeal, type EatenPercent, type PortionMultiplier } from "../lib/client/correction";

interface Props {
  analysis: MealAnalysis;
  corrected: CorrectedMeal;
  multipliers: PortionMultiplier[];
  onMultiplier: (index: number, m: PortionMultiplier) => void;
  onEatenPercent: (p: EatenPercent) => void;
  onRecord: () => void;
  recorded: boolean;
  onReset: () => void;
  /** 結果の元になった入力方法（文言の出し分けに使う） */
  source?: "photo" | "text";
}

export function ResultView({ analysis, corrected, multipliers, onMultiplier, onEatenPercent, onRecord, recorded, onReset, source = "photo" }: Props) {
  const isText = source === "text";
  if (analysis.items.length === 0) {
    return (
      <section className="card" data-testid="result-nofood">
        <h2 className="card-title">食事が見つかりませんでした</h2>
        <p className="muted">
          {isText
            ? "入力された文章から食事の内容を読み取れませんでした。料理名や量を書き直してみてください（解析回数は減っていません）。"
            : "写真から料理を読み取れませんでした。料理全体が写るように、明るい場所で撮り直してみてください（解析回数は減っていません）。"}
        </p>
        {analysis.note && <p className="note">{analysis.note}</p>}
        <button className="btn btn-secondary" onClick={onReset}>
          {isText ? "入力し直す" : "別の写真を選ぶ"}
        </button>
      </section>
    );
  }

  const { totals } = corrected;
  const eaten = <EatenSelector value={corrected.eatenPercent} onChange={onEatenPercent} prominent={analysis.is_shared} />;
  return (
    <section className="card" data-testid="result">
      {/* 鍋・大皿（is_shared）のときは、食べた割合を結果のいちばん上に出す */}
      {analysis.is_shared && eaten}
      <div className="total-box">
        <div className="total-label">合計（推定）</div>
        <div className="total-kcal" data-testid="total-kcal">
          {totals.kcal.toLocaleString()} <span className="unit">kcal</span>
        </div>
        <div className="pfc-row" data-testid="total-pfc">
          <span>P {totals.protein_g}g</span>
          <span>F {totals.fat_g}g</span>
          <span>C {totals.carbs_g}g</span>
        </div>
      </div>

      {analysis.confidence === "low" && (
        <p className="soft-warn" data-testid="low-confidence">
          {isText ? "文章から読み取りにくいところがあり" : "写真から読み取りにくいところがあり"}、推定の確度が低めです。量の補正で調整してみてください。
        </p>
      )}
      {analysis.note && <p className="note">{analysis.note}</p>}

      {!analysis.is_shared && eaten}

      <ul className="items">
        {corrected.items.map((it, i) => (
          <li key={i} className="item" data-testid="item">
            <div className="item-head">
              <div>
                <div className="item-name">{it.name}</div>
                <div className="item-amount">{it.amount}</div>
              </div>
              <div className="item-kcal" data-testid="item-kcal">
                {it.kcal} <span className="unit">kcal</span>
              </div>
            </div>
            <div className="item-pfc">
              P {it.protein_g}g ・ F {it.fat_g}g ・ C {it.carbs_g}g
            </div>
            <div className="seg" role="group" aria-label={`${it.name}の量`}>
              {PORTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`seg-btn ${multipliers[i] === o.value ? "on" : ""}`}
                  aria-pressed={multipliers[i] === o.value}
                  onClick={() => onMultiplier(i, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <button className="btn btn-primary btn-block" onClick={onRecord} disabled={recorded} data-testid="record">
        {recorded ? "記録しました ✓" : "記録する"}
      </button>
      {recorded ? (
        <button className="btn btn-secondary btn-block" onClick={onReset}>
          次の写真を解析する
        </button>
      ) : (
        <button className="text-btn" onClick={onReset} data-testid="discard">
          {isText ? "記録せずに入力し直す" : "記録せずに別の写真を選ぶ"}
        </button>
      )}
    </section>
  );
}

/** 食べた割合（全品目にかける）。is_shared のときは上部に目立つ形で出す */
function EatenSelector({ value, onChange, prominent }: { value: EatenPercent; onChange: (p: EatenPercent) => void; prominent: boolean }) {
  return (
    <div className={`eaten ${prominent ? "eaten-prominent" : ""}`} data-testid="eaten">
      <div className="eaten-head">
        <span className="eaten-title">食べた割合</span>
        {value !== 100 && <span className="eaten-now">{value}%で計算中</span>}
      </div>
      {prominent && (
        <p className="eaten-lead" data-testid="shared-notice">
          鍋・大皿は、取り分けではなく<strong>料理全体の量</strong>で推定しています。分け合った分は割合を選んでください
        </p>
      )}
      <div className="seg seg-5" role="group" aria-label="食べた割合">
        {EATEN_OPTIONS.map((o) => (
          <button
            key={o.percent}
            className={`seg-btn ${value === o.percent ? "on" : ""}`}
            aria-pressed={value === o.percent}
            onClick={() => onChange(o.percent)}
            data-testid={`eaten-${o.percent}`}
          >
            <span className="eaten-opt">{o.label}</span>
            <span className="eaten-pct">{o.percent}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
