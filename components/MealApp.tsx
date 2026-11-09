"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyCorrection, type EatenPercent, type PortionMultiplier } from "../lib/client/correction";
import { addHistory, deleteHistory, loadHistory, updateMemo, type HistoryEntry } from "../lib/client/history";
import { consumeQuota, getQuota, FREE_MONTHLY_LIMIT } from "../lib/client/quota";
import { ImageTooLargeError, prepareUpload } from "../lib/client/resize";
import { analyzePhoto, analyzeText } from "../lib/client/api";
import { ManualEntry } from "./ManualEntry";
import { PartyMode } from "./PartyMode";
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
type Method = "photo" | "text" | "manual" | "party";

const METHODS: { key: Method; label: string }[] = [
  { key: "photo", label: "写真" },
  { key: "text", label: "テキスト" },
  { key: "manual", label: "手入力" },
  { key: "party", label: "飲み会" },
];
const TEXT_MAX = 300;

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
  const [method, setMethod] = useState<Method>("photo");
  const [mealText, setMealText] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  /** 表示中の解析結果がどの入力方法・どのプロンプトから来たか（記録に残す） */
  const [analysisFrom, setAnalysisFrom] = useState<{ source: "photo" | "text"; promptVersion: string }>({ source: "photo", promptVersion: "" });
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

  /** 写真・テキスト共通：解析を投げて結果を画面に出す。食事の結果が返った回だけ回数を消費する */
  async function runAnalysis(source: "photo" | "text", call: () => ReturnType<typeof analyzeText>) {
    const q = getQuota();
    setQuota(q);
    if (q.exhausted) return; // 上限到達時は解析しない

    setStatus("analyzing");
    setError("");
    const res = await call();
    if (!res.ok) {
      setStatus("error");
      setError(res.message);
      return;
    }
    setAnalysis(res.result);
    setAnalysisFrom({ source, promptVersion: res.promptVersion });
    setIsMock(res.mock);
    setMultipliers(res.result.items.map(() => 1));
    // 食事と判断できない結果（items が空）は数えない（撮り直し・書き直しで無料枠が減る理不尽さを避ける）
    setQuota(res.result.items.length > 0 ? consumeQuota() : getQuota());
    setStatus("done");
  }

  const analyze = () => upload && runAnalysis("photo", () => analyzePhoto(upload.blob, upload.fileName));
  const analyzeMealText = () => mealText.trim() && runAnalysis("text", () => analyzeText(mealText.trim()));

  function record() {
    if (!analysis || !corrected || recorded) return;
    const { ok } = addHistory({
      source: analysisFrom.source,
      promptVersion: analysisFrom.promptVersion || undefined,
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
    if (analysisFrom.source === "text") setMealText("");
    setHistory(loadHistory());
  }

  const busy = status === "preparing" || status === "analyzing";

  return (
    <div className="app">
      {tab === "home" ? (
        <header className="header header-home" data-testid="header-home">
          <div className="header-text">
            <h1 className="logo">ごはんスキャン</h1>
            <p className="tagline">写真から品目・カロリー・PFCを推定</p>
            <p className="greeting">毎日のごはん記録を、そっと応援します</p>
          </div>
        </header>
      ) : (
        <header className="header">
          <h1 className="logo">ごはんスキャン</h1>
          <p className="tagline">写真から品目・カロリー・PFCを推定</p>
        </header>
      )}

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
          <HistoryView
            history={history}
            onDelete={(id) => setHistory(deleteHistory(id))}
            onMemo={(id, memo) => {
              const r = updateMemo(id, memo);
              if (r.ok) setHistory(r.list);
              return r.ok;
            }}
          />
        ) : (
          <>
            {!analysis && (
              <section className="card">
                <div className="quota" data-testid="quota">
                  今月の無料解析：残り <strong>{quota.remaining}</strong> / {quota.limit} 回
                </div>

                <div className="seg seg-4 method-seg" role="tablist" aria-label="入力方法">
                  {METHODS.map((m) => (
                    <button
                      key={m.key}
                      role="tab"
                      aria-selected={method === m.key}
                      className={`seg-btn ${method === m.key ? "on" : ""}`}
                      onClick={() => {
                        setMethod(m.key);
                        setError("");
                      }}
                      disabled={busy}
                      data-testid={`method-${m.key}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {(method === "photo" || method === "text") && quota.exhausted && (
                  <p className="quota-over" data-testid="quota-over">
                    {QUOTA_MESSAGE}
                  </p>
                )}

                {method === "photo" && !quota.exhausted && (
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

                    {upload && (
                      <button className="btn btn-primary btn-block" onClick={analyze} disabled={busy} data-testid="analyze">
                        {status === "analyzing" ? "解析しています…" : "この写真を解析する"}
                      </button>
                    )}
                  </>
                )}

                {method === "text" && !quota.exhausted && (
                  <div data-testid="text-mode">
                    <textarea
                      className="text-area"
                      rows={3}
                      maxLength={TEXT_MAX}
                      placeholder="例：親子丼と味噌汁／カレーライス大盛り／サラダとゆで卵2個"
                      value={mealText}
                      onChange={(e) => setMealText(e.target.value)}
                      aria-label="食べたもの"
                      data-testid="meal-text"
                    />
                    <p className="muted small">写真がないときに、食べたものを文章で入れて推定します（解析を1回使います）。量の指定（大盛り・○個など）も書けます。</p>
                    <button className="btn btn-primary btn-block" onClick={analyzeMealText} disabled={busy || !mealText.trim()} data-testid="analyze-text">
                      {status === "analyzing" ? "推定しています…" : "推定する"}
                    </button>
                  </div>
                )}

                {method === "manual" && <ManualEntry onRecorded={() => setHistory(loadHistory())} />}

                {method === "party" && (
                  <PartyMode
                    quotaExhausted={quota.exhausted}
                    onRecorded={() => {
                      setHistory(loadHistory());
                      setQuota(getQuota());
                    }}
                  />
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
                source={analysisFrom.source}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
