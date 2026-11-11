/**
 * /stats?key=... 解析回数の日次集計（運営者向け）。
 * - 環境変数 STATS_TOKEN と ?key= が一致したときだけ表示。不一致・未設定なら 404（ページの存在を漏らさない）
 * - 直近30日の表と今月の合計。データは lib/server/stats.ts（Vercel KV）
 */
import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatsTable } from "../../components/StatsTable";
import { fetchStats, jstDate } from "../../lib/server/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "集計", robots: { index: false, follow: false } };

function tokenMatches(given: string | undefined): boolean {
  const expected = process.env.STATS_TOKEN?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const { key } = await searchParams;
  if (!tokenMatches(Array.isArray(key) ? key[0] : key)) notFound();

  const today = jstDate();
  const res = await fetchStats(30);

  return (
    <main className="stats">
      <h1 className="card-title">解析回数（日次・JST）</h1>
      <p className="muted small">
        Gemini を実際に呼んだ回数だけを数えています（モックは含みません）。ok＝食事の結果が返った／nofood＝食事と判断できなかった／err＝上流エラー・JSON崩れなど。テキストには飲み会モードの食べ物推定を含みます。
      </p>
      {res.status === "not_configured" && <p className="error">KV が未設定です（KV_REST_API_URL / KV_REST_API_TOKEN）。Vercel の Storage で KV を作成し、このプロジェクトに接続してください。</p>}
      {res.status === "error" && <p className="error">集計を読み込めませんでした：{res.message}</p>}
      {res.status === "ok" && (
        <>
          <StatsTable days={res.days} today={today} monthUsers={res.monthUsers} />
          <p className="muted small" data-testid="stats-users-note">
            ※ 使った人数は、端末ごとの匿名IDのユニーク数（端末数の近似）です。同じ人でも端末やブラウザが違えば別に数え、ブラウザのデータを消すと新しい人として数えます。プライベートモードなど ID を保存できない環境や、画面以外からの呼び出しは数えません。今月の合計行の人数は、日ごとの人数の合計ではなく「今月1回以上使った端末の数」です。人数の集計を始める前の日は 0 になります。
          </p>
        </>
      )}
      <p className="muted small">更新：{new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
    </main>
  );
}
