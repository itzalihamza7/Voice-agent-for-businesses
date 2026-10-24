import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Globe,
  KeyRound,
  Lock,
  PhoneForwarded,
  Plug,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { CallDemo } from "@/features/marketing/CallDemo";
import { ProductTour } from "@/features/marketing/ProductTour";
import { TestChatVisual } from "@/features/marketing/visuals";
import { Waveform } from "@/features/marketing/Waveform";
import { Logo } from "@/features/ui/Logo";
import { BRAND } from "@/features/ui/brand";

const INDUSTRIES = [
  "Chauffeurs & taxis",
  "Dental & clinics",
  "Salons & spas",
  "Restaurants",
  "Hotels",
  "Property",
  "Home services",
  "Car rental",
  "Fitness studios",
  "Vets",
];

const STACK = [
  "Twilio",
  "OpenAI",
  "Ollama",
  "OpenAPI",
  "MCP",
  "Webhooks",
  "PostgreSQL",
  "pgvector",
  "LangGraph",
];

const TRUST = [
  {
    icon: KeyRound,
    title: "Encrypted credentials",
    text: "API keys are encrypted at rest and never shown again.",
  },
  {
    icon: UserCheck,
    title: "Roles for your team",
    text: "Owners, editors and viewers, each business kept apart.",
  },
  {
    icon: ShieldCheck,
    title: "Guardrails on every call",
    text: "Card numbers redacted, prompt injection refused.",
  },
  {
    icon: RotateCcw,
    title: "Versions and rollback",
    text: "Nothing goes live untested; one click to undo.",
  },
];

const FAQ = [
  {
    q: "Do I need to change my website?",
    a: "No. You type its address; we read the pages and use the same booking system your website already calls. Your website stays exactly as it is.",
  },
  {
    q: "How does it know my prices and availability?",
    a: "From your own system, live, on every call. The agent is not allowed to guess a price or a time: if your system doesn't say it, the agent doesn't either.",
  },
  {
    q: "What happens when it doesn't know an answer?",
    a: "It says so and offers a call back or puts the caller through to your team. Answers only come from your pages and your system.",
  },
  {
    q: "Can callers still reach a person?",
    a: "Always. Asking for a person, or a call that needs one, is handed over to the number you choose, with a summary of the call so far.",
  },
  {
    q: "Which phone numbers work?",
    a: `Any number you can point at ${BRAND} through Twilio, including the one you have today with call forwarding.`,
  },
];

// The public home page. Signed-in people are sent straight to their agents by the proxy.
export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-ink/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Logo light />
          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#how" className="hover:text-white">
              How it works
            </a>
            <a href="#product" className="hover:text-white">
              Product
            </a>
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn text-slate-300 hover:text-white">
              Sign in
            </Link>
            <Link href="/signup" className="btn-light">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative -mt-[73px] overflow-hidden bg-ink pt-[73px] text-white">
        <div className="grid-lines absolute inset-0" />
        <div className="absolute -top-40 left-1/2 h-[42rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/10 blur-[100px]" />
        <div className="absolute -bottom-32 -left-40 h-[26rem] w-[26rem] rounded-full bg-amber-400/10 blur-[100px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 pt-20 pb-28 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
          <div className="text-center lg:text-left">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-3 pl-1 text-xs text-slate-300 backdrop-blur hover:bg-white/10"
            >
              <span className="rounded-full bg-brand-500 px-2 py-0.5 font-medium text-white">
                New
              </span>
              Set up your agent from your website
              <ArrowRight className="h-3 w-3" />
            </Link>
            <h1 className="mt-7 font-display text-6xl leading-[1.02] tracking-tight sm:text-7xl xl:text-[5.5rem]">
              The front desk that{" "}
              <em className="bg-linear-to-r from-brand-300 via-fuchsia-300 to-amber-200 bg-clip-text pr-2 text-transparent">
                never
              </em>{" "}
              misses a call.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">
              {BRAND} answers your phone like your best receptionist. It knows your business from
              your website, quotes and books through your own system, and hands over to your team
              when it should.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/signup" className="btn-light px-6 py-3 text-base">
                Create your agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="btn-glass px-6 py-3 text-base">
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400 lg:justify-start">
              {["No code", "No changes to your website", "Answers 24/7"].map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-brand-300" /> {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:mr-0">
            <div className="absolute -inset-6 rounded-[2rem] bg-linear-to-br from-brand-500/20 via-transparent to-fuchsia-500/10 blur-2xl" />
            <div className="relative">
              <CallDemo />
            </div>
            <div className="glass absolute -right-8 bottom-28 hidden animate-float items-center gap-2 px-3 py-2 text-xs text-slate-200 xl:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Prices only from your system
            </div>
          </div>
        </div>

        {/* Who it's for */}
        <div className="relative border-t border-white/5 py-8">
          <p className="text-center text-xs tracking-[0.2em] text-slate-500 uppercase">
            Made for businesses that live on the phone
          </p>
          <div className="mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
            <div className="flex w-max animate-marquee gap-12 pr-12">
              {[...INDUSTRIES, ...INDUSTRIES].map((name, i) => (
                <span key={i} className="font-display text-2xl whitespace-nowrap text-slate-400">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-white py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight text-ink">
              Live in an afternoon, not a quarter
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              No scripts to write and no integration project. Your website already has everything
              the agent needs.
            </p>
          </div>
          <ol className="mt-16 grid gap-6 lg:grid-cols-3">
            <li className="card overflow-hidden">
              <div className="h-44 bg-linear-to-br from-slate-50 to-brand-50 p-6">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                  <Globe className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700">yourbusiness.com</span>
                  <span className="ml-auto rounded-lg bg-ink px-2.5 py-1 text-[11px] font-medium text-white">
                    Scan
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {[78, 64, 88].map((w) => (
                    <div key={w} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-emerald-500" />
                      <div className="h-2 rounded-full bg-slate-200" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-6">
                <div className="font-mono text-xs text-brand-600">01</div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Type your website</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  We read your pages and find the booking system behind them, with read-only
                  requests.
                </p>
              </div>
            </li>
            <li className="card overflow-hidden">
              <div className="h-44 bg-linear-to-br from-slate-50 to-brand-50 p-6">
                <TestChatVisual />
              </div>
              <div className="p-6">
                <div className="font-mono text-xs text-brand-600">02</div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Try your agent</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  A ready agent appears. Talk to it, read how it answered, and adjust anything.
                </p>
              </div>
            </li>
            <li className="card overflow-hidden">
              <div className="flex h-44 items-center justify-center gap-5 bg-ink p-6">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-white">
                  <span className="absolute inset-0 animate-ring rounded-full bg-brand-500" />
                  <PhoneForwarded className="relative h-6 w-6" />
                </span>
                <Waveform bars={18} className="h-10" barClassName="bg-brand-300" />
              </div>
              <div className="p-6">
                <div className="font-mono text-xs text-brand-600">03</div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Point your number at it</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Forward your line and it answers from the first ring, day and night.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Product tour */}
      <section id="product" className="scroll-mt-20 bg-canvas py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="eyebrow">The platform</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight text-ink">
              Everything between “hello” and “booked”
            </h2>
          </div>
          <ProductTour />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-white py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Why it works</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight text-ink">
              A receptionist that knows the rules
            </h2>
          </div>
          <div className="mt-16 grid gap-5 md:grid-cols-6">
            <div className="relative overflow-hidden rounded-3xl bg-ink p-8 text-white md:col-span-4">
              <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl" />
              <Sparkles className="relative h-6 w-6 text-brand-300" />
              <h3 className="relative mt-5 font-display text-3xl">
                Sounds like a person, acts like a system
              </h3>
              <p className="relative mt-3 max-w-md text-slate-300">
                Natural replies, interruptions handled, one question at a time. Behind the voice,
                every step follows the flow you designed.
              </p>
              <div className="relative mt-8 flex items-center gap-4">
                <Waveform
                  bars={40}
                  className="h-14 flex-1"
                  barClassName="bg-linear-to-t from-brand-500 to-fuchsia-300"
                />
              </div>
            </div>
            <div className="card p-8 md:col-span-2">
              <Plug className="h-6 w-6 text-brand-600" />
              <h3 className="mt-5 text-lg font-semibold text-ink">Works inside your systems</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Quotes, bookings and cancellations go through your own API, so they show up where
                they always do.
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {["get_quote", "create_booking", "find_booking"].map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="card p-8 md:col-span-2">
              <BookOpen className="h-6 w-6 text-brand-600" />
              <h3 className="mt-5 text-lg font-semibold text-ink">Knows your business</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Answers from your own pages and documents, and says “I&apos;m not sure” rather than
                inventing.
              </p>
            </div>
            <div className="card p-8 md:col-span-2">
              <PhoneForwarded className="h-6 w-6 text-brand-600" />
              <h3 className="mt-5 text-lg font-semibold text-ink">Hands over gracefully</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Puts callers through to your team when they ask, or when a call needs a human touch.
              </p>
            </div>
            <div className="card p-8 md:col-span-2">
              <Brain className="h-6 w-6 text-brand-600" />
              <h3 className="mt-5 text-lg font-semibold text-ink">Remembers regulars</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Recognises returning callers and their preferences, and forgets them when asked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stack and trust */}
      <section className="relative overflow-hidden bg-ink py-28 text-white">
        <div className="grid-lines absolute inset-0 opacity-60" />
        <div className="absolute top-0 left-1/2 h-96 w-[50rem] -translate-x-1/2 rounded-full bg-brand-700/25 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow text-brand-300">Built on proven pieces</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight">
              Open standards, your choice of models
            </h2>
            <p className="mt-4 max-w-md text-slate-400">
              Run on OpenAI or on models you host yourself. Connect apps through OpenAPI, MCP or
              webhooks.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3">
              {STACK.map((name) => (
                <div
                  key={name}
                  className="glass flex h-16 items-center justify-center text-sm font-medium text-slate-200"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow text-brand-300">Safe by design</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight">
              Trusted with your phone line
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {TRUST.map(({ icon: Icon, title, text }) => (
                <div key={title} className="glass p-5">
                  <Icon className="h-5 w-5 text-brand-300" />
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
              <Lock className="h-4 w-4" /> Your data stays with your business.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-white py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">Questions</p>
            <h2 className="mt-3 font-display text-5xl tracking-tight text-ink">Good to know</h2>
            <p className="mt-4 text-slate-600">
              Anything else?{" "}
              <Link href="/signup" className="font-medium text-brand-600 hover:underline">
                Try it yourself
              </Link>{" "}
              in a few minutes.
            </p>
          </div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-ink">
                  {q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-white px-6 pb-28">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-ink px-8 py-20 text-center text-white">
          <div className="grid-lines absolute inset-0" />
          <div className="absolute -top-32 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-brand-600/40 blur-[110px]" />
          <Waveform
            bars={28}
            className="relative mx-auto h-12 justify-center"
            barClassName="bg-brand-300/80"
          />
          <h2 className="relative mt-8 font-display text-5xl tracking-tight sm:text-6xl">
            Your website already has the answers.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-slate-300">
            Let your phone use them. Type your address and hear your agent today.
          </p>
          <div className="relative mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-light px-6 py-3 text-base">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn-glass px-6 py-3 text-base">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-slate-500">
              AI phone agents that know your business and work inside your systems.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Product</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
              <li>
                <a href="#how" className="hover:text-ink">
                  How it works
                </a>
              </li>
              <li>
                <a href="#product" className="hover:text-ink">
                  Platform
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-ink">
                  Features
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-ink">
                  FAQ
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Account</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
              <li>
                <Link href="/signup" className="hover:text-ink">
                  Create an account
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-ink">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-6 py-6 text-xs text-slate-400">
            <span>
              © {new Date().getFullYear()} {BRAND}
            </span>
            <span>Made for service businesses.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
