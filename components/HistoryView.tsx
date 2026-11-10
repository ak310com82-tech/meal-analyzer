"use client";

import { useEffect, useState } from "react";
import { canEditItems, groupByDay, MEMO_MAX, SOURCE_LABEL, type HistoryEntry } from "../lib/client/history";
import type { CorrectedItem } from "../lib/client/correction";
import { ItemEditor } from "./ItemEditor";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}月${d}日（${WEEK[date.getDay()]}）`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const len = (s: string) => Array.from(s).length;

interface Props {
  history: HistoryEntry[];
  onDelete: (id: string) => void;
  /** メモを保存。成功したら true */
  onMemo: (id: string, memo: string) => boolean;
  /** 品目の修正を保存。成功したら true */
  onEditItems: (id: string, items: CorrectedItem[]) => boolean;
}

export function HistoryView({ history, onDelete, onMemo, onEditItems }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <section className="card">
        <p className="muted">まだ記録はありません。食事を解析して「記録する」を押すと、ここに日ごとにまとまります。</p>
      </section>
    );
  }
  return (
    <div className="history" data-testid="history">
      {groupByDay(history).map((g) => (
        <section className="card day" key={g.date} data-testid="day">
          <div className="day-head">
            <h2 className="card-title">{dayLabel(g.date)}</h2>
            <div className="day-total" data-testid="day-total">
              {g.totals.kcal.toLocaleString()} <span className="unit">kcal</span>
            </div>
          </div>
          <div className="day-pfc">
            P {g.totals.protein_g}g ・ F {g.totals.fat_g}g ・ C {g.totals.carbs_g}g
          </div>
          <ul className="entries">
            {g.entries.map((e) => {
              const open = openId === e.id;
              const sourceLabel = SOURCE_LABEL[e.source ?? "photo"];
              return (
                <li className={`entry-wrap ${open ? "open" : ""}`} key={e.id} data-testid="entry">
                  <div className="entry">
                    <button
                      className="entry-main entry-toggle"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : e.id)}
                      data-testid="entry-open"
                    >
                      <span className="entry-time">
                        {timeLabel(e.createdAt)}
                        {sourceLabel && (
                          <span className="tag tag-source" data-testid="source-tag">
                            {sourceLabel}
                          </span>
                        )}
                        {e.eatenPercent != null && e.eatenPercent !== 100 && (
                          <span className="tag" data-testid="eaten-tag">
                            食べた割合 {e.eatenPercent}%
                          </span>
                        )}
                        {e.halfMode && <span className="tag">ハーフ</span>}
                        {e.isShared && <span className="tag">全量</span>}
                        {e.edited && <span className="tag tag-source">修正済み</span>}
                        {e.mock && <span className="tag tag-mock">MOCK</span>}
                      </span>
                      <span className="entry-items">{e.items.map((i) => i.name).join("、")}</span>
                      {e.memo && (
                        <span className="entry-memo" data-testid="entry-memo">
                          {e.memo}
                        </span>
                      )}
                    </button>
                    <div className="entry-kcal">{e.totals.kcal} kcal</div>
                    <button
                      className="icon-btn"
                      aria-label="この記録を削除"
                      data-testid="delete"
                      onClick={() => {
                        if (window.confirm("この記録を削除しますか？")) onDelete(e.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {open && <EntryDetail entry={e} onSave={(memo) => onMemo(e.id, memo)} onEditItems={(items) => onEditItems(e.id, items)} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="muted small">※ 写真は保存していません（数値と品目名のみ、この端末内に保存）。記録をタップすると内訳とメモが開きます。</p>
    </div>
  );
}

function EntryDetail({ entry, onSave, onEditItems }: { entry: HistoryEntry; onSave: (memo: string) => boolean; onEditItems: (items: CorrectedItem[]) => boolean }) {
  const [memo, setMemo] = useState(entry.memo ?? "");
  const [editing, setEditing] = useState(false);
  const [editMsg, setEditMsg] = useState<"" | "saved" | "error">("");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  useEffect(() => setMemo(entry.memo ?? ""), [entry.memo]);
  const over = len(memo) > MEMO_MAX;
  const dirty = memo.trim() !== (entry.memo ?? "");

  if (editing) {
    return (
      <div className="entry-detail" data-testid="entry-detail">
        <ItemEditor
          items={entry.items}
          lead={`記録した値（${entry.eatenPercent && entry.eatenPercent !== 100 ? `食べた割合 ${entry.eatenPercent}% をかけた後の値` : "確定した値"}）を直接直せます。合計は品目の合計で計算し直します。解析回数は使いません。`}
          onCancel={() => setEditing(false)}
          onSave={(rows) => {
            const items: CorrectedItem[] = rows.map((r) => ({ ...r.item, multiplier: r.src?.multiplier ?? 1 }));
            setEditMsg(onEditItems(items) ? "saved" : "error");
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="entry-detail" data-testid="entry-detail">
      <ul className="detail-items">
        {entry.items.map((it, i) => (
          <li key={i}>
            <span className="detail-name">
              {it.name}
              {it.amount && <span className="detail-amount">{it.amount}</span>}
            </span>
            <span className="detail-kcal">{it.kcal} kcal</span>
          </li>
        ))}
      </ul>
      <div className="detail-pfc">
        P {entry.totals.protein_g}g ・ F {entry.totals.fat_g}g ・ C {entry.totals.carbs_g}g
      </div>
      {entry.note && <p className="note">{entry.note}</p>}
      {canEditItems(entry) && (
        <button className="text-btn text-btn-left" onClick={() => setEditing(true)} data-testid="entry-edit">
          内容を修正
        </button>
      )}
      {editMsg === "saved" && <p className="ok-msg small" data-testid="entry-edit-msg">修正を保存しました</p>}
      {editMsg === "error" && <p className="error small">保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。</p>}

      <label className="field">
        <span className="field-label">メモ（自分用）</span>
        <textarea
          className="text-area"
          rows={3}
          value={memo}
          placeholder="例：会社の近くの定食屋。ごはん少なめで頼んだ"
          onChange={(ev) => {
            setMemo(ev.target.value);
            setState("idle");
          }}
          data-testid="memo-input"
        />
      </label>
      <div className="memo-foot">
        <span className={`memo-count ${over ? "over" : ""}`} data-testid="memo-count">
          {len(memo)} / {MEMO_MAX}
        </span>
        <button
          className="btn btn-primary memo-save"
          disabled={over || !dirty}
          onClick={() => setState(onSave(memo) ? "saved" : "error")}
          data-testid="memo-save"
        >
          メモを保存
        </button>
      </div>
      {state === "saved" && !dirty && <p className="ok-msg small">保存しました</p>}
      {state === "error" && <p className="error small">保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。</p>}
      {over && <p className="error small">{MEMO_MAX}文字以内にしてください。</p>}
    </div>
  );
}
