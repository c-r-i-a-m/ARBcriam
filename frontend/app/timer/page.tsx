"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PendingResolution,
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
      "border-white/12 bg-white/6 text-[#d9d6cf] hover:bg-white/10 hover:shadow-[0_8px_18px_rgba(0,0,0,0.18)]",
    record:
      "border-white/15 bg-white/8 text-text-primary hover:bg-white/12 hover:shadow-glow-sm",
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
  resolutionLocked,
}: {
  team: { id: number; name: string } | null;
  side: "left" | "right";
  penaltySummary: TeamPenaltySummary;
  records: RecordEvent[];
  onPenalty: (penaltyType: PenaltyType) => void;
  onRecord: () => void;
  loading: boolean;
  isActive: boolean;
  resolutionLocked: boolean;
}) {
  const isLeft = side === "left";
  const latestRecord = getLatestRecord(records);
  const adjustedElapsedMs = latestRecord
    ? getAdjustedElapsedMs(latestRecord.recorded_elapsed_ms, penaltySummary)
    : null;
  const actionsDisabled = loading || !team || !isActive || penaltySummary.eliminated || resolutionLocked;

  return (
    <div
      className={`
        relative flex flex-1 flex-col justify-between overflow-hidden p-8
        border-panelBorder ${isLeft ? "border-r" : "border-l"}
      `}
    >
      <div
        className={`
          pointer-events-none absolute inset-0 opacity-30
          ${
            isLeft
              ? "bg-[radial-gradient(ellipse_80%_60%_at_0%_50%,rgba(255,255,255,0.04),transparent)]"
              : "bg-[radial-gradient(ellipse_80%_60%_at_100%_50%,rgba(255,255,255,0.04),transparent)]"
          }
        `}
      />

      <div className={`relative flex flex-col ${isLeft ? "items-start" : "items-end"}`}>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] text-text-muted">
          {isLeft ? "<- LEFT" : "RIGHT ->"}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="glow-text font-display text-4xl font-black leading-none tracking-wider text-text-primary xl:text-5xl">
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
          <div className="font-display text-5xl font-black leading-none text-accent-red xl:text-6xl">
            ELIMINATED
          </div>
        ) : (
          <div className="font-display text-6xl font-black leading-none text-text-primary xl:text-7xl">
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
                    ? "text-accent-orange"
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
            sublabel="+5S - 4TH INTERVENTION = OUT"
            onClick={() => onPenalty("intervention")}
            disabled={actionsDisabled}
            tone="intervention"
          />
        </div>

        <div className="w-full max-w-[360px]">
          <ControlButton
            label="RECORD TIME"
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
              <span className="font-semibold text-purple-vivid">{formatTime(record.recorded_elapsed_ms)}</span>
              {record.label && <span className="text-[10px] text-text-muted">{record.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingResolutionCard({
  resolution,
  activeMatch,
  onConfirm,
  loading,
}: {
  resolution: PendingResolution;
  activeMatch: Match | null;
  onConfirm: () => void;
  loading: boolean;
}) {
  const isGreen = resolution.tone === "green";
  const borderTone = isGreen
    ? "border-accent-green/55 bg-[#0f241d]/98 text-[#dcffe7]"
    : "border-accent-red/55 bg-[#2b1116]/98 text-[#ffd9df]";
  const buttonTone = isGreen
    ? "border-accent-green/45 bg-accent-green/18 text-accent-green hover:bg-accent-green/28"
    : "border-accent-red/45 bg-accent-red/18 text-accent-red hover:bg-accent-red/26";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-6">
      <div
        className={`pointer-events-auto w-full max-w-3xl rounded-[28px] border px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm ${borderTone}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.32em] opacity-80">
              {isGreen ? "MATCH READY TO ADVANCE" : "ELIMINATION REQUIRES CONFIRMATION"}
            </div>
            <div className="mt-2 font-display text-3xl font-black tracking-wide">
              {isGreen
                ? `${resolution.winner_name ?? "This team"} wins`
                : `${resolution.loser_name ?? "This team"} was eliminated`}
            </div>
            <div className="mt-2 max-w-2xl font-mono text-xs leading-6 opacity-90">
              {resolution.message}
            </div>
            {resolution.type === "time_win" && (
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.22em]">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  WINNER {resolution.metadata.winner_adjusted_elapsed_display ?? "--:--.--"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  OPPONENT {resolution.metadata.loser_adjusted_elapsed_display ?? "--:--.--"}
                </span>
              </div>
            )}
            {resolution.type === "elimination" && (
              <div className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] tracking-[0.22em]">
                {resolution.metadata.intervention_count ?? 4} interventions recorded
              </div>
            )}
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="font-mono text-[10px] tracking-[0.26em] opacity-75">
              {activeMatch
                ? `${["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]} - MATCH #${activeMatch.id}`
                : `MATCH #${resolution.match_id}`}
            </div>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-2xl border px-5 py-3 font-display text-sm font-bold tracking-[0.22em] transition-all ${
                loading ? "cursor-not-allowed opacity-40" : `${buttonTone} shadow-[0_10px_28px_rgba(0,0,0,0.22)]`
              }`}
            >
              {loading ? "CONFIRMING..." : "CONFIRM AND ADVANCE"}
            </button>
          </div>
        </div>
      </div>
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
  const [pendingResolution, setPendingResolution] = useState<PendingResolution | null>(null);
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
        const match = state.matches?.find((item: Match) => item.id === state.active_match_id);
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
      setPendingResolution(state.pending_resolution ?? null);

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
        setPendingResolution(null);
        loadState();
        addFeedEntry("Timer reset");
        break;
      case "penalty_added":
        setPenalties((prev) => ({ ...prev, [msg.team_id]: msg.penalty_summary }));
        addFeedEntry(
          `${getPenaltyTypeLabel(msg.penalty_type)} for team #${msg.team_id} (+${msg.penalty_value}s, total +${msg.penalty_summary.total_seconds}s)${
            msg.eliminated ? " - pending elimination confirmation" : ""
          }`
        );
        break;
      case "match_resolution_pending":
        setPendingResolution(msg.pending_resolution);
        addFeedEntry(
          msg.pending_resolution.type === "time_win"
            ? `${msg.pending_resolution.winner_name ?? "A team"} is ready to advance`
            : `${msg.pending_resolution.loser_name ?? "A team"} was eliminated`
        );
        break;
      case "match_resolution_cleared":
        setPendingResolution((current) => (current?.match_id === msg.match_id ? null : current));
        addFeedEntry(`Resolution confirmed for match #${msg.match_id}`);
        break;
      case "winner_selected":
        addFeedEntry(`Winner confirmed for match #${msg.match_id}`);
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
        setPendingResolution(null);
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

  const handleFinish = useCallback(async () => {
    if (!activeMatch) return;
    setActionLoading(true);
    try {
      await api.finishMatch(activeMatch.id, "timer_page");
    } finally {
      setActionLoading(false);
    }
  }, [activeMatch]);

  const handleConfirmResolution = useCallback(async () => {
    if (!activeMatch || !pendingResolution) return;
    setActionLoading(true);
    try {
      await api.confirmPendingResolution(activeMatch.id, "timer_page");
    } finally {
      setActionLoading(false);
    }
  }, [activeMatch, pendingResolution]);

  const team1 = activeMatch?.team1 ?? null;
  const team2 = activeMatch?.team2 ?? null;
  const team1PenaltySummary = getTeamPenaltySummary(penalties, team1?.id);
  const team2PenaltySummary = getTeamPenaltySummary(penalties, team2?.id);

  const resolutionLocked = Boolean(activeMatch && pendingResolution?.match_id === activeMatch.id);
  const hasBothRecordedTimes = useMemo(() => {
    if (!team1 || !team2) return false;
    return Boolean(getLatestRecord(records[team1.id] ?? []) && getLatestRecord(records[team2.id] ?? []));
  }, [records, team1, team2]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-display text-sm tracking-widest text-purple-vivid animate-pulse">LOADING...</div>
      </div>
    );
  }

  return (
    <div className="grid-bg min-h-screen flex flex-col">
      <header className="glass-panel z-20 flex items-center justify-between border-b border-panelBorder/60 px-8 py-3">
        <Link
          href="/"
          className="font-display text-xl font-black tracking-wider text-text-primary transition-colors hover:text-purple-vivid"
        >
          A.R.B
        </Link>
        <div className="text-center">
          {activeMatch ? (
            <>
              <div className="font-mono text-[9px] tracking-[0.35em] text-text-muted">
                {["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]} - MATCH #
                {activeMatch.id}
              </div>
              <div className="font-display text-sm font-bold tracking-wider text-text-primary">
                {team1?.name} <span className="mx-2 text-purple-mid">VS</span> {team2?.name}
              </div>
            </>
          ) : (
            <div className="font-mono text-xs tracking-widest text-text-muted">NO ACTIVE MATCH</div>
          )}
        </div>
        <Link
          href="/jury"
          className="rounded border border-panelBorder px-3 py-1.5 font-mono text-xs text-text-secondary transition-all hover:border-purple-mid/50 hover:text-purple-vivid"
        >
          JURY {"->"}
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

      <div className="flex flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <TeamPanel
            team={team1}
            side="left"
            penaltySummary={team1PenaltySummary}
            records={team1 ? records[team1.id] ?? [] : []}
            onPenalty={(penaltyType) => team1 && handlePenalty(team1.id, penaltyType)}
            onRecord={() => team1 && handleRecord(team1.id)}
            loading={actionLoading}
            isActive={!!activeMatch}
            resolutionLocked={resolutionLocked}
          />

          <div className="relative flex min-w-[280px] flex-col items-center justify-center px-6 xl:min-w-[340px]">
            <div className="absolute bottom-0 left-0 top-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />
            <div className="absolute bottom-0 right-0 top-0 w-px bg-gradient-to-b from-transparent via-panelBorder to-transparent" />

            <div
              className={`
                mb-6 flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[9px] tracking-widest
                ${timerData.isRunning ? "border-accent-green/40 bg-accent-green/10 text-accent-green" : "border-panelBorder text-text-muted"}
              `}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${timerData.isRunning ? "animate-pulse bg-accent-green" : "bg-text-dim"}`}
              />
              {timerData.isRunning ? "RUNNING" : "STOPPED"}
            </div>

            <div className="scan-overlay relative mb-6">
              <div
                className={`
                  font-display text-center text-5xl font-black tracking-wider transition-colors duration-300 xl:text-6xl
                  ${timerData.isRunning ? "timer-running glow-text text-text-primary" : "text-text-secondary"}
                `}
                style={
                  timerData.isRunning
                    ? {
                        textShadow:
                          "0 4px 26px rgba(255,255,255,0.08), 0 0 30px rgba(255,255,255,0.04)",
                      }
                    : undefined
                }
              >
                {formatTime(elapsedMs)}
              </div>
              {timerData.isRunning && (
                <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              )}
            </div>

            <div className="mb-6 rounded-2xl border border-panelBorder/60 bg-panel/50 px-4 py-3 text-center">
              <div className="font-mono text-[9px] tracking-[0.25em] text-text-muted">SCORING MODE</div>
              <div className="mt-2 font-display text-base font-bold tracking-wider text-text-primary">
                Raw time + team penalties
              </div>
              <div className="mt-1 max-w-[220px] font-mono text-[10px] leading-5 text-text-secondary">
                Each wall hit adds 2 seconds. Each intervention adds 5 seconds. A team is eliminated on the 4th
                intervention.
              </div>
            </div>

            {resolutionLocked && (
              <div className="mb-5 w-full max-w-[240px] rounded-2xl border border-accent-orange/30 bg-accent-orange/8 px-4 py-3 text-center">
                <div className="font-mono text-[9px] tracking-[0.24em] text-accent-orange">MATCH LOCKED</div>
                <div className="mt-2 font-mono text-[10px] leading-5 text-text-secondary">
                  Confirm the pending decision below before changing the timer or penalties again.
                </div>
              </div>
            )}

            <div className="flex w-full max-w-[210px] flex-col gap-2">
              {!timerData.isRunning ? (
                <button
                  onClick={() => handleTimerAction("start")}
                  disabled={!activeMatch || actionLoading || resolutionLocked}
                  className="rounded-xl border border-accent-green/40 bg-accent-green/15 py-3 font-display text-sm font-bold tracking-widest text-accent-green transition-all hover:bg-accent-green/25 hover:shadow-[0_8px_18px_rgba(0,143,90,0.16)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  START
                </button>
              ) : (
                <button
                  onClick={() => handleTimerAction("stop")}
                  disabled={actionLoading || resolutionLocked}
                  className="rounded-xl border border-accent-red/40 bg-accent-red/15 py-3 font-display text-sm font-bold tracking-widest text-accent-red transition-all hover:bg-accent-red/25 hover:shadow-glow-red disabled:opacity-30"
                >
                  STOP
                </button>
              )}
              <button
                onClick={() => handleTimerAction("reset")}
                disabled={!activeMatch || actionLoading || timerData.isRunning}
                className="rounded-xl border border-panelBorder py-2.5 font-display text-xs font-bold tracking-widest text-text-muted transition-all hover:border-purple-mid/30 hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-30"
              >
                RESET
              </button>
              <button
                onClick={handleFinish}
                disabled={!activeMatch || actionLoading || timerData.isRunning || resolutionLocked || !hasBothRecordedTimes}
                className="rounded-xl border border-accent-green/35 bg-accent-green/10 py-2.5 font-display text-xs font-bold tracking-widest text-accent-green transition-all hover:bg-accent-green/18 hover:shadow-[0_10px_24px_rgba(0,143,90,0.14)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                FINISH MATCH
              </button>
            </div>

            {!hasBothRecordedTimes && activeMatch && !resolutionLocked && (
              <div className="mt-4 max-w-[220px] text-center font-mono text-[10px] leading-5 text-text-muted">
                Record a time for both teams before using Finish Match.
              </div>
            )}

            {!activeMatch && (
              <div className="mt-6 text-center">
                <Link href="/bracket" className="font-mono text-xs text-text-muted transition-colors hover:text-purple-vivid">
                  {"<-"} Set active match in bracket
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
            resolutionLocked={resolutionLocked}
          />
        </div>

        {eventFeed.length > 0 && (
          <div className="max-h-32 overflow-y-auto border-t border-panelBorder/60 bg-panel/50 px-6 py-2">
            {eventFeed.map((entry, index) => (
              <div key={index} className="font-mono text-[10px] leading-5 tracking-wide text-text-muted">
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingResolution && (
        <PendingResolutionCard
          resolution={pendingResolution}
          activeMatch={activeMatch}
          onConfirm={handleConfirmResolution}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
