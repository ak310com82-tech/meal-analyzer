export const DISCLAIMER_TEXT =
  "カロリー・PFCはAIの推定値です（誤差の目安 ±20〜30%）。医療・治療目的の判断には使わないでください";

export function Disclaimer({ className = "" }: { className?: string }) {
  return <p className={`disclaimer ${className}`}>{DISCLAIMER_TEXT}</p>;
}
