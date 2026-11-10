"use client";

import { useState } from "react";

/**
 * 品目の手修正（結果画面・履歴詳細で共通）。名前・kcal・P・F・C を編集、品目の追加・削除ができる。
 * API は呼ばない・回数も変えない。品目 0 件では保存できない。
 * 見た目は手入力（ManualEntry）と同じ部品を使う。
 */
export interface EditableItem {
  name: string;
  amount: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

interface Row<T> {
  name: string;
  kcal: string;
  p: string;
  f: string;
  c: string;
  /** 元の品目（量の文字列や倍率などをそのまま引き継ぐ）。追加した行は undefined */
  src?: T;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const toRow = <T extends EditableItem>(it: T): Row<T> => ({ name: it.name, kcal: String(it.kcal), p: String(it.protein_g), f: String(it.fat_g), c: String(it.carbs_g), src: it });

export function ItemEditor<T extends EditableItem>({
  items,
  onSave,
  onCancel,
  lead,
  sumLabel = "合計",
}: {
  items: T[];
  /** 保存。src があればその他の項目を引き継いだ品目、追加行は src なし */
  onSave: (rows: { item: EditableItem; src?: T }[]) => void;
  onCancel: () => void;
  lead?: string;
  sumLabel?: string;
}) {
  const [rows, setRows] = useState<Row<T>[]>(() => items.map(toRow));

  const filled = rows.filter((r) => [r.name, r.kcal, r.p, r.f, r.c].some((v) => v.trim() !== ""));
  const problems = rows.flatMap((r, i) => {
    if (![r.name, r.kcal, r.p, r.f, r.c].some((v) => v.trim() !== "")) return [];
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
  const canSave = filled.length > 0 && problems.length === 0;

  const update = (i: number, patch: Partial<Row<T>>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    if (!canSave) return;
    onSave(
      filled.map((r) => ({
        src: r.src,
        item: {
          name: r.name.trim(),
          amount: r.src?.amount ?? "",
          kcal: Math.round(Number(r.kcal)),
          protein_g: r1(num(r.p) ?? 0),
          fat_g: r1(num(r.f) ?? 0),
          carbs_g: r1(num(r.c) ?? 0),
        },
      })),
    );
  }

  return (
    <div className="item-editor" data-testid="item-editor">
      {lead && <p className="muted small">{lead}</p>}
      <ol className="manual-rows">
        {rows.map((r, i) => (
          <li className="manual-row" key={i} data-testid="edit-row">
            <div className="manual-main">
              <input className="text-input" placeholder="品目名" value={r.name} maxLength={40} onChange={(e) => update(i, { name: e.target.value })} aria-label={`${i + 1}行目の品目名`} data-testid="edit-name" />
              <input className="num-input num-kcal" type="number" inputMode="numeric" placeholder="kcal" value={r.kcal} onChange={(e) => update(i, { kcal: e.target.value })} aria-label={`${i + 1}行目のkcal`} data-testid="edit-kcal" />
              <button className="icon-btn" aria-label={`${i + 1}行目を削除`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} data-testid="edit-remove">
                ×
              </button>
            </div>
            <div className="manual-pfc">
              {(["p", "f", "c"] as const).map((k) => (
                <label key={k} className="pfc-field">
                  <span>{k.toUpperCase()}</span>
                  <input className="num-input num-small" type="number" inputMode="decimal" placeholder="—" value={r[k]} onChange={(e) => update(i, { [k]: e.target.value } as Partial<Row<T>>)} aria-label={`${i + 1}行目の${k.toUpperCase()}（g）`} data-testid={`edit-${k}`} />
                  <span className="unit-s">g</span>
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <button className="text-btn text-btn-left" onClick={() => setRows((prev) => [...prev, { name: "", kcal: "", p: "", f: "", c: "" }])} data-testid="edit-add">
        ＋ 品目を追加
      </button>
      <div className="sum-line">
        <span className="sum-label">{sumLabel}</span>
        <span className="sum-value" data-testid="edit-total">
          {total.toLocaleString("ja-JP")}
          <span className="unit">kcal</span>
        </span>
      </div>
      {filled.length === 0 && <p className="error small">品目が0件では保存できません。</p>}
      {problems.length > 0 && <p className="error small">確認してください：{problems.join("、")}</p>}
      <div className="editor-actions">
        <button className="btn btn-secondary" onClick={onCancel} data-testid="edit-cancel">
          やめる
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!canSave} data-testid="edit-save">
          修正を保存
        </button>
      </div>
    </div>
  );
}
