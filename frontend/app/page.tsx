"use client";
import Link from "next/link";

const NAV_ITEMS = [
  {
    href: "/bracket",
    label: "BRACKET",
    sub: "Tournament Tree",
    icon: "⬡",
    desc: "Full elimination bracket with team management and winner progression",
    accent: "purple",
  },
  {
    href: "/timer",
    label: "MATCH CONTROL",
    sub: "Live Duel Interface",
    icon: "◉",
    desc: "Live chrono with hit-the-wall (+2s), intervention (+5s), and elimination tracking",
    accent: "cyan",
  },
  {
    href: "/jury",
    label: "JURY",
    sub: "Mobile Control Panel",
    icon: "◈",
    desc: "Phone-ready controls for wall hits, interventions, time records, and eliminations",
    accent: "orange",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen grid-bg flex flex-col items-center justify-center px-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(39,24,126,0.10),transparent)]" />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-mid/30 bg-purple-dim/20 text-purple-vivid font-mono text-xs mb-6 tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-slow" />
            SYSTEM ONLINE
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-wider text-text-primary glow-text mb-3">
            A.R.B
          </h1>
          <p className="font-mono text-text-secondary text-sm tracking-[0.3em] uppercase">
            C.R.I.A.M
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.22em] text-text-secondary">
            <span className="rounded-full border border-panelBorder/60 px-3 py-1">HIT THE WALL = +2s</span>
            <span className="rounded-full border border-panelBorder/60 px-3 py-1">INTERVENTION = +5s</span>
            <span className="rounded-full border border-accent-red/35 bg-accent-red/10 px-3 py-1 text-accent-red">
              4 INTERVENTIONS = ELIMINATION
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="glass-panel rounded-xl p-6 cursor-pointer group hover:border-purple-mid/50 transition-all duration-300 hover:shadow-glow-sm h-full flex flex-col">
                <div className="text-3xl mb-4 opacity-60 group-hover:opacity-100 transition-opacity">
                  {item.icon}
                </div>
                <div className="font-display text-xs tracking-widest text-purple-vivid mb-1">
                  {item.sub}
                </div>
                <h2 className="font-display text-xl font-bold text-text-primary mb-3">
                  {item.label}
                </h2>
                <p className="text-text-secondary text-sm leading-relaxed mt-auto">
                  {item.desc}
                </p>
                <div className="mt-4 flex items-center gap-2 text-purple-vivid text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  OPEN <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-12 text-text-muted font-mono text-xs tracking-wider">
          African Robotic Brains
        </div>
      </div>
    </main>
  );
}
