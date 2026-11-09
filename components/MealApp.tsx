"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyCorrection, type EatenPercent, type PortionMultiplier } from "../lib/client/correction";
import { addHistory, deleteHistory, loadHistory, type HistoryEntry } from "../lib/client/history";
import { consumeQuota, getQuota, FREE_MONTHLY_LIMIT } from "../lib/client/quota";
import { ImageTooLargeError, prepareUpload } from "../lib/client/resize";
import { PROMPT_VERSION } from "../lib/meal/prompt";
import type { MealAnalysis } from "../lib/meal/schema";
import { HistoryView } from "./HistoryView";
import { HomeView } from "./HomeView";
import { SettingsView } from "./SettingsView";
import type { Profile } from "../lib/client/energy";
import { loadProfile, saveProfile } from "../lib/client/profile";
import { loadSteps, saveSteps, type StepsByDate } from "../lib/client/steps";
import { ResultView } from "./ResultView";

type Tab = "home" | "analyze" | "history" | "settings";
type Status = "idle" | "preparing" | "ready" | "analyzing" | "done" | "error";

interface Upload {
  blob: Blob;
  fileName: string;
  previewUrl: string | null;
}

const QUOTA_MESSAGE = "今月の無料枠は終わりです。有料プランは準備中です";

export function MealApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [multipliers, setMultipliers] = useState<PortionMultiplier[]>([]);
  const [eatenPercent, setEatenPercent] = useState<EatenPercent>(100);
  const [recorded, setRecorded] = useState(false);
  const [quota, setQuota] = useState({ used: 0, limit: FREE_MONTHLY_LIMIT, remaining: FREE_MONTHLY_LIMIT, exhausted: false });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [steps, setSteps] = useState<StepsByDate>({});
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // localStorage はクライアントでのみ読む
  useEffect(() => {
    setQuota(getQuota());
    setHistory(loadHistory());
    setProfile(loadProfile());
    setSteps(loadSteps());
  }, []);

  // プレビュー URL の後片付け
  useEffect(() => () => void (upload?.previewUrl && URL.revokeObjectURL(upload.previewUrl)), [upload]);

  const corrected = useMemo(
    () => (analysis ? applyCorrection(analysis, multipliers, eatenPercent) : null),
    [analysis, multipliers, eatenPercent],
  );

  function reset() {
    setUpload(null);
    setAnalysis(null);
    setMultipliers([]);
    setEatenPercent(100);
    setRecorded(false);
    setError("");
    setStatus("idle");
    setQuota(getQuota());
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じ写真を選び直しても change が発火するように
    if (!file) return;
    reset();
    setStatus("preparing");
    try {
      setUpload(await prepareUpload(file));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ImageTooLargeError
          ? "この写真は大きすぎて読み込めませんでした。別の写真か、スクリーンショットでお試しください。"
          : "写真を読み込めませんでした。別の写真でお試しください。",
      );
    }
  }

  async function analyze() {
    if (!upload) return;
    const q = getQuota();
    setQuota(q);
    if (q.exhausted) return; // 上限到達時は解析しない

    setStatus("analyzing");
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", upload.blob, upload.fileName);
      const res = await fetch("/api/meal-analysis", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as (MealAnalysis & { message?: string }) | null;
      if (!res.ok || !body) {
        const fallback =
          res.status === 413
            ? "画像が大きすぎます。別の写真でお試しください。"
            : "解析できませんでした。少し時間をおいてもう一度お試しください。";
        throw new Error(body?.message || fallback);
      }
      setAnalysis(body);
      setIsMock(res.headers.get("x-meal-mock") === "1");
      setMultipliers(body.items.map(() => 1));
      // 結果が返ってきた回だけ数える。食事が写っていない結果（items が空）は数えない
      // （撮り直しで無料枠が減る理不尽さを避ける。API 費用は 1 回 0.17 円程度）
      setQuota(body.items.length > 0 ? consumeQuota() : getQuota());
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "解析できませんでした。");
    }
  }

  function record() {
    if (!analysis || !corrected || recorded) return;
    const { ok } = addHistory({
      promptVersion: PROMPT_VERSION,
      mock: isMock,
      confidence: analysis.confidence,
      note: analysis.note,
      eatenPercent: corrected.eatenPercent,
      isShared: analysis.is_shared,
      items: corrected.items,
      totals: corrected.totals,
      originalTotalKcal: analysis.total_kcal,
    });
    if (!ok) {
      setError("記録を保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。");
      return;
    }
    setRecorded(true);
    setHistory(loadHistory());
  }

  const busy = status === "preparing" || status === "analyzing";

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">ごはんスキャン</h1>
        <p className="tagline">写真から品目・カロリー・PFCを推定</p>
      </header>

      {isMock && analysis && (
        <div className="mock-banner" data-testid="mock-banner">
          MOCK：APIキー未設定のため、ダミーの解析結果を表示しています
        </div>
      )}

      <nav className="tabs" role="tablist">
        {(
          [
            ["home", "ホーム", "tab-home"],
            ["analyze", "解析", "tab-analyze"],
            ["history", "履歴", "tab-history"],
            ["settings", "設定", "tab-settings"],
          ] as const
        ).map(([key, label, testId]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? "on" : ""}`} onClick={() => setTab(key)} data-testid={testId}>
            {label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === "home" ? (
          <HomeView
            profile={profile}
            history={history}
            steps={steps}
            onSaveSteps={(date, v) => setSteps(saveSteps(date, v))}
            goSettings={() => setTab("settings")}
            goAnalyze={() => setTab("analyze")}
          />
        ) : tab === "settings" ? (
          <SettingsView
            profile={profile}
            onSave={(p) => {
              const ok = saveProfile(p);
              if (ok) setProfile(p);
              return ok;
            }}
          />
        ) : tab === "history" ? (
          <HistoryView history={history} onDelete={(id) => setHistory(deleteHistory(id))} />
        ) : (
          <>
            {!analysis && (
              <section className="card">
                <div className="quota" data-testid="quota">
                  今月の無料解析：残り <strong>{quota.remaining}</strong> / {quota.limit} 回
                </div>

                {quota.exhausted ? (
                  <p className="quota-over" data-testid="quota-over">
                    {QUOTA_MESSAGE}
                  </p>
                ) : (
                  <>
                    <div className="picker">
                      <button className="btn btn-primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
                        カメラで撮る
                      </button>
                      <button className="btn btn-secondary" onClick={() => libraryRef.current?.click()} disabled={busy}>
                        写真を選ぶ
                      </button>
                    </div>
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
                    <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden onChange={onFile} data-testid="file-input" />
                  </>
                )}

                {status === "preparing" && <p className="muted">写真を読み込んでいます…</p>}

                {upload && (
                  <div className="preview">
                    {upload.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ローカルの blob URL を表示するだけ
                      <img src={upload.previewUrl} alt="選択した食事の写真" />
                    ) : (
                      <div className="preview-placeholder">プレビューを表示できない形式です（{upload.fileName}）</div>
                    )}
                  </div>
                )}

                {upload && !quota.exhausted && (
                  <button className="btn btn-primary btn-block" onClick={analyze} disabled={busy} data-testid="analyze">
                    {status === "analyzing" ? "解析しています…" : "この写真を解析する"}
                  </button>
                )}
              </section>
            )}

            {error && (
              <p className="error" role="alert" data-testid="error">
                {error}
              </p>
            )}

            {analysis && corrected && (
              <ResultView
                analysis={analysis}
                corrected={corrected}
                multipliers={multipliers}
                onMultiplier={(i, m) => setMultipliers((prev) => prev.map((v, j) => (j === i ? m : v)))}
                onEatenPercent={setEatenPercent}
                onRecord={record}
                recorded={recorded}
                onReset={reset}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
