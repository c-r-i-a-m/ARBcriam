"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTimer, formatTime } from "@/hooks/useTimer";
import type { Match, WSMessage, RecordEvent } from "@/types";

// ─── Feedback flash ───────────────────────────────────────────────────────────
function useFeedback() {
  const [flash, setFlash] = useState<string | null>(null);
  const trigger = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1200);
  }, []);
  return { flash, trigger };
}

// ─── Juice button ─────────────────────────────────────────────────────────────
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
  variant: "penalty" | "record" | "muted";
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  const styles = {
    penalty: "bg-accent-red/15 border-accent-red/50 text-accent-red active:bg-accent-red/30",
    record:  "bg-purple-mid/15 border-purple-mid/60 text-purple-vivid active:bg-purple-mid/30",
    muted:   "bg-panel border-panelBorder text-text-muted",
  };

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      className={`
        min-w-0 w-full overflow-hidden rounded-lg border font-display font-bold tracking-wider
        flex flex-col items-center justify-center gap-1
        transition-all duration-100 select-none
        min-h-[72px] p-3 sm:min-h-[92px] sm:p-4
        ${styles[variant]}
        ${pressed ? "scale-95 brightness-90" : "scale-100"}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
      `}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="text-lg sm:text-xl font-black leading-tight text-center break-words">{label}</span>
      {sublabel && (
        <span className="max-w-full truncate text-[10px] sm:text-xs font-mono tracking-widest opacity-70">
          {sublabel}
        </span>
      )}
    </button>
  );
}

// ─── Jury Page ────────────────────────────────────────────────────────────────
export default function JuryPage() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [timerData, setTimerData]     = useState({ isRunning: false, accMs: 0, startedAt: null as string | null });
  const [penalties, setPenalties]     = useState<Record<number, number>>({});
  const [records, setRecords]         = useState<Record<number, RecordEvent[]>>({});
  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState(false);
  const { flash, trigger }            = useFeedback();
  const elapsedMs = useTimer(timerData.accMs, timerData.isRunning, timerData.startedAt);

  // Debounce to prevent spam
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
      } else {
        setTimerData({ isRunning: false, accMs: 0, startedAt: null });
      }
      if (state.penalties) setPenalties(state.penalties);
      if (state.records) {
        const byTeam: Record<number, RecordEvent[]> = {};
        for (const [tid, recs] of Object.entries(state.records)) {
          byTeam[Number(tid)] = recs as RecordEvent[];
        }
        setRecords(byTeam);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  useWebSocket((msg: WSMessage) => {
    switch (msg.type) {
      case "timer_started":
        setTimerData({ isRunning: true, accMs: msg.accumulated_elapsed_ms, startedAt: msg.started_at });
        break;
      case "timer_stopped":
        setTimerData({ isRunning: false, accMs: msg.accumulated_elapsed_ms, startedAt: null });
        break;
      case "timer_reset":
        setTimerData({ isRunning: false, accMs: 0, startedAt: null });
        break;
      case "penalty_added":
        setPenalties(prev => ({ ...prev, [msg.team_id]: msg.total_penalties }));
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
        break;
      case "bracket_initialized":
      case "active_match_changed":
      case "tournament_reset":
        loadState();
        break;
    }
  });

  const handlePenalty = useCallback(async (teamId: number, teamName: string) => {
    if (!activeMatch || busy || !canAct()) return;
    setBusy(true);
    try {
      await api.addPenalty(activeMatch.id, teamId, "jury");
      trigger(`⚠ ${teamName}`);
    } finally {
      setBusy(false);
    }
  }, [activeMatch, busy, trigger]);

  const handleRecord = useCallback(async (teamId: number, teamName: string) => {
    if (!activeMatch || busy || !canAct()) return;
    setBusy(true);
    try {
      await api.addRecord(activeMatch.id, teamId, "jury");
      trigger(`${teamName} ${formatTime(elapsedMs)}`);
    } finally {
      setBusy(false);
    }
  }, [activeMatch, busy, elapsedMs, trigger]);

  const team1 = activeMatch?.team1 ?? null;
  const team2 = activeMatch?.team2 ?? null;
  const team1LastRecord = team1 ? records[team1.id]?.at(-1) : null;
  const team2LastRecord = team2 ? records[team2.id]?.at(-1) : null;

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
      {/* Flash feedback */}
      {flash && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="px-8 py-4 rounded-2xl bg-purple-mid/90 backdrop-blur-sm font-display text-xl font-black text-white shadow-glow-purple animate-[fadeIn_0.1s_ease]">
            {flash}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 sm:px-5 border-b border-panelBorder/60 bg-panel/95 backdrop-blur-md">
        <div className="font-display text-xs sm:text-sm font-black tracking-widest text-purple-vivid">A.R.B</div>
        <div className="min-w-0 text-center font-mono text-[10px] tracking-widest text-text-muted truncate">African Robotic Brains</div>
        <div className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-accent-green">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
          READY
        </div>
      </div>

      {/* Match info */}
      {activeMatch ? (
        <div className="px-3 py-3 sm:px-5 border-b border-panelBorder/40 bg-void/80">
          <div className="font-mono text-[9px] tracking-[0.35em] text-text-muted mb-1">
            {["", "ROUND OF 16", "QUARTER-FINALS", "SEMI-FINALS", "FINAL"][activeMatch.round]}
          </div>
          <div className="font-display text-base sm:text-lg font-bold text-text-primary tracking-wide leading-tight break-words">
            {team1?.name ?? "TBD"} <span className="text-purple-mid text-sm mx-1">VS</span> {team2?.name ?? "TBD"}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 px-3 font-mono text-xs text-text-muted tracking-widest border-b border-panelBorder/40">
          NO ACTIVE MATCH
        </div>
      )}

      {/* Global chrono snapshot source */}
      <div className="border-b border-panelBorder/40 bg-panel/30 px-3 py-4 text-center">
        <div className={`font-display text-4xl font-black tracking-wider ${timerData.isRunning ? "text-text-primary glow-text" : "text-text-secondary"}`}>
          {formatTime(elapsedMs)}
        </div>
        <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[9px] tracking-widest ${
          timerData.isRunning
            ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
            : "border-panelBorder text-text-muted"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${timerData.isRunning ? "bg-accent-green animate-pulse" : "bg-text-dim"}`} />
          {timerData.isRunning ? "RUNNING" : "STOPPED"}
        </div>
      </div>

      {/* Recorded time summary */}
      <div className="grid grid-cols-2 gap-px bg-panelBorder/40 border-b border-panelBorder/40">
        <div className="min-w-0 bg-panel/30 px-3 py-3 sm:px-4 sm:py-4 text-center">
          <div className="font-mono text-[9px] tracking-widest text-text-muted mb-1 truncate">{team1?.name ?? "LEFT"}</div>
          <div className="font-display text-xl sm:text-2xl font-black text-text-secondary">
            {team1LastRecord ? formatTime(team1LastRecord.recorded_elapsed_ms) : "--:--.--"}
          </div>
        </div>
        <div className="min-w-0 bg-panel/30 px-3 py-3 sm:px-4 sm:py-4 text-center">
          <div className="font-mono text-[9px] tracking-widest text-text-muted mb-1 truncate">{team2?.name ?? "RIGHT"}</div>
          <div className="font-display text-xl sm:text-2xl font-black text-text-secondary">
            {team2LastRecord ? formatTime(team2LastRecord.recorded_elapsed_ms) : "--:--.--"}
          </div>
        </div>
      </div>

      {/* Team controls */}
      {loading ? (
        <div className="min-h-[45dvh] flex items-center justify-center">
          <div className="font-display text-purple-vivid text-xs tracking-widest animate-pulse">LOADING…</div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:grid sm:max-w-5xl sm:grid-cols-2 sm:gap-4 sm:p-4">
          {/* Team 1 */}
          <div className="min-w-0 flex flex-col gap-2 rounded-lg border border-panelBorder/60 bg-panel/80 p-3 sm:p-4 shadow-panel">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 truncate font-display text-base font-bold tracking-wider text-text-primary">
                {team1?.name ?? "TBD"}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted">PENALTIES</span>
                <span className={`font-display text-2xl font-black ${(team1 ? penalties[team1.id] ?? 0 : 0) > 0 ? "text-accent-red" : "text-text-dim"}`}>
                  {team1 ? (penalties[team1.id] ?? 0) : 0}
                </span>
              </div>
            </div>
            <JuiceButton
              label="+ PENALTY"
              sublabel={team1?.name}
              variant="penalty"
              onClick={() => team1 && handlePenalty(team1.id, team1.name)}
              disabled={!team1 || busy || !activeMatch}
            />
            <div>
              <JuiceButton
                label="RECORD TIME"
                sublabel={team1LastRecord ? formatTime(team1LastRecord.recorded_elapsed_ms) : team1?.name}
                variant="record"
                onClick={() => team1 && handleRecord(team1.id, team1.name)}
                disabled={!team1 || busy || !activeMatch}
              />
            </div>
          </div>

          {/* Team 2 */}
          <div className="min-w-0 flex flex-col gap-2 rounded-lg border border-panelBorder/60 bg-panel/80 p-3 sm:p-4 shadow-panel">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 truncate font-display text-base font-bold tracking-wider text-text-primary">
                {team2?.name ?? "TBD"}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted">PENALTIES</span>
                <span className={`font-display text-2xl font-black ${(team2 ? penalties[team2.id] ?? 0 : 0) > 0 ? "text-accent-red" : "text-text-dim"}`}>
                  {team2 ? (penalties[team2.id] ?? 0) : 0}
                </span>
              </div>
            </div>
            <JuiceButton
              label="+ PENALTY"
              sublabel={team2?.name}
              variant="penalty"
              onClick={() => team2 && handlePenalty(team2.id, team2.name)}
              disabled={!team2 || busy || !activeMatch}
            />
            <div>
              <JuiceButton
                label="RECORD TIME"
                sublabel={team2LastRecord ? formatTime(team2LastRecord.recorded_elapsed_ms) : team2?.name}
                variant="record"
                onClick={() => team2 && handleRecord(team2.id, team2.name)}
                disabled={!team2 || busy || !activeMatch}
              />
            </div>
          </div>
        </div>
      )}

      <div className="h-2" />
    </div>
  );
}
