# ごはんスキャン（AI食事写真解析ツール 単体版 MVP）

写真を送ると、品目・推定量・カロリー・PFC が返ってくるだけの単体ツール。
Next.js（App Router）＋ TypeScript、Vercel デプロイ前提、モバイルファースト。
※「ごはんスキャン」は仮の名前です。

## セットアップ
```bash
npm install
cp .env.example .env.local   # GEMINI_API_KEY を記入（空ならモック動作）
npm run dev                  # http://localhost:3000
npm run build                # 本番ビルド確認（webpack 方式）
```
Vercel：Project Settings → Environment Variables に `GEMINI_API_KEY` を登録するだけ。

> ビルドは webpack 方式（`next build --webpack`）に固定しています。Next.js 16 の既定の Turbopack は、`next/font/google` の読み込みで "Can't resolve '@vercel/turbopack-next/internal/font/google/font'" となりビルドが失敗するためです。Vercel も package.json の build スクリプトを使うので、この指定で統一されます。

## 固定の前提（実測にもとづく。変更しないこと）
| 項目 | 値 | 場所 |
|---|---|---|
| モデル | `gemini-3.5-flash-lite` | lib/meal/gemini.ts |
| thinkingConfig | **入れない**（thinkingBudget 指定で HTTP 400） | lib/meal/gemini.ts |
| temperature / responseMimeType | 0 / application/json | lib/meal/gemini.ts |
| 画像前処理 | 向き補正 → 長辺 768px → JPEG 品質 80（sharp） | lib/meal/preprocess.ts |
| プロンプト | v3（全文固定。鍋・大皿は全量＋is_shared） | lib/meal/prompt.ts |

## カロリー収支（ホーム・設定タブ）
すべてブラウザ内（localStorage）で計算。サーバー・API の追加なし。
- **基礎代謝**：Mifflin-St Jeor 式（男性 10×体重+6.25×身長−5×年齢+5／女性 …−161）。設定で手入力に切り替え可、「自動計算を使う」で戻せる
- **歩数**：今日の歩数を手入力（自動連携なし）。歩幅=身長×0.45、距離=歩数×歩幅÷100,000、kcal=距離×体重×0.55（平地歩行の概算）
- **今日の収支**：基礎代謝＋歩いたkcal−食べたkcal。プラス（減る方向）は「−○○kcalペース」、マイナスは「＋○○kcalペース」
- **予測**：昨日までの「記録のある日」直近最大7日の平均収支から。30日の増減（7,200kcal/kg）と、目標体重の到達目安日。3日分未満は出さない。平均赤字1,000kcal超で「ペースが急です」を添える
  - 当日は食事の途中なので予測には含めない（含めると朝のうちは大きな赤字に見えて予測が過大になるため）

## 構成
```
app/
  api/meal-analysis/route.ts  解析API（multipart の image を受けて JSON を返す）
  page.tsx / layout.tsx / globals.css
components/
  MealApp.tsx      画面本体（ホーム／解析／履歴／設定のタブ）
  HomeView.tsx     今日の収支・歩数・このままいくと
  SettingsView.tsx プロフィールと基礎代謝（自動／手入力）
  ResultView.tsx   結果表示と量補正（半分／普通／大盛り、ハーフサイズ切替）
  HistoryView.tsx  日別履歴・日次合計・個別削除
  Disclaimer.tsx   免責文
lib/meal/          解析エンジン（Next.js 非依存 → そだてるダイエット本体へこのフォルダごと移植可）
  prompt.ts / schema.ts（厳密パース）/ preprocess.ts / gemini.ts / mock.ts / analyze.ts（リトライ・ログ）
lib/client/        ブラウザ側ロジック
  correction.ts（量補正の計算）/ history.ts / quota.ts（月5回）/ resize.ts（送信前縮小）/ storage.ts
  energy.ts（基礎代謝・歩数・収支・予測の計算）/ profile.ts / steps.ts
```

## API：`POST /api/meal-analysis`
- 入力：multipart/form-data、フィールド名 `image`（JPEG / PNG / WebP / HEIC）
- 成功：200、本文は解析 JSON そのまま（items / total_kcal / half_total_kcal / is_shared / confidence / note）。モック時はヘッダ `x-meal-mock: 1`
- 失敗：`{ error, message }`
  | ステータス | error | 状況 |
  |---|---|---|
  | 400 | no_image / bad_request | 画像なし |
  | 413 | too_large | 4MB 超（Vercel の本文上限 4.5MB に合わせた安全値） |
  | 415 | unsupported_type / unreadable_image | 非対応形式・読めない画像（HEIC を含む、下記） |
  | 502 | parse_failed | JSON 崩れ・スキーマ違反が 2 回続いた（1 回だけリトライ） |
  | 502 / 503 | upstream_error / busy | Gemini API のエラー / 429 |
- コスト監視：1 呼び出しごとに `{"event":"meal_analysis_call", model, promptVersion, attempt, ok, latencyMs, usage:{inputTokens, outputTokens, thoughtsTokens, imageTokens}, image:{width,height,bytes}}` を 1 行 JSON でサーバーログに出力（Vercel の Logs で `meal_analysis_call` 検索）

## 仕様メモ
- **大きな写真**：Vercel は 4.5MB を超えるリクエストを関数に届く前に弾くため、ブラウザで長辺 1536px に軽く縮めてから送る（lib/client/resize.ts）。最終的な 768px・品質80 への変換はサーバーの sharp が行う
- **HEIC**：npm 版 sharp の標準ビルドは HEIC（HEVC）を読めない。iPhone は写真選択時に通常 JPEG へ変換され、Safari ではブラウザ側縮小でも JPEG になるので実害は小さい。読めない HEIC が届いた場合は 415 と案内文を返す
- **回数制限**：月 5 回、localStorage で端末ごとに数える **MVP の簡易実装**（データ削除で回避できる。本格運用ではサーバー側で管理）。食事の結果が返った回だけ数える。「食事が写っていない」結果・エラー・JSON崩れの回は数えない
- **履歴**：localStorage。写真・サムネイルは保存しない（数値と品目名、補正後の値のみ）
- **量補正**：品目ごとに ×0.5 / ×1 / ×1.5、さらに「食べた割合」（全部100% / 3/4 / 半分 / 1/3 / 1/4）を全品目に掛ける。is_shared（鍋・大皿）のときは割合を結果の上部に目立たせる。旧「全体がハーフサイズ」トグルは廃止（half_total_kcal は API の返却にだけ残る）。履歴には割合（％）を保存

## モック（GEMINI_API_KEY 未設定時）
画面上部に「MOCK」バナー、履歴にも MOCK タグが出る。ファイル名で動作確認用のシナリオを切り替えられる：
`nofood` を含む → 食事なし ／ `lowconf` → 確度 low ／ `shared` → 鍋（全量・is_shared）／ `broken` → JSON 崩れ（リトライ後 502）／ それ以外 → 定食
