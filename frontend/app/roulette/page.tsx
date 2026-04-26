"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWebSocket } from "@/hooks/useWebSocket";
import { api } from "@/lib/api";
import type { Match, RouletteState, Team, TournamentState, WSMessage } from "@/types";

type SpinPhase = "idle" | "spinning" | "revealing" | "committing";

type PendingPick = {
  team: Team;
  index: number;
  selectionOrder: number;
  matchId: number;
  teamSlot: number;
};

type ConfirmedSelection = {
  team: Team;
  selectionOrder: number;
  matchId: number;
  teamSlot: number;
  tournamentReady: boolean;
};

type WheelSlice = {
  team: Team;
  path: string;
  color: string;
  labelPoint: { x: number; y: number };
};

const WHEEL_COLORS = [
  "#2a3035",
  "#313940",
  "#5d6770",
  "#7f8a94",
  "#bca58d",
  "#70807a",
  "#55616c",
  "#8f9499",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSlotLabel(matchId: number, teamSlot: number) {
  return `MATCH ${matchId} - TEAM ${teamSlot}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function buildSlicePath(startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) {
  const center = 200;
  const outerStart = polarToCartesian(center, center, outerRadius, startAngle);
  const outerEnd = polarToCartesian(center, center, outerRadius, endAngle);
  const innerStart = polarToCartesian(center, center, innerRadius, endAngle);
  const innerEnd = polarToCartesian(center, center, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

export default function RoulettePage() {
  const [roulette, setRoulette] = useState<RouletteState | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SpinPhase>("idle");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelDurationMs, setWheelDurationMs] = useState(0);
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [lastSelection, setLastSelection] = useState<ConfirmedSelection | null>(null);

  const mountedRef = useRef(true);
  const rotationRef = useRef(0);

  const loadState = useCallback(async () => {
    try {
      const state = (await api.getState()) as TournamentState;
      if (!mountedRef.current) return;
      setRoulette(state.roulette ?? null);
      setMatches(state.matches ?? []);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load the roulette state.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadState();
    return () => {
      mountedRef.current = false;
    };
  }, [loadState]);

  useWebSocket((msg: WSMessage) => {
    if (
      msg.type === "roulette_team_selected" ||
      msg.type === "roulette_completed" ||
      msg.type === "tournament_reset" ||
      msg.type === "bracket_updated"
    ) {
      loadState();
    }
  });

  const remainingTeams = roulette?.remaining_teams ?? [];
  const assignedTeams = roulette?.assigned_teams ?? [];
  const openingMatches = matches.filter((match) => match.round === 1).sort((a, b) => a.slot_index - b.slot_index);
  const sectorAngle = remainingTeams.length > 0 ? 360 / remainingTeams.length : 360;

  const wheelSlices = useMemo<WheelSlice[]>(() => {
    if (remainingTeams.length === 0) return [];

    return remainingTeams.map((team, index) => {
      const startAngle = index * sectorAngle;
      const endAngle = startAngle + sectorAngle;
      const centerAngle = startAngle + sectorAngle / 2;
      const isTarget = pendingPick?.team.id === team.id;

      return {
        team,
        path: buildSlicePath(startAngle, endAngle, 92, 196),
        color: isTarget ? "#f3f0e8" : WHEEL_COLORS[index % WHEEL_COLORS.length],
        labelPoint: polarToCartesian(200, 200, 146, centerAngle),
      };
    });
  }, [pendingPick, remainingTeams, sectorAngle]);

  const rimStops = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        angle: index * (360 / 48),
        key: index,
      })),
    []
  );

  const handleSpin = useCallback(async () => {
    if (!roulette || phase !== "idle" || !roulette.can_spin || remainingTeams.length === 0) return;

    setError(null);
    setPendingPick(null);

    try {
      const pick = await api.pickRouletteTeam();
      const selectedTeam = pick.selected_team as Team;
      const pendingSelection = pick.pending_selection as {
        selection_order: number;
        match_id: number;
        team_slot: number;
      };
      const pickedIndex = remainingTeams.findIndex((team) => team.id === selectedTeam.id);

      if (pickedIndex === -1) {
        throw new Error("The selected team is no longer available in the current wheel.");
      }

      const centerAngle = pickedIndex * sectorAngle + sectorAngle / 2;
      const normalizedRotation = ((rotationRef.current % 360) + 360) % 360;
      const alignment = (360 - ((normalizedRotation + centerAngle) % 360)) % 360;
      const extraTurns = 2160 + Math.floor(Math.random() * 3) * 360;
      const nextRotation = rotationRef.current + alignment + extraTurns;

      const nextPendingPick: PendingPick = {
        team: selectedTeam,
        index: pickedIndex,
        selectionOrder: pendingSelection.selection_order,
        matchId: pendingSelection.match_id,
        teamSlot: pendingSelection.team_slot,
      };

      setPendingPick(nextPendingPick);
      setPhase("spinning");
      setWheelDurationMs(5600);
      setWheelRotation(nextRotation);
      rotationRef.current = nextRotation;

      await sleep(5600);
      if (!mountedRef.current) return;

      setPhase("revealing");
      await sleep(1150);
      if (!mountedRef.current) return;

      setPhase("committing");
      const result = await api.confirmRouletteTeam(selectedTeam.id, "roulette_page");
      if (!mountedRef.current) return;

      setLastSelection({
        team: selectedTeam,
        selectionOrder: result.selection.selection_order,
        matchId: result.selection.match_id,
        teamSlot: result.selection.team_slot,
        tournamentReady: result.tournament_ready,
      });

      await loadState();
      await sleep(900);
      if (!mountedRef.current) return;

      setPhase("idle");
      setPendingPick(null);
      setWheelDurationMs(0);
    } catch (spinError) {
      console.error(spinError);
      if (!mountedRef.current) return;
      setPhase("idle");
      setPendingPick(null);
      setWheelDurationMs(0);
      setError(spinError instanceof Error ? spinError.message : "Unable to spin the roulette.");
    }
  }, [loadState, phase, remainingTeams, roulette, sectorAngle]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center grid-bg">
        <div className="font-display text-sm tracking-[0.3em] text-text-secondary animate-pulse">
          LOADING ROULETTE...
        </div>
      </div>
    );
  }

  const centerLabel =
    phase === "revealing" || phase === "committing"
      ? pendingPick?.team.name ?? "LOCKED"
      : phase === "spinning"
        ? "SCANNING"
        : roulette?.can_start_tournament
          ? "READY"
          : "SPIN";

  return (
    <main className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#101214] text-text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.09),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.03),transparent_40%),linear-gradient(180deg,#131619_0%,#101214_54%,#0c0e10_100%)]" />
      <div className="absolute inset-0 grid-bg opacity-55" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_52%,rgba(0,0,0,0.28)_100%)]" />

      <div className="relative z-10 grid h-full max-h-[100dvh] grid-rows-[64px_minmax(0,1fr)] overflow-hidden">
        <header className="border-b border-panelBorder/70 bg-black/20 backdrop-blur-md">
          <div className="mx-auto grid h-full max-w-[1480px] grid-cols-[auto_1fr_auto] items-center gap-4 px-5">
            <Link href="/" className="font-display text-xl font-black tracking-[0.24em] text-text-primary transition-colors hover:text-purple-vivid">
              A.R.B
            </Link>
            <div className="text-center">
              <div className="font-display text-[1rem] font-black tracking-[0.28em] text-text-primary">
                ROULETTE DRAW
              </div>
              <div className="font-mono text-[9px] tracking-[0.26em] text-text-muted">
                PROJECTOR MODE - RANDOM TEAM ASSIGNMENT BEFORE TOURNAMENT START
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/bracket" className="rounded border border-panelBorder px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] text-text-secondary transition-colors hover:border-purple-mid/50 hover:text-purple-vivid">
                BRACKET
              </Link>
              <Link
                href="/timer"
                className={`rounded border px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] transition-colors ${
                  roulette?.can_start_tournament
                    ? "border-white/12 bg-white/[0.08] text-text-primary hover:bg-white/[0.12]"
                    : "pointer-events-none border-panelBorder text-text-dim"
                }`}
              >
                START
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto grid h-full min-h-0 w-full max-w-[1480px] grid-cols-[minmax(0,1.5fr)_minmax(320px,0.88fr)] gap-4 px-4 py-4 overflow-hidden">
          <section className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.32)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] tracking-[0.28em] text-text-muted">SELECTION PROGRESS</div>
                <div className="mt-1.5 flex items-end gap-3">
                  <div className="font-display text-[clamp(2.4rem,5.6vw,4.6rem)] font-black leading-none tracking-[0.1em] text-text-primary">
                    {roulette?.assigned_count ?? 0}
                  </div>
                  <div className="pb-1.5 font-mono text-[11px] tracking-[0.18em] text-text-secondary">
                    / {roulette?.capacity ?? 16} LOCKED
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="rounded-full border border-panelBorder/80 bg-panel/70 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] text-text-secondary">
                  {roulette?.remaining_count ?? 0} REMAINING
                </div>
                <div
                  className={`rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] ${
                    roulette?.can_start_tournament
                      ? "border-white/12 bg-white/[0.08] text-text-primary"
                      : "border-accent-red/25 bg-accent-red/10 text-accent-red"
                  }`}
                >
                  {roulette?.can_start_tournament ? "TOURNAMENT UNLOCKED" : "START LOCKED"}
                </div>
              </div>
            </div>

            <div className="relative min-h-0 overflow-hidden">
              <div className="absolute inset-x-[12%] top-[10%] h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <div className="absolute inset-x-[12%] bottom-[11%] h-[1px] bg-gradient-to-r from-transparent via-white/8 to-transparent" />

              <div className="absolute left-1/2 top-[7%] z-20 -translate-x-1/2">
                <div className="h-0 w-0 border-l-[18px] border-r-[18px] border-t-[26px] border-l-transparent border-r-transparent border-t-[#f3f0e8] drop-shadow-[0_0_20px_rgba(243,240,232,0.35)]" />
              </div>

              <div className="grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto] justify-items-center">
                <div className="relative flex min-h-0 w-full items-center justify-center">
                  <div className={`absolute inset-0 flex items-center justify-center ${phase === "idle" ? "" : "roulette-sweep"}`}>
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_42%)]" />
                  </div>

                  <div
                    className={`relative flex items-center justify-center rounded-full border border-white/8 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),rgba(255,255,255,0.01)_58%,transparent_72%)] shadow-[0_40px_120px_rgba(0,0,0,0.36)] ${phase === "spinning" ? "roulette-pulse" : ""}`}
                    style={{ width: "min(34vw, 50vh)", height: "min(34vw, 50vh)" }}
                  >
                    <div className="absolute inset-[2.5%] rounded-full border border-white/8 bg-black/25" />

                    <svg viewBox="0 0 400 400" className="absolute inset-[1.8%] h-[96.4%] w-[96.4%]">
                      {rimStops.map((stop) => (
                        <line
                          key={stop.key}
                          x1="200"
                          y1="8"
                          x2="200"
                          y2="22"
                          stroke="rgba(255,255,255,0.18)"
                          strokeWidth="2"
                          transform={`rotate(${stop.angle} 200 200)`}
                        />
                      ))}
                    </svg>

                    <div
                      className="absolute inset-[5.5%] rounded-full"
                      style={{
                        transform: `rotate(${wheelRotation}deg)`,
                        transition: wheelDurationMs
                          ? `transform ${wheelDurationMs}ms cubic-bezier(0.08, 0.82, 0.18, 1)`
                          : "none",
                      }}
                    >
                      <svg viewBox="0 0 400 400" className="h-full w-full">
                        <circle cx="200" cy="200" r="196" fill="#14181b" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                        {wheelSlices.map((slice) => (
                          <path
                            key={slice.team.id}
                            d={slice.path}
                            fill={slice.color}
                            stroke="rgba(16,18,20,0.74)"
                            strokeWidth="2"
                            opacity={pendingPick && pendingPick.team.id !== slice.team.id ? 0.88 : 1}
                          />
                        ))}
                        {wheelSlices.map((slice) => (
                          <g key={`label-${slice.team.id}`} transform={`translate(${slice.labelPoint.x} ${slice.labelPoint.y})`}>
                            <g transform={`rotate(${-wheelRotation})`}>
                              <rect
                                x="-54"
                                y="-18"
                                width="108"
                                height="36"
                                rx="18"
                                fill={pendingPick?.team.id === slice.team.id ? "#f3f0e8" : "rgba(0,0,0,0.22)"}
                                stroke={pendingPick?.team.id === slice.team.id ? "#111315" : "rgba(255,255,255,0.1)"}
                              />
                              <text
                                x="0"
                                y="4"
                                textAnchor="middle"
                                fill={pendingPick?.team.id === slice.team.id ? "#111315" : "#f3f0e8"}
                                fontSize="8.5"
                                fontWeight="700"
                                letterSpacing="1.2"
                              >
                                {slice.team.name.length > 12 ? `${slice.team.name.slice(0, 12)}...` : slice.team.name}
                              </text>
                            </g>
                          </g>
                        ))}
                        <circle cx="200" cy="200" r="90" fill="#121517" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                      </svg>
                    </div>

                    <div className="absolute inset-[31%] rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),rgba(15,17,19,0.98))] shadow-[0_18px_50px_rgba(0,0,0,0.35)]" />

                    <div className="absolute inset-0 grid place-items-center">
                      <div className="mx-auto flex w-[66%] max-w-[300px] flex-col items-center justify-center text-center">
                        <div className="font-mono text-[9px] tracking-[0.24em] text-text-muted">
                          {phase === "idle"
                            ? "READY FOR NEXT DRAW"
                            : phase === "spinning"
                              ? "TARGET ACQUIRED"
                              : phase === "revealing"
                                ? "SELECTED TEAM"
                                : "WRITING TO BRACKET"}
                        </div>

                        <div className="mt-4 flex w-full items-center justify-center">
                          <div
                            className={`inline-flex w-full items-center justify-center text-center font-display font-black leading-[0.88] text-text-primary ${
                              phase === "revealing" || phase === "committing" ? "roulette-reveal" : ""
                            } text-[clamp(2.1rem,4.8vw,4.4rem)]`}
                            style={{ textWrap: "balance" }}
                          >
                            {centerLabel}
                          </div>
                        </div>

                        <div className="mt-3 w-full text-center font-mono text-[9px] tracking-[0.16em] text-text-secondary">
                          {phase === "revealing" || phase === "committing"
                            ? pendingPick
                              ? `PICK ${String(pendingPick.selectionOrder).padStart(2, "0")} - ${getSlotLabel(
                                  pendingPick.matchId,
                                  pendingPick.teamSlot
                                )}`
                              : "LOCKED TARGET"
                            : `${roulette?.remaining_count ?? 0} TEAMS IN THE WHEEL`}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center pb-1 pt-2">
                  <button
                    onClick={handleSpin}
                    disabled={!roulette?.can_spin || phase !== "idle"}
                    className={`min-w-[190px] rounded-full border px-6 py-3 font-display text-base font-black tracking-[0.22em] transition-all ${
                      !roulette?.can_spin || phase !== "idle"
                        ? "cursor-not-allowed border-panelBorder bg-panel/70 text-text-dim"
                        : "border-white/14 bg-white/[0.08] text-text-primary hover:-translate-y-[1px] hover:bg-white/[0.12] hover:shadow-glow-sm"
                    }`}
                  >
                    {phase === "idle" ? "SPIN ROULETTE" : phase === "spinning" ? "ROTATING..." : "LOCKING..."}
                  </button>
                </div>
              </div>
            </div>

          </section>

          <aside className="grid h-full min-h-0 grid-rows-[132px_minmax(0,1fr)] gap-4 overflow-hidden">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.26)]">
                <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">START CONDITION</div>
                <div className="mt-3 font-display text-xl font-black tracking-[0.1em] text-text-primary">
                  {roulette?.can_start_tournament ? "READY TO START" : "DRAW IN PROGRESS"}
                </div>
                <div className="mt-2 font-mono text-[9px] tracking-[0.14em] text-text-secondary">
                  {roulette?.assigned_count ?? 0} OF {roulette?.capacity ?? 16} OPENING SLOTS FILLED
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.26)]">
                <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">NEXT SLOT</div>
                <div className="mt-3 font-display text-xl font-black tracking-[0.1em] text-text-primary">
                  {assignedTeams.length < (roulette?.capacity ?? 16)
                    ? getSlotLabel(openingMatches[Math.floor((assignedTeams.length ?? 0) / 2)]?.id ?? 1, assignedTeams.length % 2 === 0 ? 1 : 2)
                    : "BRACKET FULL"}
                </div>
                <div className="mt-2 font-mono text-[9px] tracking-[0.14em] text-text-secondary">
                  THE NEXT RANDOM WINNER DROPS HERE
                </div>
              </div>
            </section>

            <section className="min-h-0 overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.26)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">OPENING BRACKET</div>
                  <div className="mt-1.5 font-display text-[1.2rem] font-black tracking-[0.1em] text-text-primary">
                    ROUND OF 16
                  </div>
                </div>
                <div className="rounded-full border border-panelBorder/70 px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] text-text-secondary">
                  PICKS {assignedTeams.length}/{roulette?.capacity ?? 16}
                </div>
              </div>

              <div className="h-[calc(100%-48px)] min-h-0 overflow-y-auto pr-1">
                <div className="grid min-h-full grid-cols-2 gap-2.5">
                {openingMatches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-panelBorder/80 bg-panel/65 p-2.5">
                    <div className="font-mono text-[9px] tracking-[0.18em] text-text-muted">MATCH {match.id}</div>
                    <div className="mt-2 grid gap-1.5">
                      {[match.team1, match.team2].map((team, index) => (
                        <div
                          key={`${match.id}-${index}`}
                          className={`rounded-lg border px-2.5 py-2 ${
                            team
                              ? "border-white/10 bg-white/[0.05] text-text-primary"
                              : "border-panelBorder/70 border-dashed bg-panel/40 text-text-dim"
                          }`}
                        >
                          <div className="font-mono text-[8px] tracking-[0.16em] text-text-muted">TEAM {index + 1}</div>
                          <div className="mt-1 truncate font-display text-[12px] font-bold tracking-[0.08em]">
                            {team?.name ?? "WAITING FOR DRAW"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </section>
          </aside>
        </div>

      </div>
    </main>
  );
}
