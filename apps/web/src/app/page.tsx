import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Globe,
  PhoneCall,
  Plug,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/features/ui/Logo";
import { BRAND } from "@/features/ui/brand";

const FEATURES = [
  {
    icon: Globe,
    title: "Learns from your website",
    text: "Type your address: your pages become the agent's knowledge, so it answers with your prices, areas and policies.",
  },
  {
    icon: Plug,
    title: "Works with your app",
    text: "Connects to the booking system your website already uses. Quotes, bookings and cancellations, with no changes on your side.",
  },
  {
    icon: CalendarCheck,
    title: "Books while you sleep",
    text: "Takes the details one question at a time, reads them back, and confirms with a real booking reference.",
  },
  {
    icon: Workflow,
    title: "A flow you control",
    text: "See and edit every step in a visual builder: what it asks, which tools it uses, when it hands over to your team.",
  },
  {
    icon: BarChart3,
    title: "Every call measured",
    text: "Transcripts, outcomes, cost per call and the topics callers ask about, plus automatic quality checks.",
  },
  {
    icon: ShieldCheck,
    title: "Safe by design",
    text: "Prices and availability only ever come from your system, never invented. Versions, rollbacks and A/B tests built in.",
  },
];

const STEPS = [
  { title: "Type your website", text: "We read your pages and find your booking API." },
  {
    title: "Check your agent",
    text: "A ready agent appears. Try it in the test chat and tweak it.",
  },
  { title: "Connect a number", text: "Point a phone number at it and it starts answering calls." },
];

// The public home page. Signed-in people are sent straight to their agents by the proxy.
export default function LandingPage() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-4xl rounded-full bg-gradient-to-tr from-brand-200 via-violet-200 to-sky-100 opacity-60 blur-3xl" />
        <div className="mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
          <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            <PhoneCall className="h-3.5 w-3.5" /> AI phone agents for service businesses
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            Never miss a booking call again.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {BRAND} answers your phone like your best receptionist: it knows your business from your
            website, quotes and books through your own system, and hands over to your team when it
            should.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">
              Create your agent <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            No code and no changes to your website. Just your address.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">
          Everything a front desk does, on the phone
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900">
            Live in three steps
          </h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-8 py-14 text-center">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
          <BookOpen className="relative mx-auto h-8 w-8 text-brand-300" />
          <h2 className="relative mt-4 text-3xl font-semibold tracking-tight text-white">
            Your website already has the answers.
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-slate-300">
            Let your phone use them. Set up takes a few minutes.
          </p>
          <Link href="/signup" className="btn-primary relative mt-8 px-6 py-3 text-base">
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500">
          <Logo />
          <span>
            © {new Date().getFullYear()} {BRAND}
          </span>
        </div>
      </footer>
    </div>
  );
}
