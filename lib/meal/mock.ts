import type { GeminiCallResult } from "./gemini";

/**
 * GEMINI_API_KEY が無いときのダミー応答（ネットワークに出ない）。
 * ファイル名で動作確認用のシナリオを切り替えられる：
 *   - 名前に "nofood"   → 食事が写っていない場合の応答
 *   - 名前に "lowconf"  → confidence: low の応答
 *   - 名前に "shared"   → 鍋（全量・is_shared: true）の応答
 *   - 名前に "broken"   → JSON 崩れ（リトライ → 502 の確認用）
 *   - それ以外          → 定食の応答
 */
export async function callMock(fileName: string): Promise<GeminiCallResult> {
  await new Promise((r) => setTimeout(r, 400));
  const name = fileName.toLowerCase();
  const usage = { inputTokens: 1100, outputTokens: 320, thoughtsTokens: 0, imageTokens: 258 };

  if (name.includes("broken")) return { text: '{"items": [ {"name": "ごはん"', usage, finishReason: "MAX_TOKENS" };

  if (name.includes("nofood")) {
    return {
      text: JSON.stringify({
        items: [],
        total_kcal: 0,
        half_total_kcal: 0,
        is_shared: false,
        confidence: "low",
        note: "（MOCK）食事が写っていないため推定していません",
      }),
      usage,
      finishReason: "STOP",
    };
  }

  if (name.includes("shared")) {
    return {
      text: JSON.stringify({
        items: [
          { name: "（MOCK）寄せ鍋（鍋全体）", amount: "土鍋1つ 約3〜4人分", kcal: 1200, protein_g: 100, fat_g: 50, carbs_g: 80 },
          { name: "（MOCK）烏龍茶", amount: "グラス1杯 約300ml", kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0.3 },
        ],
        total_kcal: 1200,
        half_total_kcal: 600,
        is_shared: true,
        confidence: "medium",
        note: "（MOCK）鍋は全量として推定。手前の烏龍茶は本人分として計算",
      }),
      usage,
      finishReason: "STOP",
    };
  }

  const low = name.includes("lowconf");
  return {
    text: JSON.stringify({
      items: [
        { name: "（MOCK）ごはん", amount: "茶碗1杯 150g", kcal: 234, protein_g: 3.8, fat_g: 0.5, carbs_g: 55.7 },
        { name: "（MOCK）鶏の唐揚げ", amount: "4個 約120g", kcal: 340, protein_g: 20.1, fat_g: 21.6, carbs_g: 13.2 },
        { name: "（MOCK）味噌汁", amount: "1杯 約180ml", kcal: 40, protein_g: 2.4, fat_g: 1.2, carbs_g: 4.8 },
        { name: "（MOCK）キャベツの千切り", amount: "約50g", kcal: 11, protein_g: 0.7, fat_g: 0.1, carbs_g: 2.6 },
      ],
      total_kcal: 625,
      half_total_kcal: 313,
      is_shared: false,
      confidence: low ? "low" : "medium",
      note: low
        ? "（MOCK）暗くて品目の判別が難しいため確度は低めです。通常1人前として計算"
        : "（MOCK）通常1人前として計算。ごはんの量は茶碗の大きさから推定",
    }),
    usage,
    finishReason: "STOP",
  };
}

/**
 * テキスト解析のダミー応答。文章の中身でシナリオを切り替える：
 *   - 「カレー」→ カレーライス ／「親子丼」→ 親子丼（「味噌汁」もあれば追加）／「餃子」→ 餃子
 *   - 「天気」「こんにちは」「ありがとう」「nofood」→ 食事と判断できない（items 空）
 *   - 「broken」→ JSON 崩れ（リトライ → 502 の確認用）
 *   - それ以外 → 汎用の定食
 */
export async function callMockText(text: string): Promise<GeminiCallResult> {
  await new Promise((r) => setTimeout(r, 300));
  const usage = { inputTokens: 650, outputTokens: 260, thoughtsTokens: 0, imageTokens: null };
  const ok = (v: object): GeminiCallResult => ({ text: JSON.stringify(v), usage, finishReason: "STOP" });
  const t = text.toLowerCase();

  if (t.includes("broken")) return { text: '{"items": [', usage, finishReason: "MAX_TOKENS" };
  if (/天気|こんにちは|ありがとう|nofood/.test(t)) {
    return ok({ items: [], total_kcal: 0, half_total_kcal: 0, is_shared: false, confidence: "low", note: "（MOCK）食事の内容と判断できませんでした" });
  }

  const items: { name: string; amount: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number }[] = [];
  if (t.includes("カレー")) items.push({ name: "（MOCK）カレーライス", amount: "1皿 ごはん200g", kcal: 750, protein_g: 18, fat_g: 24, carbs_g: 110 });
  if (t.includes("親子丼")) items.push({ name: "（MOCK）親子丼", amount: "丼1杯 ごはん250g", kcal: 680, protein_g: 28, fat_g: 16, carbs_g: 100 });
  if (t.includes("餃子")) items.push({ name: "（MOCK）焼き餃子", amount: "3個 約75g", kcal: 120, protein_g: 4.5, fat_g: 6.6, carbs_g: 11 });
  if (t.includes("味噌汁")) items.push({ name: "（MOCK）味噌汁", amount: "1杯 約180ml", kcal: 40, protein_g: 2.4, fat_g: 1.2, carbs_g: 4.8 });
  if (!items.length) items.push({ name: "（MOCK）定食", amount: "1人前", kcal: 650, protein_g: 25, fat_g: 20, carbs_g: 85 });

  const total = items.reduce((a, i) => a + i.kcal, 0);
  return ok({
    items,
    total_kcal: total,
    half_total_kcal: Math.round(total / 2),
    is_shared: false,
    confidence: "medium",
    note: "（MOCK）テキストからの推定。通常1人前として計算",
  });
}
