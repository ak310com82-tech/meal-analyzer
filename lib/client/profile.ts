/** プロフィール（localStorage）。サーバーには送らない。 */
import type { Profile } from "./energy";
import { readJson, writeJson } from "./storage";

const KEY = "meal-analyzer:profile:v1";

export function loadProfile(): Profile | null {
  const p = readJson<Profile | null>(KEY, null);
  if (!p || (p.sex !== "male" && p.sex !== "female")) return null;
  if (![p.age, p.heightCm, p.weightKg].every((n) => typeof n === "number" && n > 0)) return null;
  return { ...p, targetWeightKg: p.targetWeightKg ?? null, bmrOverride: p.bmrOverride ?? null };
}

export function saveProfile(p: Profile): boolean {
  return writeJson(KEY, p);
}

/** 入力値の範囲チェック。問題があれば日本語のメッセージを返す */
export function validateProfile(p: Profile): string | null {
  if (!(p.age >= 10 && p.age <= 100)) return "年齢は10〜100の数字で入れてください。";
  if (!(p.heightCm >= 100 && p.heightCm <= 230)) return "身長は100〜230cmの範囲で入れてください。";
  if (!(p.weightKg >= 25 && p.weightKg <= 250)) return "体重は25〜250kgの範囲で入れてください。";
  if (p.targetWeightKg != null && !(p.targetWeightKg >= 25 && p.targetWeightKg <= 250))
    return "目標体重は25〜250kgの範囲で入れてください（空欄でもOK）。";
  if (p.bmrOverride != null && !(p.bmrOverride >= 500 && p.bmrOverride <= 4000))
    return "手入力の基礎代謝は500〜4,000kcalの範囲で入れてください。";
  return null;
}
