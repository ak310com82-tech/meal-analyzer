/** 日別の歩数（localStorage、手入力のみ）。キーは端末のローカル日付 YYYY-MM-DD */
import { readJson, writeJson } from "./storage";

const KEY = "meal-analyzer:steps:v1";

export type StepsByDate = Record<string, number>;

export function loadSteps(): StepsByDate {
  const s = readJson<StepsByDate>(KEY, {});
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
}

/** steps が null なら、その日の入力を消す */
export function saveSteps(date: string, steps: number | null): StepsByDate {
  const next = { ...loadSteps() };
  if (steps == null) delete next[date];
  else next[date] = Math.max(0, Math.round(steps));
  writeJson(KEY, next);
  return next;
}
