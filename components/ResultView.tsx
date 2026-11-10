"use client";

import { useState } from "react";
import type { MealAnalysis } from "../lib/meal/schema";
import { DISH_HINT_MAX } from "../lib/meal/prompt";
import { ItemEditor, type EditableItem } from "./ItemEditor";
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
  /** 品目の手修正を保存（生の品目＝割合・倍率をかける前の値。倍率は index で引き継ぐ） */
  onEditItems: (rows: { item: EditableItem; srcIndex: number | null }[]) => void;
  /** 料理名でAI再計算（写真の結果のときだけ渡す） */
  recalc?: { count: number; max: number; busy: boolean; error: string; onRun: (dishHint: string) => void };
}

export function ResultView({ analysis, corrected, multipliers, onMultiplier, onEatenPercent, onRecord, recorded, onReset, source = "photo", onEditItems, recalc }: Props) {
  const isText = source === "text";
  const [editing, setEditing] = useState(false);
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

      {editing ? (
        <ItemEditor
          items={analysis.items.map((it, i) => ({ ...it, index: i }))}
          lead="AIの推定値（量の補正・食べた割合をかける前）を直せます。保存すると合計を計算し直します。解析回数は使いません。"
          sumLabel="合計（補正前）"
          onCancel={() => setEditing(false)}
          onSave={(rows) => {
            onEditItems(rows.map((r) => ({ item: r.item, srcIndex: r.src ? r.src.index : null })));
            setEditing(false);
          }}
        />
      ) : (
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
      )}

      {!recorded && !editing && (
        <div className="fix-tools">
          <button className="text-btn text-btn-left" onClick={() => setEditing(true)} data-testid="edit-open">
            内容を修正
          </button>
          {recalc && <RecalcBox {...recalc} />}
        </div>
      )}

      <button className="btn btn-primary btn-block" onClick={onRecord} disabled={recorded || editing} data-testid="record">
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

/** 料理名でAI再計算（写真の結果のみ）。同じ写真＋申告した料理名で解析し直す。解析回数は使わない（1結果につき2回まで） */
function RecalcBox({ count, max, busy, error, onRun }: { count: number; max: number; busy: boolean; error: string; onRun: (dishHint: string) => void }) {
  const [hint, setHint] = useState("");
  const used = count >= max;
  return (
    <div className="recalc" data-testid="recalc">
      <div className="recalc-title">料理名が違う場合はこちら</div>
      <p className="muted small">正しい料理名を入れると、同じ写真をその料理としてAIが計算し直します（量も含めて推定。解析回数は減りません）。</p>
      <div className="field-row">
        <input
          className="text-input"
          placeholder="例：もつ鍋"
          value={hint}
          maxLength={DISH_HINT_MAX}
          onChange={(e) => setHint(e.target.value)}
          disabled={used || busy}
          aria-label="正しい料理名"
          data-testid="recalc-input"
        />
        <button className="btn btn-primary" onClick={() => onRun(hint.trim())} disabled={used || busy || !hint.trim()} data-testid="recalc-run">
          {busy ? "計算中…" : "AIで再計算"}
        </button>
      </div>
      <p className="muted small" data-testid="recalc-count">
        {used ? "再計算は2回までです。細かい修正は『内容を修正』からできます" : `再計算できるのはあと${max - count}回です`}
      </p>
      {error && (
        <p className="error small" role="status" data-testid="recalc-error">
          {error}
        </p>
      )}
    </div>
  );
}
