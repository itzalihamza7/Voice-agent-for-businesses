import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { BRAND } from "@/features/ui/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: `${BRAND} · AI phone agents for your business`, template: `%s · ${BRAND}` },
  description:
    "Build AI phone agents that answer questions, take bookings and use your own apps. Connect your website in minutes, without changing it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
