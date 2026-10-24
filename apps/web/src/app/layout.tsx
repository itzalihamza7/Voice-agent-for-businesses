import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { BRAND, TAGLINE } from "@/features/ui/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Display headings: an editorial serif, used sparingly (titles, the brand name).
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: { default: `${BRAND} · ${TAGLINE}`, template: `%s · ${BRAND}` },
  description:
    "AI phone agents that answer questions, quote and book through your own system, and hand over to your team. Connect your website in minutes, without changing it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
