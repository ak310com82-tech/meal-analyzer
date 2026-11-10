import { summarize, type DayStats } from "../lib/server/stats";

/** /stats の表（サーバーコンポーネントから使う。状態を持たない） */
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const label = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
};
const n = (v: number) => v.toLocaleString("ja-JP");

export function StatsTable({ days, today }: { days: { date: string; stats: DayStats }[]; today: string }) {
  const month = today.slice(0, 7);
  const inMonth = days.filter((d) => d.date.startsWith(month));
  const last30 = days.slice(0, 30);
  const monthSum = inMonth.reduce(
    (a, d) => {
      const s = summarize(d.stats);
      return { photoOk: a.photoOk + s.photoOk, textOk: a.textOk + s.textOk, nofood: a.nofood + s.nofood, err: a.err + s.err, total: a.total + s.total };
    },
    { photoOk: 0, textOk: 0, nofood: 0, err: 0, total: 0 },
  );
  const [y, m] = month.split("-").map(Number);

  return (
    <table className="stats-table" data-testid="stats-table">
      <thead>
        <tr>
          <th scope="col">日付</th>
          <th scope="col">写真 ok</th>
          <th scope="col">テキスト ok</th>
          <th scope="col">nofood 合計</th>
          <th scope="col">err 合計</th>
          <th scope="col">合計</th>
        </tr>
      </thead>
      <tbody>
        {last30.map(({ date, stats }) => {
          const s = summarize(stats);
          return (
            <tr key={date} className={s.total === 0 ? "zero" : ""}>
              <th scope="row">
                {label(date)}
                {date === today && <span className="stats-today">今日</span>}
              </th>
              <td>{n(s.photoOk)}</td>
              <td>{n(s.textOk)}</td>
              <td>{n(s.nofood)}</td>
              <td className={s.err > 0 ? "warn" : ""}>{n(s.err)}</td>
              <td className="total">{n(s.total)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr data-testid="stats-month">
          <th scope="row">
            {y}年{m}月の合計
          </th>
          <td>{n(monthSum.photoOk)}</td>
          <td>{n(monthSum.textOk)}</td>
          <td>{n(monthSum.nofood)}</td>
          <td>{n(monthSum.err)}</td>
          <td className="total">{n(monthSum.total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
