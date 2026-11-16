import { MealApp } from "../components/MealApp";
import { Disclaimer } from "../components/Disclaimer";

export default function Page() {
  return (
    <>
      <MealApp />
      <footer className="footer">
        <Disclaimer />
        <p className="small">写真は解析のためにだけ送信され、保存しません。記録は数値と品目名のみ、この端末内に保存されます。</p>
        <p className="small">
          <a href="https://forms.gle/mdsp93tjEktwkZUMA" target="_blank" rel="noopener noreferrer">ご意見・ご要望はこちら</a>
          （ご意見・ご要望には柔軟に対応します）
        </p>
      </footer>
    </>
  );
}
