"use client";

import { groupByDay, type HistoryEntry } from "../lib/client/history";

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

export function HistoryView({ history, onDelete }: { history: HistoryEntry[]; onDelete: (id: string) => void }) {
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
            {g.entries.map((e) => (
              <li className="entry" key={e.id} data-testid="entry">
                <div className="entry-main">
                  <div className="entry-time">
                    {timeLabel(e.createdAt)}
                    {e.eatenPercent != null && e.eatenPercent !== 100 && (
                      <span className="tag" data-testid="eaten-tag">
                        食べた割合 {e.eatenPercent}%
                      </span>
                    )}
                    {e.halfMode && <span className="tag">ハーフ</span>}
                    {e.isShared && <span className="tag">全量</span>}
                    {e.mock && <span className="tag tag-mock">MOCK</span>}
                  </div>
                  <div className="entry-items">{e.items.map((i) => i.name).join("、")}</div>
                </div>
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
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">※ 写真は保存していません（数値と品目名のみ、この端末内に保存）。</p>
    </div>
  );
}
