"use client";
import Link from "next/link";

const NAV_ITEMS = [
  {
    href: "/roulette",
    label: "ROULETTE",
    sub: "Random Team Draw",
    icon: "{ }",
    desc: "Spin through all registered teams, place them into the bracket, and unlock the tournament when the 16th slot is filled",
  },
  {
    href: "/bracket",
    label: "BRACKET",
    sub: "Tournament Tree",
    icon: "[ ]",
    desc: "Full elimination bracket with team management and winner progression",
  },
  {
    href: "/timer",
    label: "MATCH CONTROL",
    sub: "Live Duel Interface",
    icon: "( )",
    desc: "Live chrono with hit-the-wall (+2s), intervention (+5s), and elimination tracking",
  },
  {
    href: "/jury",
    label: "JURY",
    sub: "Mobile Control Panel",
    icon: "<>",
    desc: "Phone-ready controls for wall hits, interventions, time records, and eliminations",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen grid-bg flex flex-col items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(255,255,255,0.05),transparent)]" />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs tracking-widest text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-slow" />
            SYSTEM ONLINE
          </div>
          <h1 className="mb-3 font-display text-5xl font-black tracking-wider text-text-primary glow-text md:text-7xl">
            A.R.B
          </h1>
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-text-secondary">C.R.I.A.M</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.22em] text-text-secondary">
            <span className="rounded-full border border-panelBorder/60 px-3 py-1">HIT THE WALL = +2s</span>
            <span className="rounded-full border border-panelBorder/60 px-3 py-1">INTERVENTION = +5s</span>
            <span className="rounded-full border border-accent-red/25 bg-accent-red/10 px-3 py-1 text-accent-red">
              4 INTERVENTIONS = ELIMINATION
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="glass-panel group flex h-full cursor-pointer flex-col rounded-xl p-6 transition-all duration-300 hover:border-white/15 hover:shadow-glow-sm">
                <div className="mb-4 text-3xl opacity-60 transition-opacity group-hover:opacity-90">
                  {item.icon}
                </div>
                <div className="mb-1 font-display text-xs tracking-widest text-text-muted">{item.sub}</div>
                <h2 className="mb-3 font-display text-xl font-bold text-text-primary">{item.label}</h2>
                <p className="mt-auto text-sm leading-relaxed text-text-secondary">{item.desc}</p>
                <div className="mt-4 flex items-center gap-2 font-mono text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">
                  OPEN <span>-&gt;</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center font-mono text-xs tracking-wider text-text-muted">
          African Robotic Brains
        </div>
      </div>
    </main>
  );
}
