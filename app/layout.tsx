import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SemaBI — AI Banking Insight Engine",
  description: "Domain AI insight layer on top of certified Power BI semantic models for commercial banking (CBN prudential).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
