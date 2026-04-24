"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTimer, formatTime } from "@/hooks/useTimer";
import type { Match, WSMessage, RecordEvent } from "@/types";
import Link from "next/link";

// ─── Team Panel ───────────────────────────────────────────────────────────────
function TeamPanel({
  team,
  side,
  penalties,
  records,
  onPenalty,
  onRecord,
  loading,
  isActive,
}: {
  team: { id: number; name: string } | null;
  side: "left" | "right";
  penalties: number;
  records: RecordEvent[];
  onPenalty: () => void;
  onRecord: () => void;
  loading: boolean;
  isActive: boolean;
}) {
  const isLeft = side === "left";

  return (
    <div className={`
      flex-1 flex flex-col justify-between p-8 relative overflow-hidden
      border-panelBorder
      ${isLeft ? "border-r" : "border-l"}
    `}>
      {/* Background accent */}
      <div className={`
        absolute inset-0 opacity-30 pointer-events-none
        ${isLeft
          ? "bg-[radial-gradient(ellipse_80%_60%_at_0%_50%,rgba(39,24,126,0.08),transparent)]"
          : "bg-[radial-gradient(ellipse_80%_60%_at_100%_50%,rgba(39,24,126,0.08),transparent)]"}
      `} />

      {/* Team name */}
      <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
        <div className="font-mono text-[10px] tracking-[0.35em] text-text-muted mb-2 uppercase">
          {isLeft ? "← LEFT" : "RIGHT →"}
        </div>
        <h2 className="font-display text-4xl xl:text-5xl font-black tracking-wider text-text-primary glow-text leading-none">
          {team?.name ?? "TBD"}
        </h2>
      </div>

      {/* Penalty count */}
      <div className={`flex flex-col ${isLeft ? "items-start" : "items-end"} my-6`}>
        <div className="font-mono text-[9px] tracking-[0.4em] text-text-muted mb-1">PENALTIES</div>
        <div className={`
          font-display text-7xl xl:text-8xl font-black leading-none
          ${penalties > 0 ? "text-accent-red" : "text-text-dim"}
          ${penalties > 0 ? "drop-shadow-[0_8px_18px_rgba(215,38,75,0.20)]" : ""}
        `}>
          {penalties}
        </div>
      </div>

      {/* Controls */}
      <div className={`flex flex-col gap-3 ${isLeft ? "items-start" : "items-end"}`}>
        {/* Penalty button */}
        <button
          onClick={onPenalty}
          disabled={loading || !team || !isActive}
          className={`
            relative overflow-hidden px-8 py-4 rounded-xl font-display font-bold text-sm tracking-widest
            border transition-all duration-200
            ${team && isActive
              ? "border-accent-red/50 bg-accent-red/10 text-accent-red hover:bg-accent-red/20 hover:shadow-glow-red hover:scale-[1.02] active:scale-[0.98]"
              : "border-panelBorder/40 text-text-dim cursor-not-allowed opacity-40"
            }
          `}
        >
          + PENALTY
        </button>

        <button
          onClick={onRecord}
          disabled={loading || !team || !isActive}
          className={`
            relative overflow-hidden px-8 py-4 rounded-xl font-display font-bold text-sm tracking-widest
            border transition-all duration-200
            ${team && isActive
              ? "border-purple-mid/50 bg-purple-mid/10 text-purple-vivid hover:bg-purple-mid/20 hover:shadow-glow-sm hover:scale-[1.02] active:scale-[0.98]"
              : "border-panelBorder/40 text-text-dim cursor-not-allowed opacity-40"
            }
          `}
        >
          ⬡ RECORD TIME
        </button>
      </div>

      {/* Records list */}
      {records.length > 0 && (
        <div className={`mt-4 flex flex-col gap-1.5 ${isLeft ? "items-start" : "items-end"}`}>
          <div className="font-mono text-[9px] tracking-widest text-text-muted mb-1">RECORDED TIMES</div>
          {records.slice(-5).map((r, i) => (
            <div key={r.id} className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md border border-panelBorder/60 bg-panel/50
              font-mono text-xs
            `}>
              <span className="text-text-muted">#{records.indexOf(r) + 1}</span>
              <span className="text-purple-vivid font-semibold">{formatTime(r.recorded_elapsed_ms)}</span>
              {r.label && <span className="text-text-muted text-[10px]">{r.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Timer Page ──────────────────────────────────────────────────────────
export default function TimerPage() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [timerData, setTimerData]     = useState({ isRunning: false, accMs: 0, startedAt: null as string | null });
  const [penalties, setPenalties]     = useState<Record<number, number>>({});
  const [records, setRecords]         = useState<Record<number, RecordEvent[]>>({});
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [eventFeed, setEventFeed]     = useState<string[]>([]);

  const elapsedMs = useTimer(timerData.accMs, timerData.isRunning, timerData.startedAt);

  const addFeedEntry = (msg: string) => {
    setEventFeed(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  };

  const loadState = useCallback(async () => {
    try {
      const state = await api.getState();
      if (state.active_match_id) {
        const match = state.matches?.find((m: Match) => m.id === state.active_match_id);
        setActiveMatch(match ?? null);
      } else {
        setActiveMatch(null);
      }
      if (state.timer) {
        setTimerData({
          isRunning: state.timer.is_running,
          accMs:     state.timer.accumulated_elapsed_ms,
          startedAt: state.timer.started_at,
        });
      }
      if (state.penalties) setPenalties(state.penalties);
      if (state.records) {
        const byTeam: Record<number, RecordEvent[]> = {};
        for (const [tid, recs] of Object.entries(state.records)) {
          byTeam[Number(tid)] = recs as RecordEvent[];
        }
        setRecords(byTeam);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  useWebSocket((msg: WSMessage) => {
    switch (msg.type) {
      case "active_match_changed":
        loadState();
        addFeedEntry(`Active match changed to #${msg.match_id}`);
        break;
      case "bracket_initialized":
        loadState();
        addFeedEntry("Bracket initialized");
        break;
      case "timer_started":
        setTimerData({ isRunning: true, accMs: msg.accumulated_elapsed_ms, startedAt: msg.started_at });
        addFeedEntry("⏱ Timer started");
        break;
      case "timer_stopped":
        setTimerData({ isRunning: false, accMs: msg.accumulated_elapsed_ms, startedAt: null });
        addFeedEntry("⏹ Timer stopped");
        break;
      case "timer_reset":
        setTimerData({ isRunning: false, accMs: 0, startedAt: null });
        addFeedEntry("↺ Timer reset");
        break;
      case "penalty_added":
        setPenalties(prev => ({ ...prev, [msg.team_id]: msg.total_penalties }));
        addFeedEntry(`⚠ Penalty added for team #${msg.team_id} (total: ${msg.total_penalties}) [${msg.source}]`);
        break;
      case "time_recorded":
        setRecords(prev => ({
          ...prev,
          [msg.team_id]: [...(prev[msg.team_id] ?? []), {
            id: msg.record_id,
            match_id: msg.match_id,
            team_id: msg.team_id,
            recorded_elapsed_ms: msg.elapsed_ms,
            label: msg.label,
            created_at: new Date().toISOString(),
            source: msg.source,
          }],
        }));
        addFeedEntry(`◉ Time recorded for team #${msg.team_id}: ${formatTime(msg.elapsed_ms)} [${msg.source}]`);
        break;
      case "tournament_reset":
        loadState();
        break;
    }
  });

  const handleTimerAction = useCallback(async (action: "start" | "stop" | "reset") => {
    if (!activeMatch) return;
    setActionLoading(true);
    try {
      if (action === "start")  await api.startTimer(activeMatch.id);
      if (action === "stop")   await api.stopTimer(activeMatch.id);
      if (action === "reset")  await api.resetTimer(activeMatch.id);
    } finally {
      setActionLoading(false);
    }
  }, [activeMatch]);

  const handlePenalty = useCallback(async (teamId: number) => {
    if (!activeMatch) return;
    setActionLoading(true);
    try {
      await api.addPenalty(activeMatch.id, teamId, "timer_page");
    } finally {
      setActionLoading(false);
    }
  }, [activeMatch]);

  const handleRecord = useCallback(async (teamId: number) => {
    if (!activeMatch) return;
    setActionLoading(true);
    try {
      await api.addRecord(activeMatch.id, teamId, "timer_page");
    } finally {
      setActionLoading(false);
    }
  }, [activeMatch]);

  const team1 = activeMatch?.team1 ?? null;
  const team2 = activeMatch?.team2 ?? null;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display text-purple-vivid text-sm tracking-widest animate-pulse">LOADING…</div>
    </div>
  );

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-3 border-b border-panelBorder/60 glass-panel z-20">
        <Link href="/" className="font-display text-xl font-black tracking-wider text-text-primary hover:text-purple-vivid transition-colors">
          A.R.B
        </Link>
        <div className="text-center">
          {activeMatch ? (
            <>
              <div className="font-mono text-[9px] tracking-[0.35em] text-text-muted">
                {["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]} · MATCH #{activeMatch.id}
              </div>
              <div className="font-display text-sm font-bold text-text-primary tracking-wider">
                {team1?.name} <span className="text-purple-mid mx-2">VS</span> {team2?.name}
              </div>
            </>
          ) : (
            <div className="font-mono text-xs text-text-muted tracking-widest">NO ACTIVE MATCH</div>
          )}
        </div>
        <Link href="/jury" className="px-3 py-1.5 rounded border border-panelBorder text-text-secondary font-mono text-xs hover:border-purple-mid/50 hover:text-purple-vivid transition-all">
          JURY →
        </Link>
      </header>

      {/* Main split layout */}
      <div className="flex-1 flex flex-col">
        {/* Team panels */}
        <div className="flex flex-1 min-h-0">
          <TeamPanel
            team={team1} side="left"
            penalties={team1 ? (penalties[team1.id] ?? 0) : 0}
            records={team1 ? (records[team1.id] ?? []) : []}
            onPenalty={() => team1 && handlePenalty(team1.id)}
            onRecord={() => team1 && handleRecord(team1.id)}
            loading={actionLoading}
            isActive={!!activeMatch}
          />

          {/* Center column: chrono */}
          <div className="flex flex-col items-center justify-center px-6 min-w-[260px] xl:min-w-[320px] relative">
            {/* Vertical rule lines */}
            <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />

            {/* Status badge */}
            <div className={`
              flex items-center gap-2 px-3 py-1 rounded-full border font-mono text-[9px] tracking-widest mb-6
              ${timerData.isRunning
                ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
                : "border-panelBorder text-text-muted"
              }
            `}>
              <span className={`w-1.5 h-1.5 rounded-full ${timerData.isRunning ? "bg-accent-green animate-pulse" : "bg-text-dim"}`} />
              {timerData.isRunning ? "RUNNING" : "STOPPED"}
            </div>

            {/* Chrono display */}
            <div className="relative scan-overlay mb-8">
              <div className={`
                font-display text-5xl xl:text-6xl font-black tracking-wider text-center
                transition-colors duration-300
                ${timerData.isRunning ? "text-text-primary timer-running glow-text" : "text-text-secondary"}
              `}
                style={timerData.isRunning ? {
                  textShadow: "0 4px 26px rgba(39,24,126,0.20), 0 0 34px rgba(124,79,245,0.10)"
                } : undefined}
              >
                {formatTime(elapsedMs)}
              </div>
              {timerData.isRunning && (
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-mid/60 to-transparent" />
              )}
            </div>

            {/* Timer controls */}
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              {!timerData.isRunning ? (
                <button
                  onClick={() => handleTimerAction("start")}
                  disabled={!activeMatch || actionLoading}
                  className="py-3 rounded-xl font-display font-bold text-sm tracking-widest bg-accent-green/15 border border-accent-green/40 text-accent-green hover:bg-accent-green/25 hover:shadow-[0_8px_18px_rgba(0,143,90,0.16)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ▶ START
                </button>
              ) : (
                <button
                  onClick={() => handleTimerAction("stop")}
                  disabled={actionLoading}
                  className="py-3 rounded-xl font-display font-bold text-sm tracking-widest bg-accent-red/15 border border-accent-red/40 text-accent-red hover:bg-accent-red/25 hover:shadow-glow-red transition-all disabled:opacity-30"
                >
                  ⬛ STOP
                </button>
              )}
              <button
                onClick={() => handleTimerAction("reset")}
                disabled={!activeMatch || actionLoading || timerData.isRunning}
                className="py-2.5 rounded-xl font-display font-bold text-xs tracking-widest border border-panelBorder text-text-muted hover:border-purple-mid/30 hover:text-text-secondary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↺ RESET
              </button>
            </div>

            {/* Match selector hint */}
            {!activeMatch && (
              <div className="mt-6 text-center">
                <Link href="/bracket" className="font-mono text-xs text-text-muted hover:text-purple-vivid transition-colors">
                  ← Set active match in bracket
                </Link>
              </div>
            )}
          </div>

          <TeamPanel
            team={team2} side="right"
            penalties={team2 ? (penalties[team2.id] ?? 0) : 0}
            records={team2 ? (records[team2.id] ?? []) : []}
            onPenalty={() => team2 && handlePenalty(team2.id)}
            onRecord={() => team2 && handleRecord(team2.id)}
            loading={actionLoading}
            isActive={!!activeMatch}
          />
        </div>

        {/* Event feed */}
        {eventFeed.length > 0 && (
          <div className="border-t border-panelBorder/60 bg-panel/50 px-6 py-2 max-h-28 overflow-y-auto">
            {eventFeed.map((entry, i) => (
              <div key={i} className="font-mono text-[10px] text-text-muted leading-5 tracking-wide">
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
