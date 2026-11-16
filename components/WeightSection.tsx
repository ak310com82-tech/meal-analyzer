"use client";

import { useEffect, useState } from "react";
import { isValidWeight, weightSummary, WEIGHT_MAX_KG, WEIGHT_MIN_KG, type WeightEntry } from "../lib/client/weight";
import { localDateKey } from "../lib/client/storage";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function dateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}月${d}日（${WEEK[date.getDay()]}）`;
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}

/** 前回比の表記（例：−0.3kg／＋0.5kg／±0kg） */
function diffLabel(diff: number): string {
  if (diff > 0) return `＋${diff.toFixed(1)}kg`;
  if (diff < 0) return `−${Math.abs(diff).toFixed(1)}kg`;
  return "±0kg";
}

interface SaveProps {
  weights: WeightEntry[];
  /** 保存できたら true */
  onSave: (date: string, kg: number) => boolean;
}

/** 今日の体重の入力行（ホーム・体重タブで共用。同日は上書き） */
function WeightInputRow({ weights, onSave }: SaveProps) {
  const today = localDateKey(new Date());
  const todayKg = weights.find((w) => w.date === today)?.kg ?? null;
  const [text, setText] = useState(todayKg != null ? String(todayKg) : "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  useEffect(() => setText(todayKg != null ? String(todayKg) : ""), [todayKg]);

  const n = text.trim() === "" ? null : Number(text);
  const valid = n != null && isValidWeight(n);

  return (
    <div>
      <div className="steps-row">
        <input
          className="num-input"
          type="number"
          inputMode="decimal"
          step={0.1}
          min={WEIGHT_MIN_KG}
          max={WEIGHT_MAX_KG}
          placeholder="例：65.0"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setState("idle");
          }}
          aria-label="今日の体重"
          data-testid="weight-input"
        />
        <span className="steps-unit">kg</span>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            if (n == null) return;
            setState(onSave(today, n) ? "saved" : "error");
          }}
          data-testid="weight-save"
        >
          {state === "saved" ? "記録済み" : "記録する"}
        </button>
      </div>
      {text.trim() !== "" && !valid && (
        <p className="error small">
          {WEIGHT_MIN_KG}〜{WEIGHT_MAX_KG}kgの範囲で入れてください。
        </p>
      )}
      {state === "saved" && (
        <p className="ok-msg small" data-testid="weight-saved">
          今日の体重を記録しました
        </p>
      )}
      {state === "error" && <p className="error small">保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。</p>}
    </div>
  );
}

/** 最新の体重と前回比の1行（記録が無ければ案内文） */
function LatestLine({ weights }: { weights: WeightEntry[] }) {
  const s = weightSummary(weights);
  if (!s) return <p className="muted">まだ体重の記録はありません。今日の体重を入れてみましょう。</p>;
  return (
    <p className="weight-latest" data-testid="weight-latest">
      最新 <strong>{s.latest.kg.toFixed(1)}kg</strong>
      <span className="weight-latest-sub">
        （{dateLabel(s.latest.date)}）
        {s.prev && s.diff != null && (
          <>
            ・前回（{shortDate(s.prev.date)}）から <span data-testid="weight-diff">{diffLabel(s.diff)}</span>
          </>
        )}
      </span>
    </p>
  );
}

/** ホーム用：入力＋最新体重と前回比の小さな表示 */
export function WeightHomeCard(props: SaveProps) {
  return (
    <section className="card" data-testid="weight-card-home">
      <h2 className="card-title">今日の体重</h2>
      <WeightInputRow {...props} />
      <LatestLine weights={props.weights} />
      <p className="muted small">推移は「体重」タブで見られます。この端末内にだけ保存されます。</p>
    </section>
  );
}

/** 体重タブ用：入力＋推移グラフ＋直近の記録リスト */
export function WeightView({ weights, onSave, onRemove }: SaveProps & { onRemove: (date: string) => void }) {
  const recent = [...weights].reverse().slice(0, 30);
  return (
    <section className="card" data-testid="weight-card">
      <h2 className="card-title">体重</h2>
      <WeightInputRow weights={weights} onSave={onSave} />
      <LatestLine weights={weights} />
      {weights.length >= 2 ? (
        <WeightChart weights={weights} />
      ) : (
        weights.length === 1 && <p className="muted small">あと1日分記録すると、推移のグラフが出ます。</p>
      )}
      {recent.length > 0 && (
        <ul className="weight-list">
          {recent.map((w) => (
            <li className="weight-item" key={w.date} data-testid="weight-item">
              <span className="weight-item-date">{dateLabel(w.date)}</span>
              <span className="weight-item-kg">{w.kg.toFixed(1)} kg</span>
              <button
                className="icon-btn"
                aria-label="この体重の記録を削除"
                data-testid="weight-delete"
                onClick={() => {
                  if (window.confirm("この体重の記録を削除しますか？")) onRemove(w.date);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">※ 体重の記録はこの端末内にだけ保存されます（プロフィールの体重とは別です）。</p>
    </section>
  );
}

/** 推移グラフ（SVG自前描画。記録は日付の昇順） */
function WeightChart({ weights }: { weights: WeightEntry[] }) {
  const W = 320;
  const H = 132;
  const padL = 36;
  const padR = 10;
  const padT = 12;
  const padB = 20;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const rawMin = Math.min(...weights.map((w) => w.kg));
  const rawMax = Math.max(...weights.map((w) => w.kg));
  const pad = rawMax - rawMin < 1 ? 0.5 : 0.3;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const x = (i: number) => padL + (weights.length === 1 ? iw / 2 : (i / (weights.length - 1)) * iw);
  const y = (kg: number) => padT + (1 - (kg - min) / (max - min)) * ih;
  const points = weights.map((w, i) => `${x(i).toFixed(1)},${y(w.kg).toFixed(1)}`).join(" ");

  return (
    <svg
      className="weight-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`体重の推移：${shortDate(weights[0].date)}から${shortDate(weights[weights.length - 1].date)}まで、${weights[0].kg.toFixed(1)}kgから${weights[weights.length - 1].kg.toFixed(1)}kg`}
      data-testid="weight-chart"
    >
      <line className="weight-grid" x1={padL} y1={y(rawMax)} x2={W - padR} y2={y(rawMax)} />
      <line className="weight-grid" x1={padL} y1={y(rawMin)} x2={W - padR} y2={y(rawMin)} />
      <text className="weight-axis" x={padL - 4} y={y(rawMax) + 3} textAnchor="end">
        {rawMax.toFixed(1)}
      </text>
      <text className="weight-axis" x={padL - 4} y={y(rawMin) + 3} textAnchor="end">
        {rawMin.toFixed(1)}
      </text>
      <polyline className="weight-line" points={points} />
      {weights.map((w, i) => (
        <circle className="weight-dot" key={w.date} cx={x(i)} cy={y(w.kg)} r={3} />
      ))}
      <text className="weight-axis" x={padL} y={H - 4}>
        {shortDate(weights[0].date)}
      </text>
      <text className="weight-axis" x={W - padR} y={H - 4} textAnchor="end">
        {shortDate(weights[weights.length - 1].date)}
      </text>
    </svg>
  );
}
