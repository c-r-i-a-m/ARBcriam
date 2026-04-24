"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

import { useTimer, formatTime } from "@/hooks/useTimer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api } from "@/lib/api";
import {
  getAdjustedElapsedMs,
  getLatestRecord,
  getPenaltyBreakdown,
  getPenaltyTypeLabel,
  getTeamPenaltySummary,
} from "@/lib/penalties";
import { appendRecordIfMissing, dedupeRecords } from "@/lib/records";
import type {
  Match,
  PenaltyType,
  RecordEvent,
  TeamPenaltySummary,
  WSMessage,
} from "@/types";

function ControlButton({
  label,
  sublabel,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  sublabel: string;
  onClick: () => void;
  disabled: boolean;
  tone: "wall" | "intervention" | "record";
}) {
  const tones = {
    wall: "border-accent-red/45 bg-accent-red/10 text-accent-red hover:bg-accent-red/20 hover:shadow-glow-red",
    intervention:
      "border-orange-400/45 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20 hover:shadow-[0_8px_18px_rgba(251,146,60,0.16)]",
    record:
      "border-purple-mid/45 bg-purple-mid/10 text-purple-vivid hover:bg-purple-mid/20 hover:shadow-glow-sm",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-xl border px-4 py-3 text-left transition-all duration-200
        ${disabled ? "cursor-not-allowed opacity-35" : `${tones[tone]} hover:scale-[1.01] active:scale-[0.98]`}
      `}
    >
      <div className="font-display text-sm font-bold tracking-widest">{label}</div>
      <div className="mt-1 font-mono text-[10px] tracking-[0.25em] opacity-70">{sublabel}</div>
    </button>
  );
}

function TeamPanel({
  team,
  side,
  penaltySummary,
  records,
  onPenalty,
  onRecord,
  loading,
  isActive,
}: {
  team: { id: number; name: string } | null;
  side: "left" | "right";
  penaltySummary: TeamPenaltySummary;
  records: RecordEvent[];
  onPenalty: (penaltyType: PenaltyType) => void;
  onRecord: () => void;
  loading: boolean;
  isActive: boolean;
}) {
  const isLeft = side === "left";
  const latestRecord = getLatestRecord(records);
  const adjustedElapsedMs = latestRecord
    ? getAdjustedElapsedMs(latestRecord.recorded_elapsed_ms, penaltySummary)
    : null;
  const actionsDisabled = loading || !team || !isActive || penaltySummary.eliminated;

  return (
    <div
      className={`
        relative flex flex-1 flex-col justify-between overflow-hidden p-8
        border-panelBorder ${isLeft ? "border-r" : "border-l"}
      `}
    >
      <div
        className={`
          absolute inset-0 opacity-30 pointer-events-none
          ${
            isLeft
              ? "bg-[radial-gradient(ellipse_80%_60%_at_0%_50%,rgba(39,24,126,0.08),transparent)]"
              : "bg-[radial-gradient(ellipse_80%_60%_at_100%_50%,rgba(39,24,126,0.08),transparent)]"
          }
        `}
      />

      <div className={`relative flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
        <div className="mb-2 font-mono text-[10px] tracking-[0.35em] text-text-muted uppercase">
          {isLeft ? "← LEFT" : "RIGHT →"}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-4xl xl:text-5xl font-black tracking-wider text-text-primary glow-text leading-none">
            {team?.name ?? "TBD"}
          </h2>
          {penaltySummary.eliminated && (
            <span className="rounded-full border border-accent-red/45 bg-accent-red/12 px-3 py-1 font-mono text-[10px] tracking-[0.28em] text-accent-red">
              ELIMINATED
            </span>
          )}
        </div>
      </div>

      <div className={`relative my-6 flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
        <div className="mb-1 font-mono text-[9px] tracking-[0.4em] text-text-muted">TEAM RECORD</div>
        {penaltySummary.eliminated ? (
          <div className="font-display text-5xl xl:text-6xl font-black leading-none text-accent-red">
            ELIMINATED
          </div>
        ) : (
          <div className="font-display text-6xl xl:text-7xl font-black leading-none text-text-primary">
            {adjustedElapsedMs !== null ? formatTime(adjustedElapsedMs) : "--:--.--"}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="rounded-full border border-panelBorder/70 bg-panel/60 px-3 py-1 font-mono text-[10px] tracking-[0.22em] text-text-secondary">
            RAW {latestRecord ? formatTime(latestRecord.recorded_elapsed_ms) : "--:--.--"}
          </div>
          <div
            className={`
              rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.22em]
              ${penaltySummary.total_seconds > 0 ? "border-accent-red/40 bg-accent-red/10 text-accent-red" : "border-panelBorder/70 bg-panel/60 text-text-secondary"}
            `}
          >
            PEN +{penaltySummary.total_seconds}s
          </div>
        </div>
      </div>

      <div className={`relative flex flex-col gap-4 ${isLeft ? "items-start" : "items-end"}`}>
        <div className="grid w-full max-w-[360px] grid-cols-3 gap-3">
          <div className="rounded-xl border border-panelBorder/60 bg-panel/50 px-3 py-3">
            <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">WALLS</div>
            <div className="mt-2 font-display text-2xl font-black text-text-primary">
              {penaltySummary.hit_the_wall_count}
            </div>
            <div className="font-mono text-[10px] text-text-muted">+{penaltySummary.hit_the_wall_seconds}s</div>
          </div>
          <div className="rounded-xl border border-panelBorder/60 bg-panel/50 px-3 py-3">
            <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">INT</div>
            <div className="mt-2 font-display text-2xl font-black text-text-primary">
              {penaltySummary.intervention_count}
            </div>
            <div className="font-mono text-[10px] text-text-muted">+{penaltySummary.intervention_seconds}s</div>
          </div>
          <div className="rounded-xl border border-panelBorder/60 bg-panel/50 px-3 py-3">
            <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">STATUS</div>
            <div
              className={`mt-2 font-display text-lg font-black ${
                penaltySummary.eliminated
                  ? "text-accent-red"
                  : penaltySummary.intervention_count >= 3
                    ? "text-orange-200"
                    : "text-accent-green"
              }`}
            >
              {penaltySummary.eliminated
                ? "OUT"
                : penaltySummary.intervention_count >= 3
                  ? "LAST LIFE"
                  : "ACTIVE"}
            </div>
            <div className="font-mono text-[10px] text-text-muted">4 interventions = out</div>
          </div>
        </div>

        <div className="w-full max-w-[360px] rounded-xl border border-panelBorder/60 bg-panel/40 px-4 py-3">
          <div className="font-mono text-[9px] tracking-[0.24em] text-text-muted">PENALTY BREAKDOWN</div>
          <div className="mt-2 font-mono text-xs text-text-secondary">{getPenaltyBreakdown(penaltySummary)}</div>
        </div>

        <div className="grid w-full max-w-[360px] grid-cols-2 gap-3">
          <ControlButton
            label="+ HIT WALL"
            sublabel="+2S TO TEAM RECORD"
            onClick={() => onPenalty("hit_the_wall")}
            disabled={actionsDisabled}
            tone="wall"
          />
          <ControlButton
            label="+ INTERVENTION"
            sublabel="+5S · 4TH INTERVENTION = OUT"
            onClick={() => onPenalty("intervention")}
            disabled={actionsDisabled}
            tone="intervention"
          />
        </div>

        <div className="w-full max-w-[360px]">
          <ControlButton
            label="⬡ RECORD TIME"
            sublabel={penaltySummary.eliminated ? "DISABLED AFTER ELIMINATION" : "SAVE CURRENT CHRONO SNAPSHOT"}
            onClick={onRecord}
            disabled={actionsDisabled}
            tone="record"
          />
        </div>
      </div>

      {records.length > 0 && (
        <div className={`relative mt-5 flex flex-col gap-1.5 ${isLeft ? "items-start" : "items-end"}`}>
          <div className="mb-1 font-mono text-[9px] tracking-widest text-text-muted">RAW SNAPSHOTS</div>
          {records.slice(-5).map((record, index) => (
            <div
              key={record.id}
              className="flex items-center gap-2 rounded-md border border-panelBorder/60 bg-panel/50 px-3 py-1.5 font-mono text-xs"
            >
              <span className="text-text-muted">#{records.length - Math.min(records.length, 5) + index + 1}</span>
              <span className="font-semibold text-purple-vivid">
                {formatTime(record.recorded_elapsed_ms)}
              </span>
              {record.label && <span className="text-[10px] text-text-muted">{record.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimerPage() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [timerData, setTimerData] = useState({
    isRunning: false,
    baseElapsedMs: 0,
  });
  const [penalties, setPenalties] = useState<Record<number, TeamPenaltySummary>>({});
  const [records, setRecords] = useState<Record<number, RecordEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [eventFeed, setEventFeed] = useState<string[]>([]);

  const elapsedMs = useTimer(timerData.baseElapsedMs, timerData.isRunning);

  const addFeedEntry = useCallback((message: string) => {
    setEventFeed((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20));
  }, []);

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
          baseElapsedMs: state.timer.current_elapsed_ms,
        });
      } else {
        setTimerData({ isRunning: false, baseElapsedMs: 0 });
      }
      setPenalties(state.penalties ?? {});
      if (state.records) {
        const byTeam: Record<number, RecordEvent[]> = {};
        for (const [teamId, teamRecords] of Object.entries(state.records)) {
          byTeam[Number(teamId)] = dedupeRecords(teamRecords as RecordEvent[]);
        }
        setRecords(byTeam);
      } else {
        setRecords({});
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useWebSocket((msg: WSMessage) => {
    switch (msg.type) {
      case "active_match_changed":
        loadState();
        addFeedEntry(msg.match_id ? `Active match changed to #${msg.match_id}` : "Active match cleared");
        break;
      case "bracket_initialized":
        loadState();
        addFeedEntry("Bracket initialized");
        break;
      case "timer_started":
        setTimerData({
          isRunning: true,
          baseElapsedMs: msg.accumulated_elapsed_ms,
        });
        addFeedEntry("Timer started");
        break;
      case "timer_stopped":
        setTimerData({ isRunning: false, baseElapsedMs: msg.accumulated_elapsed_ms });
        addFeedEntry("Timer stopped");
        break;
      case "timer_reset":
        setTimerData({ isRunning: false, baseElapsedMs: 0 });
        addFeedEntry("Timer reset");
        break;
      case "penalty_added":
        setPenalties((prev) => ({ ...prev, [msg.team_id]: msg.penalty_summary }));
        addFeedEntry(
          `${getPenaltyTypeLabel(msg.penalty_type)} for team #${msg.team_id} (+${msg.penalty_value}s, total +${msg.penalty_summary.total_seconds}s)${
            msg.eliminated ? ` · eliminated, winner team #${msg.auto_winner_id}` : ""
          }`
        );
        break;
      case "time_recorded":
        setRecords((prev) => ({
          ...prev,
          [msg.team_id]: appendRecordIfMissing(prev[msg.team_id] ?? [], {
            id: msg.record_id,
            match_id: msg.match_id,
            team_id: msg.team_id,
            recorded_elapsed_ms: msg.elapsed_ms,
            label: msg.label,
            created_at: new Date().toISOString(),
            source: msg.source,
          }),
        }));
        addFeedEntry(`Time recorded for team #${msg.team_id}: ${formatTime(msg.elapsed_ms)}`);
        break;
      case "tournament_reset":
        loadState();
        addFeedEntry("Tournament reset");
        break;
      default:
        break;
    }
  });

  const handleTimerAction = useCallback(
    async (action: "start" | "stop" | "reset") => {
      if (!activeMatch) return;
      setActionLoading(true);
      try {
        if (action === "start") await api.startTimer(activeMatch.id);
        if (action === "stop") await api.stopTimer(activeMatch.id);
        if (action === "reset") await api.resetTimer(activeMatch.id);
      } finally {
        setActionLoading(false);
      }
    },
    [activeMatch]
  );

  const handlePenalty = useCallback(
    async (teamId: number, penaltyType: PenaltyType) => {
      if (!activeMatch) return;
      setActionLoading(true);
      try {
        await api.addPenalty(activeMatch.id, teamId, penaltyType, "timer_page");
      } finally {
        setActionLoading(false);
      }
    },
    [activeMatch]
  );

  const handleRecord = useCallback(
    async (teamId: number) => {
      if (!activeMatch) return;
      setActionLoading(true);
      try {
        await api.addRecord(activeMatch.id, teamId, "timer_page");
      } finally {
        setActionLoading(false);
      }
    },
    [activeMatch]
  );

  const team1 = activeMatch?.team1 ?? null;
  const team2 = activeMatch?.team2 ?? null;
  const team1PenaltySummary = getTeamPenaltySummary(penalties, team1?.id);
  const team2PenaltySummary = getTeamPenaltySummary(penalties, team2?.id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-display text-purple-vivid text-sm tracking-widest animate-pulse">
          LOADING…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      <header className="flex items-center justify-between px-8 py-3 border-b border-panelBorder/60 glass-panel z-20">
        <Link
          href="/"
          className="font-display text-xl font-black tracking-wider text-text-primary hover:text-purple-vivid transition-colors"
        >
          A.R.B
        </Link>
        <div className="text-center">
          {activeMatch ? (
            <>
              <div className="font-mono text-[9px] tracking-[0.35em] text-text-muted">
                {["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]} · MATCH #
                {activeMatch.id}
              </div>
              <div className="font-display text-sm font-bold text-text-primary tracking-wider">
                {team1?.name} <span className="text-purple-mid mx-2">VS</span> {team2?.name}
              </div>
            </>
          ) : (
            <div className="font-mono text-xs text-text-muted tracking-widest">NO ACTIVE MATCH</div>
          )}
        </div>
        <Link
          href="/jury"
          className="px-3 py-1.5 rounded border border-panelBorder text-text-secondary font-mono text-xs hover:border-purple-mid/50 hover:text-purple-vivid transition-all"
        >
          JURY →
        </Link>
      </header>

      <div className="border-b border-panelBorder/50 bg-panel/35 px-8 py-3">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.22em] text-text-secondary">
          <span className="rounded-full border border-panelBorder/70 px-3 py-1">HIT THE WALL = +2s</span>
          <span className="rounded-full border border-panelBorder/70 px-3 py-1">INTERVENTION = +5s</span>
          <span className="rounded-full border border-accent-red/30 bg-accent-red/8 px-3 py-1 text-accent-red">
            4 INTERVENTIONS = ELIMINATION
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex flex-1 min-h-0">
          <TeamPanel
            team={team1}
            side="left"
            penaltySummary={team1PenaltySummary}
            records={team1 ? records[team1.id] ?? [] : []}
            onPenalty={(penaltyType) => team1 && handlePenalty(team1.id, penaltyType)}
            onRecord={() => team1 && handleRecord(team1.id)}
            loading={actionLoading}
            isActive={!!activeMatch}
          />

          <div className="flex flex-col items-center justify-center px-6 min-w-[280px] xl:min-w-[340px] relative">
            <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />

            <div
              className={`
                flex items-center gap-2 px-3 py-1 rounded-full border font-mono text-[9px] tracking-widest mb-6
                ${timerData.isRunning ? "border-accent-green/40 bg-accent-green/10 text-accent-green" : "border-panelBorder text-text-muted"}
              `}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${timerData.isRunning ? "bg-accent-green animate-pulse" : "bg-text-dim"}`}
              />
              {timerData.isRunning ? "RUNNING" : "STOPPED"}
            </div>

            <div className="relative scan-overlay mb-6">
              <div
                className={`
                  font-display text-5xl xl:text-6xl font-black tracking-wider text-center transition-colors duration-300
                  ${timerData.isRunning ? "text-text-primary timer-running glow-text" : "text-text-secondary"}
                `}
                style={
                  timerData.isRunning
                    ? {
                        textShadow:
                          "0 4px 26px rgba(39,24,126,0.20), 0 0 34px rgba(124,79,245,0.10)",
                      }
                    : undefined
                }
              >
                {formatTime(elapsedMs)}
              </div>
              {timerData.isRunning && (
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-mid/60 to-transparent" />
              )}
            </div>

            <div className="mb-6 rounded-2xl border border-panelBorder/60 bg-panel/50 px-4 py-3 text-center">
              <div className="font-mono text-[9px] tracking-[0.25em] text-text-muted">SCORING MODE</div>
              <div className="mt-2 font-display text-base font-bold tracking-wider text-text-primary">
                Raw time + team penalties
              </div>
              <div className="mt-1 max-w-[220px] font-mono text-[10px] leading-5 text-text-secondary">
                Each wall hit adds 2 seconds. Each intervention adds 5 seconds. A team is eliminated on the 4th intervention.
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full max-w-[210px]">
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

            {!activeMatch && (
              <div className="mt-6 text-center">
                <Link href="/bracket" className="font-mono text-xs text-text-muted hover:text-purple-vivid transition-colors">
                  ← Set active match in bracket
                </Link>
              </div>
            )}
          </div>

          <TeamPanel
            team={team2}
            side="right"
            penaltySummary={team2PenaltySummary}
            records={team2 ? records[team2.id] ?? [] : []}
            onPenalty={(penaltyType) => team2 && handlePenalty(team2.id, penaltyType)}
            onRecord={() => team2 && handleRecord(team2.id)}
            loading={actionLoading}
            isActive={!!activeMatch}
          />
        </div>

        {eventFeed.length > 0 && (
          <div className="border-t border-panelBorder/60 bg-panel/50 px-6 py-2 max-h-32 overflow-y-auto">
            {eventFeed.map((entry, index) => (
              <div key={index} className="font-mono text-[10px] text-text-muted leading-5 tracking-wide">
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
