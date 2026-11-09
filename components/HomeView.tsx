"use client";

import { useEffect, useState } from "react";
import {
  dailyBalance,
  effectiveBmr,
  forecast,
  formatBalance,
  formatEta,
  walkKcal,
  type DayRecord,
  type Profile,
} from "../lib/client/energy";
import { groupByDay, type HistoryEntry } from "../lib/client/history";
import type { StepsByDate } from "../lib/client/steps";
import { localDateKey } from "../lib/client/storage";

interface Props {
  profile: Profile | null;
  history: HistoryEntry[];
  steps: StepsByDate;
  onSaveSteps: (date: string, steps: number | null) => void;
  goSettings: () => void;
  goAnalyze: () => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");

export function HomeView({ profile, history, steps, onSaveSteps, goSettings, goAnalyze }: Props) {
  const now = new Date();
  const today = localDateKey(now);
  const days = groupByDay(history);
  const eatenToday = days.find((d) => d.date === today)?.totals.kcal ?? 0;
  const todaySteps = steps[today] ?? null;

  const bmr = profile ? effectiveBmr(profile) : null;
  const walk = profile && todaySteps != null ? walkKcal(todaySteps, profile.heightCm, profile.weightKg) : null;
  const balance = bmr ? dailyBalance(bmr.kcal, walk?.kcal ?? 0, eatenToday) : null;
  const b = balance != null ? formatBalance(balance) : null;

  // 予測：当日は食事が途中のため除き、昨日までの「記録のある日」を使う
  const pastDays: DayRecord[] = days
    .filter((d) => d.date < today)
    .map((d) => ({ date: d.date, eatenKcal: d.totals.kcal, steps: steps[d.date] ?? null }));
  const fc = profile ? forecast(pastDays, profile, now) : null;

  return (
    <div data-testid="home">
      {/* 今日の収支 */}
      <section className="card" data-testid="balance-card">
        <h2 className="card-title">今日の収支</h2>
        <div className="bal-grid">
          <div className="bal-cell">
            <div className="bal-label">食べた</div>
            <div className="bal-value" data-testid="eaten-today">
              {fmt(eatenToday)}
              <span className="unit">kcal</span>
            </div>
          </div>
          <div className="bal-cell">
            <div className="bal-label">基礎代謝＋歩いた</div>
            {bmr ? (
              <div className="bal-value" data-testid="burn-today">
                {fmt(bmr.kcal + (walk?.kcal ?? 0))}
                <span className="unit">kcal</span>
              </div>
            ) : (
              <div className="bal-value muted">—</div>
            )}
            {bmr && (
              <div className="bal-sub">
                {fmt(bmr.kcal)}＋{walk ? `${fmt(walk.kcal)}（概算）` : <span data-testid="steps-missing">0（歩数は未入力）</span>}
              </div>
            )}
          </div>
        </div>
        {b ? (
          <div className={`bal-result ${b.direction}`} data-testid="balance">
            <div className="bal-big" data-testid="balance-label">
              {b.label}
            </div>
            <div className="bal-hint">{b.hint}</div>
          </div>
        ) : (
          <div className="bal-empty">
            <p className="muted">プロフィールを入れると、基礎代謝と収支が出ます。</p>
            <button className="btn btn-secondary btn-block" onClick={goSettings}>
              プロフィールを入れる
            </button>
          </div>
        )}
      </section>

      {/* 歩数 */}
      <section className="card" data-testid="steps-card">
        <h2 className="card-title">今日の歩数</h2>
        {profile ? (
          <StepsInput
            key={today}
            value={todaySteps}
            onSave={(v) => onSaveSteps(today, v)}
            preview={(v) => walkKcal(v, profile.heightCm, profile.weightKg)}
          />
        ) : (
          <p className="muted" data-testid="steps-guide">
            プロフィールを入れると歩数の消費カロリーが出ます
          </p>
        )}
        <p className="muted small">※ 今は手入力のみです（スマホの歩数アプリとの自動連携はできません）</p>
      </section>

      {/* このままいくと */}
      <section className="card" data-testid="forecast-card">
        <h2 className="card-title">このままいくと</h2>
        {!profile || !fc ? (
          <p className="muted">プロフィールを入れると、記録から先の見込みが出ます。</p>
        ) : fc.kind === "not_enough" ? (
          <p className="muted" data-testid="forecast-wait">
            あと数日記録すると予測が出ます（いま {fc.daysRecorded} 日分。昨日までの記録が3日分あると表示されます）
          </p>
        ) : (
          <div data-testid="forecast">
            <p className="fc-line" data-testid="forecast-30">
              このペースだと30日で約 <strong>{Math.abs(fc.change30Kg).toFixed(1)}kg</strong>{" "}
              {fc.change30Kg < 0 ? "減る" : fc.change30Kg > 0 ? "増える" : "変わらない"}見込み
            </p>
            <p className="muted small">
              直近{fc.daysUsed}日の平均：{formatBalance(fc.avgBalance).label}／日
            </p>
            {fc.target?.kind === "eta" && (
              <p className="fc-line" data-testid="forecast-eta">
                目標 {fc.target.targetKg}kg には、およそ <strong>{formatEta(fc.target.date, new Date())}</strong>の見込み
              </p>
            )}
            {fc.target?.kind === "not_approaching" && (
              <p className="fc-line" data-testid="forecast-not-approaching">
                今のペースでは目標 {fc.target.targetKg}kg に近づいていません
              </p>
            )}
            {fc.target?.kind === "reached" && (
              <p className="fc-line">目標 {fc.target.targetKg}kg に届いています</p>
            )}
            {fc.fastPace && (
              <p className="soft-warn" data-testid="forecast-fast">
                ペースが急です。無理のない範囲で続けましょう
              </p>
            )}
          </div>
        )}
        <p className="disclaimer">目安です。体調や水分量でも変わります</p>
      </section>

      <button className="btn btn-primary btn-block" onClick={goAnalyze}>
        食事を撮って記録する
      </button>
    </div>
  );
}

function StepsInput({
  value,
  onSave,
  preview,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  preview: (v: number) => { strideCm: number; distanceKm: number; kcal: number };
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(value != null ? String(value) : ""), [value]);

  const n = text.trim() === "" ? null : Number(text);
  const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 100_000);
  const p = n != null && valid ? preview(n) : null;

  return (
    <div>
      <div className="steps-row">
        <input
          className="num-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={100000}
          placeholder="例：8000"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          aria-label="今日の歩数"
          data-testid="steps-input"
        />
        <span className="steps-unit">歩</span>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            onSave(n);
            setSaved(true);
          }}
          data-testid="steps-save"
        >
          {saved ? "保存済" : "保存"}
        </button>
      </div>
      {!valid && <p className="error small">0〜100,000の整数で入れてください。</p>}
      {p && (
        <p className="muted small" data-testid="steps-calc">
          歩幅 {p.strideCm.toFixed(1)}cm → 距離 {p.distanceKm.toFixed(2)}km → 歩いたkcal 約{p.kcal.toLocaleString("ja-JP")}kcal（平地歩行の概算）
        </p>
      )}
    </div>
  );
}
