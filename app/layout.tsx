import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arb Radar — Sportsbook vs Prediction Market Odds",
  description:
    "Compare Australian sportsbook odds against live Polymarket & Kalshi prices and spot arbitrage opportunities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
