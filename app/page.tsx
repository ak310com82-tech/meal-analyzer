import { MealApp } from "../components/MealApp";
import { Disclaimer } from "../components/Disclaimer";

export default function Page() {
  return (
    <>
      <MealApp />
      <footer className="footer">
        <Disclaimer />
        <p className="small">写真は解析のためにだけ送信され、保存しません。記録は数値と品目名のみ、この端末内に保存されます。</p>
      </footer>
    </>
  );
}
