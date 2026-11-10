import type { Metadata, Viewport } from "next";
import { Kaisei_Decol, Zen_Kaku_Gothic_New } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

/**
 * フォントは next/font/google で読み込む（ビルド時に取得して自前配信。実行時に Google へは問い合わせない）。
 * 日本語フォントはサブセット指定ができないため preload: false。
 */
const display = Kaisei_Decol({
  weight: ["400", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-kaisei",
});

const body = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-zen",
});

export const metadata: Metadata = {
  title: "ごはんスキャン｜食事写真からカロリー・PFCを推定",
  description: "食事の写真から品目・カロリー・PFCをAIで推定するツール（推定値です）",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        {/* Vercel Web Analytics（ページビューの集計のみ。Vercel ダッシュボードで有効化が必要） */}
        <Analytics />
      </body>
    </html>
  );
}
