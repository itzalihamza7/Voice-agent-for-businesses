import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/features/ui/Logo";

const POINTS = [
  "Connect your website: pages, prices and booking system, unchanged",
  "Answers calls 24/7, books, and hands over to your team",
  "Every call transcribed, analysed and checked",
];

// Sign-in and sign-up: the form on the right, what the product does on the left.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <Logo light />
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight">
            An AI receptionist that already knows your business.
          </h2>
          <ul className="mt-8 space-y-3 text-slate-300">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-500">
          Built for service businesses that live on the phone.
        </p>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
