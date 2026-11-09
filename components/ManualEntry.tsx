"use client";

import { useState } from "react";
import { addHistory } from "../lib/client/history";

/**
 * 手入力：品目名と kcal（PFC は任意）を自分で入れて、そのまま履歴に保存する。
 * API を使わないので月の解析回数は消費しない。量補正・食べた割合は付けない（本人が決めた値をそのまま記録）。
 */
interface Row {
  name: string;
  kcal: string;
  p: string;
  f: string;
  c: string;
}
const emptyRow = (): Row => ({ name: "", kcal: "", p: "", f: "", c: "" });
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function ManualEntry({ onRecorded }: { onRecorded: () => void }) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim() !== ""));
  const problems = filled.flatMap((r, i) => {
    const out: string[] = [];
    const k = num(r.kcal);
    if (!r.name.trim()) out.push(`${i + 1}行目の品目名`);
    if (k == null || !Number.isFinite(k) || k < 0 || k > 5000) out.push(`${i + 1}行目のkcal（0〜5,000）`);
    for (const [key, label] of [["p", "P"], ["f", "F"], ["c", "C"]] as const) {
      const v = num(r[key]);
      if (v != null && (!Number.isFinite(v) || v < 0 || v > 500)) out.push(`${i + 1}行目の${label}（0〜500g）`);
    }
    return out;
  });
  const total = filled.reduce((a, r) => a + (Number(r.kcal) || 0), 0);
  const canRecord = filled.length > 0 && problems.length === 0;

  function update(i: number, patch: Partial<Row>) {
    setMsg(null);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function record() {
    if (!canRecord) return;
    const items = filled.map((r) => ({
      name: r.name.trim(),
      amount: "",
      multiplier: 1 as const,
      kcal: Math.round(Number(r.kcal)),
      protein_g: r1(num(r.p) ?? 0),
      fat_g: r1(num(r.f) ?? 0),
      carbs_g: r1(num(r.c) ?? 0),
    }));
    const totals = items.reduce(
      (t, x) => ({ kcal: t.kcal + x.kcal, protein_g: r1(t.protein_g + x.protein_g), fat_g: r1(t.fat_g + x.fat_g), carbs_g: r1(t.carbs_g + x.carbs_g) }),
      { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    );
    const { ok } = addHistory({ source: "manual", mock: false, note: "", eatenPercent: 100, items, totals, originalTotalKcal: totals.kcal });
    if (!ok) return setMsg({ kind: "err", text: "記録を保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。" });
    setRows([emptyRow()]);
    setMsg({ kind: "ok", text: `記録しました（${totals.kcal.toLocaleString("ja-JP")} kcal）` });
    onRecorded();
  }

  return (
    <div data-testid="manual">
      <p className="muted small">品目名とkcalを入れてください。PFCは分かる分だけで大丈夫です（空欄は0として記録）。解析回数は使いません。</p>
      <ol className="manual-rows">
        {rows.map((r, i) => (
          <li className="manual-row" key={i} data-testid="manual-row">
            <div className="manual-main">
              <input className="text-input" placeholder="品目名（例：おにぎり 鮭）" value={r.name} maxLength={40} onChange={(e) => update(i, { name: e.target.value })} aria-label={`${i + 1}行目の品目名`} data-testid="manual-name" />
              <input className="num-input num-kcal" type="number" inputMode="numeric" placeholder="kcal" value={r.kcal} onChange={(e) => update(i, { kcal: e.target.value })} aria-label={`${i + 1}行目のkcal`} data-testid="manual-kcal" />
              {rows.length > 1 && (
                <button className="icon-btn" aria-label={`${i + 1}行目を削除`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </div>
            <div className="manual-pfc">
              {(["p", "f", "c"] as const).map((k) => (
                <label key={k} className="pfc-field">
                  <span>{k.toUpperCase()}</span>
                  <input className="num-input num-small" type="number" inputMode="decimal" placeholder="—" value={r[k]} onChange={(e) => update(i, { [k]: e.target.value })} aria-label={`${i + 1}行目の${k.toUpperCase()}（g・任意）`} />
                  <span className="unit-s">g</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button className="text-btn text-btn-left" onClick={() => setRows((prev) => [...prev, emptyRow()])} data-testid="manual-add">
        ＋ 品目を追加
      </button>

      <div className="sum-line">
        <span className="sum-label">合計</span>
        <span className="sum-value" data-testid="manual-total">
          {total.toLocaleString("ja-JP")}
          <span className="unit">kcal</span>
        </span>
      </div>
      {filled.length > 0 && problems.length > 0 && <p className="error small">確認してください：{problems.join("、")}</p>}
      <button className="btn btn-primary btn-block" disabled={!canRecord} onClick={record} data-testid="manual-record">
        記録する
      </button>
      {msg && (
        <p className={msg.kind === "ok" ? "ok-msg" : "error"} role="status" data-testid="manual-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
