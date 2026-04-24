"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { Match, Team, WSMessage } from "@/types";
import Link from "next/link";

const CARD_W = 148;
const CARD_H = 46;
const H_GAP = 56;
const V_GAP = 16;

const ROUND_SLOTS = [4, 2, 1, 0];

function getRoundLabel(round: number) {
  return ["", "Round of 16", "Quarter-Finals", "Semi-Finals", "Final"][round] ?? `R${round}`;
}

function getTeamBgClass(match: Match, teamId: number | null, activeMatchId: number | null) {
  if (!teamId) return "bg-panel border-panelBorder";
  if (match.winner_id === teamId) return "bg-purple-dim/60 border-purple-soft/60";
  if (match.id === activeMatchId) return "bg-panelHover border-purple-mid/60";
  return "bg-panel border-panelBorder hover:border-purple-mid/40";
}

function TeamCard({
  team,
  match,
  slot,
  activeMatchId,
  onWinnerClick,
  isDragging,
  onDragStart,
  onDrop,
}: {
  team: Team | null;
  match: Match;
  slot: 1 | 2;
  activeMatchId: number | null;
  onWinnerClick: (matchId: number, teamId: number) => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => void;
  onDrop: (e: React.DragEvent, matchId: number, slot: 1 | 2) => void;
}) {
  const isWinner = team && match.winner_id === team.id;
  const isActive = match.id === activeMatchId;
  const isLoser  = match.winner_id && team && match.winner_id !== team.id;

  return (
    <div
      className={`
        relative flex items-center gap-2 px-3 rounded-md border cursor-pointer
        transition-all duration-200 no-select bracket-card
        ${isWinner ? "bg-purple-dim/70 border-purple-soft/70 shadow-glow-sm" : ""}
        ${isLoser  ? "bg-panel/40 border-panelBorder/40 opacity-40" : ""}
        ${!isWinner && !isLoser && team ? "bg-panel border-panelBorder hover:border-purple-mid/50" : ""}
        ${!team ? "bg-panel/30 border-dashed border-panelBorder/40" : ""}
        ${isActive && !isWinner && !isLoser ? "border-purple-mid/70 shadow-glow-sm" : ""}
      `}
      style={{ height: CARD_H, width: CARD_W }}
      draggable={!!team && match.status !== "completed"}
      onDragStart={(e) => team && onDragStart(e, team.id, match.id, slot)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, match.id, slot)}
      onClick={() => {
        if (team && match.status !== "completed" && match.team1_id && match.team2_id) {
          onWinnerClick(match.id, team.id);
        }
      }}
    >
      {team?.seed && (
        <span className="font-mono text-[9px] text-text-muted min-w-[16px] text-center">
          {String(team.seed).padStart(2, "0")}
        </span>
      )}

      <span className={`
        font-display text-[11px] font-semibold tracking-wider truncate flex-1
        ${isWinner ? "text-purple-bright" : ""}
        ${isLoser  ? "text-text-muted" : ""}
        ${!isWinner && !isLoser && team ? "text-text-primary" : ""}
        ${!team ? "text-text-dim" : ""}
      `}>
        {team?.name ?? "TBD"}
      </span>

      {isWinner && (
        <span className="text-accent-yellow text-[10px]">★</span>
      )}

      {isActive && !isWinner && !isLoser && team && (
        <span className="w-1.5 h-1.5 rounded-full bg-purple-vivid animate-pulse-slow shrink-0" />
      )}
    </div>
  );
}

function MatchNode({
  match,
  activeMatchId,
  onWinnerClick,
  onDragStart,
  onDrop,
  onSetActive,
  isFinal = false,
}: {
  match: Match;
  activeMatchId: number | null;
  onWinnerClick: (matchId: number, teamId: number) => void;
  onDragStart: (e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => void;
  onDrop: (e: React.DragEvent, matchId: number, slot: 1 | 2) => void;
  onSetActive: (matchId: number) => void;
  isFinal?: boolean;
}) {
  const isActive = match.id === activeMatchId;

  return (
    <div
      className={`
        relative flex flex-col gap-[3px] group
        ${isFinal ? "scale-110" : ""}
      `}
    >
      <div
        className={`
          absolute -top-5 left-0 right-0 text-center font-mono text-[8px] tracking-widest
          transition-opacity duration-200
          ${isActive ? "text-purple-vivid opacity-100" : "text-text-dim opacity-0 group-hover:opacity-60"}
        `}
      >
        {isActive ? "● LIVE" : `M${match.id}`}
      </div>

      <TeamCard
        team={match.team1} match={match} slot={1}
        activeMatchId={activeMatchId}
        onWinnerClick={onWinnerClick}
        isDragging={false}
        onDragStart={onDragStart}
        onDrop={onDrop}
      />

      <div className="flex items-center gap-1 px-3">
        <div className="flex-1 h-px bg-panelBorder/60" />
        <span className="font-mono text-[8px] text-text-dim tracking-widest">VS</span>
        <div className="flex-1 h-px bg-panelBorder/60" />
      </div>

      <TeamCard
        team={match.team2} match={match} slot={2}
        activeMatchId={activeMatchId}
        onWinnerClick={onWinnerClick}
        isDragging={false}
        onDragStart={onDragStart}
        onDrop={onDrop}
      />

      {!isActive && match.team1_id && match.team2_id && match.status !== "completed" && (
        <button
          onClick={() => onSetActive(match.id)}
          className="absolute -bottom-6 left-0 right-0 text-center font-mono text-[8px] text-text-dim hover:text-purple-vivid transition-colors opacity-0 group-hover:opacity-100"
        >
          SET ACTIVE →
        </button>
      )}
    </div>
  );
}

function BracketConnectors({
  matchPositions,
  matches,
}: {
  matchPositions: Map<number, { x: number; y: number }>;
  matches: Match[];
}) {
  const lines: React.ReactNode[] = [];

  matches.forEach((match) => {
    if (!match.next_match_id) return;
    const from = matchPositions.get(match.id);
    const to   = matchPositions.get(match.next_match_id);
    if (!from || !to) return;

    const fromX = from.x + CARD_W;
    const fromY = from.y + (CARD_H * 2 + 3 + 14) / 2;
    const toX   = to.x;
    const toY   = to.y + (CARD_H * 2 + 3 + 14) / 2;

    const midX = (fromX + toX) / 2;
    const hasWinner = !!match.winner_id;

    lines.push(
      <path
        key={`${match.id}->${match.next_match_id}`}
        d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
        fill="none"
        stroke={hasWinner ? "rgba(39,24,126,0.48)" : "rgba(217,213,234,0.85)"}
        strokeWidth={hasWinner ? 1.5 : 1}
        strokeDasharray={hasWinner ? "none" : "4 4"}
      />
    );
  });

  matches.filter(m => m.side === "right").forEach((match) => {
    if (!match.next_match_id) return;
    const from = matchPositions.get(match.id);
    const to   = matchPositions.get(match.next_match_id);
    if (!from || !to) return;

    const fromX = from.x;
    const fromY = from.y + (CARD_H * 2 + 3 + 14) / 2;
    const toX   = to.x + CARD_W;
    const toY   = to.y + (CARD_H * 2 + 3 + 14) / 2;

    const midX = (fromX + toX) / 2;
    const hasWinner = !!match.winner_id;

    lines.push(
      <path
        key={`r-${match.id}->${match.next_match_id}`}
        d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
        fill="none"
        stroke={hasWinner ? "rgba(39,24,126,0.48)" : "rgba(217,213,234,0.85)"}
        strokeWidth={hasWinner ? 1.5 : 1}
        strokeDasharray={hasWinner ? "none" : "4 4"}
      />
    );
  });

  return <>{lines}</>;
}

export default function BracketPage() {
  const [matches, setMatches]       = useState<Match[]>([]);
  const [teams, setTeams]           = useState<Team[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [winnerModal, setWinnerModal] = useState<{ matchId: number; teamId: number } | null>(null);
  const [dragInfo, setDragInfo]     = useState<{ teamId: number; matchId: number; slot: 1 | 2 } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const state = await api.getState();
      setMatches(state.matches ?? []);
      setTeams(state.teams ?? []);
      setActiveMatchId(state.active_match_id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useWebSocket((msg: WSMessage) => {
    if (["bracket_updated", "winner_selected", "active_match_changed", "bracket_initialized", "tournament_reset"].includes(msg.type)) {
      loadData();
    }
    if (msg.type === "active_match_changed") setActiveMatchId(msg.match_id);
  });

  const handleWinnerClick = useCallback(async (matchId: number, teamId: number) => {
    setWinnerModal({ matchId, teamId });
  }, []);

  const confirmWinner = useCallback(async () => {
    if (!winnerModal) return;
    try {
      await api.selectWinner(winnerModal.matchId, winnerModal.teamId);
      setWinnerModal(null);
      loadData();
    } catch (e) { console.error(e); }
  }, [winnerModal, loadData]);

  const handleSetActive = useCallback(async (matchId: number) => {
    try {
      await api.setActiveMatch(matchId);
      setActiveMatchId(matchId);
    } catch (e) { console.error(e); }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => {
    setDragInfo({ teamId, matchId, slot });
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetMatchId: number, targetSlot: 1 | 2) => {
    e.preventDefault();
    if (!dragInfo) return;
    if (dragInfo.matchId === targetMatchId && dragInfo.slot === targetSlot) return;

    try {
      const update = targetSlot === 1
        ? { match_id: targetMatchId, team1_id: dragInfo.teamId }
        : { match_id: targetMatchId, team2_id: dragInfo.teamId };
      await api.updateMatch(targetMatchId, update.team1_id, update.team2_id);
      setDragInfo(null);
      loadData();
    } catch (e) { console.error(e); }
  }, [dragInfo, loadData]);

  const MATCH_NODE_H = CARD_H * 2 + 3 + 14;
  const leftR16  = matches.filter(m => m.round === 1 && m.side === "left").sort((a, b) => a.slot_index - b.slot_index);
  const leftQF   = matches.filter(m => m.round === 2 && m.side === "left").sort((a, b) => a.slot_index - b.slot_index);
  const leftSF   = matches.filter(m => m.round === 3 && m.side === "left");
  const rightR16 = matches.filter(m => m.round === 1 && m.side === "right").sort((a, b) => a.slot_index - b.slot_index);
  const rightQF  = matches.filter(m => m.round === 2 && m.side === "right").sort((a, b) => a.slot_index - b.slot_index);
  const rightSF  = matches.filter(m => m.round === 3 && m.side === "right");
  const final    = matches.find(m => m.round === 4);

  const R16_PITCH = MATCH_NODE_H + 28;
  const totalH = 4 * R16_PITCH + 60;

  const leftR16Y  = leftR16.map((_, i) => 30 + i * R16_PITCH);
  const leftQFY   = leftQF.map((_, i) => 30 + R16_PITCH / 2 + i * R16_PITCH * 2);
  const leftSFY   = [(totalH - MATCH_NODE_H) / 2];
  const rightR16Y = rightR16.map((_, i) => 30 + i * R16_PITCH);
  const rightQFY  = rightQF.map((_, i) => 30 + R16_PITCH / 2 + i * R16_PITCH * 2);
  const rightSFY  = [(totalH - MATCH_NODE_H) / 2];
  const finalY    = (totalH - MATCH_NODE_H) / 2;

  const PADDING = 40;
  const leftR16X  = PADDING;
  const leftQFX   = PADDING + CARD_W + H_GAP;
  const leftSFX   = PADDING + (CARD_W + H_GAP) * 2;
  const centerX   = PADDING + (CARD_W + H_GAP) * 3;
  const rightSFX  = centerX + CARD_W + H_GAP;
  const rightQFX  = rightSFX + CARD_W + H_GAP;
  const rightR16X = rightQFX + CARD_W + H_GAP;
  const totalW    = rightR16X + CARD_W + PADDING;

  type MatchPos = { x: number; y: number };
  const matchPositions = new Map<number, MatchPos>();

  leftR16.forEach((m, i)  => matchPositions.set(m.id, { x: leftR16X, y: leftR16Y[i] }));
  leftQF.forEach((m, i)   => matchPositions.set(m.id, { x: leftQFX, y: leftQFY[i] }));
  leftSF.forEach((m, i)   => matchPositions.set(m.id, { x: leftSFX, y: leftSFY[i] }));
  if (final)                 matchPositions.set(final.id, { x: centerX, y: finalY });
  rightSF.forEach((m, i)  => matchPositions.set(m.id, { x: rightSFX, y: rightSFY[i] }));
  rightQF.forEach((m, i)  => matchPositions.set(m.id, { x: rightQFX, y: rightQFY[i] }));
  rightR16.forEach((m, i) => matchPositions.set(m.id, { x: rightR16X, y: rightR16Y[i] }));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display text-purple-vivid text-sm tracking-widest animate-pulse">LOADING BRACKET…</div>
    </div>
  );

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      <header className="flex items-center justify-between px-8 py-4 border-b border-panelBorder/60 glass-panel sticky top-0 z-20">
        <Link href="/" className="font-display text-xl font-black tracking-wider text-text-primary hover:text-purple-vivid transition-colors">
          A.R.B
        </Link>
        <div className="text-center">
          <div className="font-display text-lg font-bold tracking-widest text-text-primary">African Robotic Brains</div>
          <div className="font-mono text-xs text-text-muted tracking-widest">16 TEAMS · SINGLE ELIMINATION</div>
        </div>
        <div className="flex gap-3">
          <Link href="/timer" className="px-3 py-1.5 rounded border border-panelBorder text-text-secondary font-mono text-xs hover:border-purple-mid/50 hover:text-purple-vivid transition-all">
            MATCH CTRL →
          </Link>
        </div>
      </header>

      <div className="border-b border-panelBorder/50 bg-panel/35 px-8 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.22em] text-text-secondary">
          <span className="rounded-full border border-panelBorder/70 px-3 py-1">HIT THE WALL = +2s</span>
          <span className="rounded-full border border-panelBorder/70 px-3 py-1">INTERVENTION = +5s</span>
          <span className="rounded-full border border-accent-red/35 bg-accent-red/10 px-3 py-1 text-accent-red">
            4 INTERVENTIONS = ELIMINATION
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-[40px] pt-5 pb-2" style={{ width: totalW, minWidth: totalW }}>
        {[
          { x: leftR16X + CARD_W/2, label: "ROUND OF 16" },
          { x: leftQFX + CARD_W/2, label: "QUARTER-FINALS" },
          { x: leftSFX + CARD_W/2, label: "SEMI-FINALS" },
          { x: centerX + CARD_W/2, label: "⬡ FINAL" },
          { x: rightSFX + CARD_W/2, label: "SEMI-FINALS" },
          { x: rightQFX + CARD_W/2, label: "QUARTER-FINALS" },
          { x: rightR16X + CARD_W/2, label: "ROUND OF 16" },
        ].map((item) => (
          <div key={item.label + item.x} className="font-mono text-[9px] tracking-widest text-text-muted text-center">
            {item.label}
          </div>
        ))}
      </div>

      <div className="overflow-auto flex-1 pb-12 relative">
        <div style={{ width: totalW, height: totalH + 80, position: "relative", margin: "0 auto" }}>
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            viewBox={`0 0 ${totalW} ${totalH + 80}`}
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {[...leftR16, ...leftQF, ...leftSF].map((match) => {
              if (!match.next_match_id) return null;
              const from = matchPositions.get(match.id);
              const to   = matchPositions.get(match.next_match_id);
              if (!from || !to) return null;
              const fromX = from.x + CARD_W;
              const fromY = from.y + MATCH_NODE_H / 2;
              const toX   = to.x;
              const toY   = to.y + MATCH_NODE_H / 2;
              const midX  = (fromX + toX) / 2;
              const isLit = !!match.winner_id;
              return (
                <path key={`l-${match.id}`}
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
                  fill="none"
                  stroke={isLit ? "rgba(39,24,126,0.5)" : "rgba(217,213,234,0.9)"}
                  strokeWidth={isLit ? 1.5 : 1}
                  strokeDasharray={isLit ? undefined : "4 3"}
                  filter={isLit ? "url(#glow)" : undefined}
                />
              );
            })}
            {[...rightR16, ...rightQF, ...rightSF].map((match) => {
              if (!match.next_match_id) return null;
              const from = matchPositions.get(match.id);
              const to   = matchPositions.get(match.next_match_id);
              if (!from || !to) return null;
              const fromX = from.x;
              const fromY = from.y + MATCH_NODE_H / 2;
              const toX   = to.x + CARD_W;
              const toY   = to.y + MATCH_NODE_H / 2;
              const midX  = (fromX + toX) / 2;
              const isLit = !!match.winner_id;
              return (
                <path key={`r-${match.id}`}
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
                  fill="none"
                  stroke={isLit ? "rgba(39,24,126,0.5)" : "rgba(217,213,234,0.9)"}
                  strokeWidth={isLit ? 1.5 : 1}
                  strokeDasharray={isLit ? undefined : "4 3"}
                  filter={isLit ? "url(#glow)" : undefined}
                />
              );
            })}
          </svg>

          {matches.map((match) => {
            const pos = matchPositions.get(match.id);
            if (!pos) return null;
            const isFinal = match.round === 4;
            return (
              <div
                key={match.id}
                style={{ position: "absolute", left: pos.x, top: pos.y, zIndex: isFinal ? 10 : 1 }}
              >
                {isFinal && (
                  <div
                    className="absolute -inset-3 rounded-xl pointer-events-none"
                    style={{
                      background: "radial-gradient(ellipse at center, rgba(39,24,126,0.10) 0%, transparent 70%)",
                      border: "1px solid rgba(39,24,126,0.22)",
                      filter: "blur(1px)",
                    }}
                  />
                )}
                <MatchNode
                  match={match}
                  activeMatchId={activeMatchId}
                  onWinnerClick={handleWinnerClick}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onSetActive={handleSetActive}
                  isFinal={isFinal}
                />
                {isFinal && match.winner && (
                  <div className="absolute -bottom-12 left-0 right-0 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-dim/80 border border-purple-soft/60 shadow-glow-purple">
                      <span className="text-accent-yellow text-sm">★</span>
                      <span className="font-display text-xs font-bold text-purple-bright tracking-widest">
                        {match.winner.name}
                      </span>
                      <span className="text-accent-yellow text-sm">★</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {winnerModal && (() => {
        const match = matches.find(m => m.id === winnerModal.matchId);
        const team  = match?.team1?.id === winnerModal.teamId ? match.team1 : match?.team2;
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-panel rounded-xl p-8 max-w-sm w-full mx-4">
              <div className="text-center mb-6">
                <div className="text-3xl mb-3">★</div>
                <div className="font-display text-xs text-purple-vivid tracking-widest mb-2">CONFIRM WINNER</div>
                <div className="font-display text-2xl font-bold text-text-primary">{team?.name}</div>
                <div className="text-text-secondary text-sm mt-2">
                  {getRoundLabel(match?.round ?? 1)} — Match #{match?.id}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setWinnerModal(null)}
                  className="flex-1 py-3 rounded-lg border border-panelBorder text-text-secondary font-mono text-sm hover:border-purple-mid/30 transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={confirmWinner}
                  className="flex-1 py-3 rounded-lg bg-purple-mid text-white font-display text-sm font-bold tracking-wider hover:bg-purple-vivid transition-all shadow-glow-sm"
                >
                  CONFIRM
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
