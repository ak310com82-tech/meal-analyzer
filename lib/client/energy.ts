/**
 * カロリー収支の計算（純粋関数。すべてクライアント側で完結）。
 * どの数値も「目安・概算」であり、医療・治療目的には使わない前提。
 */

export type Sex = "male" | "female";

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** 任意 */
  targetWeightKg: number | null;
  /** 手入力の基礎代謝。null なら自動計算（Mifflin-St Jeor）を使う */
  bmrOverride: number | null;
}

/** 脂肪 1kg ≒ 7,200kcal */
export const KCAL_PER_KG = 7200;
/** 予測を出すのに必要な記録日数 */
export const MIN_DAYS_FOR_FORECAST = 3;
/** 平均に使う直近の記録日数 */
export const FORECAST_WINDOW_DAYS = 7;
/** この平均赤字（/日）を超えたら「ペースが急」と添える */
export const FAST_PACE_KCAL = 1000;

/** Mifflin-St Jeor 式 */
export function calcBmr(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === "male" ? base + 5 : base - 161);
}

/** 手入力があればそれを優先 */
export function effectiveBmr(p: Profile): { kcal: number; source: "auto" | "manual" } {
  return p.bmrOverride != null && p.bmrOverride > 0
    ? { kcal: Math.round(p.bmrOverride), source: "manual" }
    : { kcal: calcBmr(p), source: "auto" };
}

/**
 * 歩数 → 消費カロリー（平地歩行の概算）
 *   歩幅(cm) = 身長 × 0.45 ／ 距離(km) = 歩数 × 歩幅 ÷ 100,000 ／ kcal = 距離 × 体重 × 0.55
 */
export function walkKcal(steps: number, heightCm: number, weightKg: number) {
  const strideCm = heightCm * 0.45;
  const distanceKm = (steps * strideCm) / 100_000;
  return { strideCm, distanceKm, kcal: Math.round(distanceKm * weightKg * 0.55) };
}

/** 収支 = 基礎代謝 + 歩いたkcal − 食べたkcal（プラス＝消費のほうが多い＝減る方向） */
export function dailyBalance(bmr: number, walk: number, eaten: number): number {
  return Math.round(bmr + walk - eaten);
}

/**
 * 収支の表示。痩せる方向（収支プラス）は「−○○kcalペース」、増える方向は「＋○○kcalペース」。
 * 体重の増減の向きと記号をそろえて直感的に読めるようにする。
 */
export function formatBalance(balance: number): { label: string; direction: "down" | "up" | "even"; hint: string } {
  const n = Math.abs(Math.round(balance)).toLocaleString("ja-JP");
  if (balance > 0) return { label: `−${n}kcalペース`, direction: "down", hint: "消費のほうが多い日（体重が減る方向）" };
  if (balance < 0) return { label: `＋${n}kcalペース`, direction: "up", hint: "食べた分のほうが多い日（体重が増える方向）" };
  return { label: "±0kcalペース", direction: "even", hint: "食べた分と消費がちょうど同じくらい" };
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  eatenKcal: number;
  steps: number | null;
}

export type Forecast =
  | { kind: "not_enough"; daysRecorded: number }
  | {
      kind: "ok";
      daysUsed: number;
      avgBalance: number; // /日（プラス＝赤字＝減る方向）
      change30Kg: number; // 30日での変化（マイナス＝減る）
      fastPace: boolean;
      target:
        | null
        | { kind: "eta"; targetKg: number; days: number; date: Date }
        | { kind: "not_approaching"; targetKg: number }
        | { kind: "reached"; targetKg: number };
    };

/**
 * 直近の「記録のある日」最大 7 日分の平均収支から予測する。
 * days は「予測に使ってよい日」だけを渡すこと（呼び出し側で当日を除くかどうかを決める）。
 */
export function forecast(days: DayRecord[], profile: Profile, today: Date): Forecast {
  const recorded = days.filter((d) => d.eatenKcal > 0).sort((a, b) => b.date.localeCompare(a.date));
  if (recorded.length < MIN_DAYS_FOR_FORECAST) return { kind: "not_enough", daysRecorded: recorded.length };

  const bmr = effectiveBmr(profile).kcal;
  const used = recorded.slice(0, FORECAST_WINDOW_DAYS);
  const balances = used.map((d) =>
    dailyBalance(bmr, d.steps ? walkKcal(d.steps, profile.heightCm, profile.weightKg).kcal : 0, d.eatenKcal),
  );
  const avg = balances.reduce((a, b) => a + b, 0) / balances.length;
  const change30Kg = -(avg * 30) / KCAL_PER_KG;

  let target: Extract<Forecast, { kind: "ok" }>["target"] = null;
  const t = profile.targetWeightKg;
  if (t != null && t > 0) {
    if (profile.weightKg <= t) target = { kind: "reached", targetKg: t };
    else if (avg <= 0) target = { kind: "not_approaching", targetKg: t };
    else {
      const daysToGo = Math.ceil(((profile.weightKg - t) * KCAL_PER_KG) / avg);
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToGo);
      target = { kind: "eta", targetKg: t, days: daysToGo, date };
    }
  }

  return {
    kind: "ok",
    daysUsed: used.length,
    avgBalance: Math.round(avg),
    change30Kg: Math.round(change30Kg * 10) / 10,
    fastPace: avg > FAST_PACE_KCAL,
    target,
  };
}

/** 「3月15日頃」。年をまたぐときは「2027年3月15日頃」 */
export function formatEta(date: Date, today: Date): string {
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === today.getFullYear() ? `${md}頃` : `${date.getFullYear()}年${md}頃`;
}
