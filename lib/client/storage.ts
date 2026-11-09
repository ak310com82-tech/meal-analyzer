/** localStorage の安全なラッパー（プライベートブラウズ等で例外が出ても画面を落とさない） */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 端末のローカル時刻での YYYY-MM-DD / YYYY-MM */
export function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function localMonthKey(d: Date): string {
  return localDateKey(d).slice(0, 7);
}
