import type { ReactNode } from "react";
import { CallDemo } from "@/features/marketing/CallDemo";
import { Logo } from "@/features/ui/Logo";

// Sign-in and sign-up: the form on the right, the product at work on the left.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col overflow-hidden bg-ink p-12 text-white lg:flex">
        <div className="grid-lines absolute inset-0" />
        <div className="absolute -top-40 -left-20 h-[32rem] w-[32rem] rounded-full bg-brand-600/30 blur-[110px]" />
        <div className="absolute -right-20 -bottom-40 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-[100px]" />
        <div className="relative">
          <Logo light />
        </div>
        <div className="relative my-auto py-12">
          <h2 className="max-w-md font-display text-5xl leading-[1.05] tracking-tight">
            Every call answered, <em className="text-brand-300">beautifully</em>.
          </h2>
          <div className="mt-10 max-w-md">
            <CallDemo tabs={false} />
          </div>
        </div>
        <p className="relative text-sm text-slate-500">
          Answers questions, books through your system, hands over to your team.
        </p>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
