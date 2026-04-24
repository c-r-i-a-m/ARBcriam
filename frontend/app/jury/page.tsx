"use client";
import { useEffect, useState, useCallback, useRef } from "react";

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

function useFeedback() {
  const [flash, setFlash] = useState<string | null>(null);

  const trigger = useCallback((message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 1400);
  }, []);

  return { flash, trigger };
}

function JuiceButton({
  label,
  sublabel,
  onClick,
  variant,
  disabled,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
  variant: "wall" | "intervention" | "record" | "muted";
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  const styles = {
    wall: "bg-accent-red/15 border-accent-red/50 text-accent-red active:bg-accent-red/30",
    intervention:
      "bg-orange-400/12 border-orange-400/45 text-orange-200 active:bg-orange-400/25",
    record: "bg-purple-mid/15 border-purple-mid/60 text-purple-vivid active:bg-purple-mid/30",
    muted: "bg-panel border-panelBorder text-text-muted",
  };

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => {
        setPressed(false);
        onClick();
      }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      className={`
        min-h-[72px] w-full min-w-0 overflow-hidden rounded-lg border p-3
        flex flex-col items-center justify-center gap-1
        font-display font-bold tracking-wider transition-all duration-100 select-none
        ${styles[variant]}
        ${pressed ? "scale-95 brightness-90" : "scale-100"}
        ${disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}
      `}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="text-center text-sm font-black leading-tight sm:text-base">{label}</span>
      {sublabel && (
        <span className="max-w-full truncate text-[9px] font-mono tracking-[0.22em] opacity-70">
          {sublabel}
        </span>
      )}
    </button>
  );
}

function TeamControlCard({
  team,
  penaltySummary,
  records,
  onPenalty,
  onRecord,
  disabled,
}: {
  team: { id: number; name: string } | null;
  penaltySummary: TeamPenaltySummary;
  records: RecordEvent[];
  onPenalty: (penaltyType: PenaltyType) => void;
  onRecord: () => void;
  disabled: boolean;
}) {
  const latestRecord = getLatestRecord(records);
  const adjustedElapsedMs = latestRecord
    ? getAdjustedElapsedMs(latestRecord.recorded_elapsed_ms, penaltySummary)
    : null;
  const actionsDisabled = disabled || penaltySummary.eliminated;

  return (
    <div className="min-w-0 flex flex-col gap-3 rounded-lg border border-panelBorder/60 bg-panel/80 p-3 sm:p-4 shadow-panel">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-base font-bold tracking-wider text-text-primary">
            {team?.name ?? "TBD"}
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.22em] text-text-muted">
            {getPenaltyBreakdown(penaltySummary)}
          </div>
        </div>
        {penaltySummary.eliminated && (
          <span className="shrink-0 rounded-full border border-accent-red/45 bg-accent-red/12 px-2.5 py-1 font-mono text-[9px] tracking-[0.22em] text-accent-red">
            ELIMINATED
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-panelBorder/50 bg-void/35 px-3 py-3">
          <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">TEAM RECORD</div>
          <div
            className={`mt-2 font-display text-2xl font-black ${
              penaltySummary.eliminated ? "text-accent-red" : "text-text-primary"
            }`}
          >
            {penaltySummary.eliminated
              ? "OUT"
              : adjustedElapsedMs !== null
                ? formatTime(adjustedElapsedMs)
                : "--:--.--"}
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.18em] text-text-muted">
            RAW {latestRecord ? formatTime(latestRecord.recorded_elapsed_ms) : "--:--.--"}
          </div>
        </div>
        <div className="rounded-lg border border-panelBorder/50 bg-void/35 px-3 py-3">
          <div className="font-mono text-[9px] tracking-[0.22em] text-text-muted">PENALTY TIME</div>
          <div
            className={`mt-2 font-display text-2xl font-black ${
              penaltySummary.total_seconds > 0 ? "text-accent-red" : "text-text-dim"
            }`}
          >
            +{penaltySummary.total_seconds}s
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.18em] text-text-muted">
            {penaltySummary.intervention_count}/4 interventions
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-panelBorder/50 bg-void/35 px-3 py-2">
          <div className="font-mono text-[9px] tracking-[0.2em] text-text-muted">WALLS</div>
          <div className="mt-1 font-display text-xl font-black text-text-primary">
            {penaltySummary.hit_the_wall_count}
          </div>
          <div className="font-mono text-[9px] text-text-muted">+{penaltySummary.hit_the_wall_seconds}s</div>
        </div>
        <div className="rounded-lg border border-panelBorder/50 bg-void/35 px-3 py-2">
          <div className="font-mono text-[9px] tracking-[0.2em] text-text-muted">INTERVENTIONS</div>
          <div
            className={`mt-1 font-display text-xl font-black ${
              penaltySummary.intervention_count >= 3 ? "text-orange-200" : "text-text-primary"
            }`}
          >
            {penaltySummary.intervention_count}
          </div>
          <div className="font-mono text-[9px] text-text-muted">+{penaltySummary.intervention_seconds}s</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <JuiceButton
          label="+ HIT WALL"
          sublabel="+2S"
          variant="wall"
          onClick={() => onPenalty("hit_the_wall")}
          disabled={!team || actionsDisabled}
        />
        <JuiceButton
          label="+ INTERVENTION"
          sublabel="+5S · 4TH = OUT"
          variant="intervention"
          onClick={() => onPenalty("intervention")}
          disabled={!team || actionsDisabled}
        />
      </div>

      <JuiceButton
        label="RECORD TIME"
        sublabel={penaltySummary.eliminated ? "DISABLED AFTER ELIMINATION" : "SAVE CURRENT CHRONO"}
        variant="record"
        onClick={onRecord}
        disabled={!team || actionsDisabled}
      />
    </div>
  );
}

export default function JuryPage() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [timerData, setTimerData] = useState({
    isRunning: false,
    baseElapsedMs: 0,
  });
  const [penalties, setPenalties] = useState<Record<number, TeamPenaltySummary>>({});
  const [records, setRecords] = useState<Record<number, RecordEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { flash, trigger } = useFeedback();

  const elapsedMs = useTimer(timerData.baseElapsedMs, timerData.isRunning);

  const lastAction = useRef<number>(0);
  const canAct = () => {
    const now = Date.now();
    if (now - lastAction.current < 600) return false;
    lastAction.current = now;
    return true;
  };

  const loadState = useCallback(async () => {
    try {
      const state = await api.getState();
      setLoadError(null);
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
      setLoadError(error instanceof Error ? error.message : "Unable to reach the control server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useWebSocket((msg: WSMessage) => {
    switch (msg.type) {
      case "timer_started":
        setTimerData({ isRunning: true, baseElapsedMs: msg.accumulated_elapsed_ms });
        break;
      case "timer_stopped":
        setTimerData({ isRunning: false, baseElapsedMs: msg.accumulated_elapsed_ms });
        break;
      case "timer_reset":
        setTimerData({ isRunning: false, baseElapsedMs: 0 });
        break;
      case "penalty_added":
        setPenalties((prev) => ({ ...prev, [msg.team_id]: msg.penalty_summary }));
        if (msg.eliminated) {
          trigger(`TEAM ${msg.team_id} ELIMINATED`);
        }
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
        break;
      case "bracket_initialized":
      case "active_match_changed":
      case "tournament_reset":
        loadState();
        break;
      default:
        break;
    }
  });

  const handlePenalty = useCallback(
    async (teamId: number, teamName: string, penaltyType: PenaltyType) => {
      if (!activeMatch || busy || !canAct()) return;
      setBusy(true);
      try {
        await api.addPenalty(activeMatch.id, teamId, penaltyType, "jury");
        trigger(`${getPenaltyTypeLabel(penaltyType).toUpperCase()} · ${teamName}`);
      } finally {
        setBusy(false);
      }
    },
    [activeMatch, busy, trigger]
  );

  const handleRecord = useCallback(
    async (teamId: number, teamName: string) => {
      if (!activeMatch || busy || !canAct()) return;
      setBusy(true);
      try {
        await api.addRecord(activeMatch.id, teamId, "jury");
        trigger(`${teamName} ${formatTime(elapsedMs)}`);
      } finally {
        setBusy(false);
      }
    },
    [activeMatch, busy, elapsedMs, trigger]
  );

  const team1 = activeMatch?.team1 ?? null;
  const team2 = activeMatch?.team2 ?? null;
  const team1PenaltySummary = getTeamPenaltySummary(penalties, team1?.id);
  const team2PenaltySummary = getTeamPenaltySummary(penalties, team2?.id);

  return (
    <div
      className="min-h-[100dvh] overflow-y-auto bg-void grid-bg"
      style={{
        WebkitUserSelect: "none",
        userSelect: "none",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
      }}
    >
      {flash && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="rounded-2xl bg-purple-mid/90 px-8 py-4 font-display text-xl font-black text-white shadow-glow-purple backdrop-blur-sm animate-[fadeIn_0.1s_ease]">
            {flash}
          </div>
        </div>
      )}

      <div className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-panelBorder/60 bg-panel/95 px-3 py-3 backdrop-blur-md sm:px-5">
        <div className="font-display text-xs font-black tracking-widest text-purple-vivid sm:text-sm">A.R.B</div>
        <div className="min-w-0 truncate text-center font-mono text-[10px] tracking-widest text-text-muted">
          African Robotic Brains
        </div>
        <div className="hidden items-center gap-1.5 font-mono text-[10px] text-accent-green sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
          READY
        </div>
      </div>

      {activeMatch ? (
        <div className="border-b border-panelBorder/40 bg-void/80 px-3 py-3 sm:px-5">
          <div className="mb-1 font-mono text-[9px] tracking-[0.35em] text-text-muted">
            {["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]}
          </div>
          <div className="break-words font-display text-base font-bold tracking-wide text-text-primary sm:text-lg">
            {team1?.name ?? "TBD"} <span className="mx-1 text-sm text-purple-mid">VS</span> {team2?.name ?? "TBD"}
          </div>
        </div>
      ) : (
        <div className="border-b border-panelBorder/40 py-4 text-center font-mono text-xs tracking-widest text-text-muted">
          NO ACTIVE MATCH
        </div>
      )}

      <div className="border-b border-panelBorder/40 bg-panel/30 px-3 py-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-panelBorder/60 px-3 py-1 font-mono text-[9px] tracking-[0.22em] text-text-secondary">
            WALL = +2s
          </span>
          <span className="rounded-full border border-panelBorder/60 px-3 py-1 font-mono text-[9px] tracking-[0.22em] text-text-secondary">
            INTERVENTION = +5s
          </span>
          <span className="rounded-full border border-accent-red/35 bg-accent-red/10 px-3 py-1 font-mono text-[9px] tracking-[0.22em] text-accent-red">
            4 INTERVENTIONS = OUT
          </span>
        </div>
      </div>

      <div className="border-b border-panelBorder/40 bg-panel/30 px-3 py-4 text-center">
        <div
          className={`font-display text-4xl font-black tracking-wider ${
            timerData.isRunning ? "text-text-primary glow-text" : "text-text-secondary"
          }`}
        >
          {formatTime(elapsedMs)}
        </div>
        <div
          className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[9px] tracking-widest ${
            timerData.isRunning
              ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
              : "border-panelBorder text-text-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              timerData.isRunning ? "bg-accent-green animate-pulse" : "bg-text-dim"
            }`}
          />
          {timerData.isRunning ? "RUNNING" : "STOPPED"}
        </div>
      </div>

      {loadError && !loading && (
        <div className="border-b border-accent-red/30 bg-accent-red/10 px-3 py-4">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <div className="font-display text-sm font-black tracking-widest text-accent-red">
              CONTROL SERVER UNREACHABLE
            </div>
            <div className="font-mono text-[10px] leading-5 tracking-[0.16em] text-text-secondary">
              {loadError}
            </div>
            <button
              onClick={() => {
                setLoading(true);
                loadState();
              }}
              className="rounded-lg border border-accent-red/45 bg-accent-red/10 px-4 py-2 font-mono text-[10px] tracking-[0.22em] text-accent-red transition-colors hover:bg-accent-red/20"
            >
              RETRY
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="min-h-[45dvh] flex items-center justify-center">
          <div className="font-display text-xs tracking-widest text-purple-vivid animate-pulse">LOADING…</div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:max-w-5xl sm:grid sm:grid-cols-2 sm:gap-4 sm:p-4">
          <TeamControlCard
            team={team1}
            penaltySummary={team1PenaltySummary}
            records={team1 ? records[team1.id] ?? [] : []}
            onPenalty={(penaltyType) => team1 && handlePenalty(team1.id, team1.name, penaltyType)}
            onRecord={() => team1 && handleRecord(team1.id, team1.name)}
            disabled={!team1 || busy || !activeMatch}
          />

          <TeamControlCard
            team={team2}
            penaltySummary={team2PenaltySummary}
            records={team2 ? records[team2.id] ?? [] : []}
            onPenalty={(penaltyType) => team2 && handlePenalty(team2.id, team2.name, penaltyType)}
            onRecord={() => team2 && handleRecord(team2.id, team2.name)}
            disabled={!team2 || busy || !activeMatch}
          />
        </div>
      )}

      <div className="h-2" />
    </div>
  );
}
