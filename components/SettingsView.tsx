"use client";

import { useState } from "react";
import { calcBmr, type Profile, type Sex } from "../lib/client/energy";
import { validateProfile } from "../lib/client/profile";

const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function SettingsView({ profile, onSave }: { profile: Profile | null; onSave: (p: Profile) => boolean }) {
  const [sex, setSex] = useState<Sex | "">(profile?.sex ?? "");
  const [age, setAge] = useState(profile ? String(profile.age) : "");
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : "");
  const [weight, setWeight] = useState(profile ? String(profile.weightKg) : "");
  const [target, setTarget] = useState(profile?.targetWeightKg != null ? String(profile.targetWeightKg) : "");
  const [manual, setManual] = useState(profile?.bmrOverride != null);
  const [bmrText, setBmrText] = useState(profile?.bmrOverride != null ? String(profile.bmrOverride) : "");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ready = sex !== "" && [age, height, weight].every((s) => Number.isFinite(toNum(s)) && toNum(s) > 0);
  const autoBmr = ready ? calcBmr({ sex: sex as Sex, age: toNum(age), heightCm: toNum(height), weightKg: toNum(weight) }) : null;

  function save() {
    if (sex === "") return setMsg({ kind: "err", text: "性別を選んでください。" });
    const p: Profile = {
      sex,
      age: toNum(age),
      heightCm: toNum(height),
      weightKg: toNum(weight),
      targetWeightKg: target.trim() === "" ? null : toNum(target),
      bmrOverride: manual ? toNum(bmrText) : null,
    };
    if (manual && !Number.isFinite(p.bmrOverride)) return setMsg({ kind: "err", text: "手入力の基礎代謝を入れてください。" });
    const v = validateProfile(p);
    if (v) return setMsg({ kind: "err", text: v });
    setMsg(onSave(p) ? { kind: "ok", text: "保存しました" } : { kind: "err", text: "保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）。" });
  }

  return (
    <section className="card" data-testid="settings">
      <h2 className="card-title">プロフィール</h2>
      <p className="muted small">基礎代謝と歩数の消費カロリーの計算に使います。この端末内にだけ保存されます。</p>

      <div className="field">
        <div className="field-label">性別</div>
        <div className="seg" role="radiogroup" aria-label="性別">
          {(
            [
              ["male", "男性"],
              ["female", "女性"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={sex === v} className={`seg-btn ${sex === v ? "on" : ""}`} onClick={() => setSex(v)} data-testid={`sex-${v}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <NumField label="年齢" unit="歳" value={age} onChange={setAge} testId="age" />
      <NumField label="身長" unit="cm" value={height} onChange={setHeight} testId="height" step="0.1" />
      <NumField label="体重" unit="kg" value={weight} onChange={setWeight} testId="weight" step="0.1" />
      <NumField label="目標体重（任意）" unit="kg" value={target} onChange={setTarget} testId="target" step="0.1" />

      <div className="field bmr-box">
        <div className="field-label">基礎代謝</div>
        <div className="bmr-auto" data-testid="bmr-auto">
          自動計算：{autoBmr != null ? <strong>{autoBmr.toLocaleString("ja-JP")} kcal</strong> : "性別・年齢・身長・体重を入れると表示"}
        </div>
        <p className="muted small">Mifflin-St Jeor 式による推定値です。</p>
        <div className="seg" role="radiogroup" aria-label="基礎代謝の決め方">
          <button role="radio" aria-checked={!manual} className={`seg-btn ${!manual ? "on" : ""}`} onClick={() => setManual(false)} data-testid="bmr-mode-auto">
            自動計算を使う
          </button>
          <button
            role="radio"
            aria-checked={manual}
            className={`seg-btn ${manual ? "on" : ""}`}
            onClick={() => {
              setManual(true);
              if (!bmrText && autoBmr != null) setBmrText(String(autoBmr));
            }}
            data-testid="bmr-mode-manual"
          >
            手入力
          </button>
        </div>
        {manual && <NumField label="手入力の基礎代謝" unit="kcal" value={bmrText} onChange={setBmrText} testId="bmr-manual" />}
      </div>

      <button className="btn btn-primary btn-block" onClick={save} data-testid="profile-save">
        保存する
      </button>
      {msg && (
        <p className={msg.kind === "ok" ? "ok-msg" : "error"} role="status" data-testid="profile-msg">
          {msg.text}
        </p>
      )}
    </section>
  );
}

function NumField({ label, unit, value, onChange, testId, step = "1" }: { label: string; unit: string; value: string; onChange: (v: string) => void; testId: string; step?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-row">
        <input className="num-input" type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
        <span className="steps-unit">{unit}</span>
      </span>
    </label>
  );
}
