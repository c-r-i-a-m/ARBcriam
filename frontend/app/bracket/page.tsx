"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWebSocket } from "@/hooks/useWebSocket";
import { api } from "@/lib/api";
import type { Match, RouletteState, Team, WSMessage } from "@/types";

const CARD_W = 208;
const CARD_H = 58;
const H_GAP = 42;
const STAGE_TOP = 26;
const STAGE_BOTTOM = 72;
const STAGE_LABELS = 34;

function getRoundLabel(round: number) {
  return ["", "Round of 16", "Quarter-Finals", "Semi-Finals", "Final"][round] ?? `R${round}`;
}

function TeamCard({
  team,
  match,
  slot,
  activeMatchId,
  onWinnerClick,
  onDragStart,
  onDrop,
  fxState,
}: {
  team: Team | null;
  match: Match;
  slot: 1 | 2;
  activeMatchId: number | null;
  onWinnerClick: (matchId: number, teamId: number) => void;
  onDragStart: (e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => void;
  onDrop: (e: React.DragEvent, matchId: number, slot: 1 | 2) => void;
  fxState?: "winner" | "advanced" | null;
}) {
  const isWinner = team && match.winner_id === team.id;
  const isActive = match.id === activeMatchId;
  const isLoser = Boolean(match.winner_id && team && match.winner_id !== team.id);

  return (
    <div
      className={`
        bracket-card relative flex cursor-pointer items-center gap-3 rounded-lg border px-4
        transition-all duration-200 no-select
        ${isWinner ? "bg-purple-dim/70 border-purple-soft/70 shadow-glow-sm" : ""}
        ${isLoser ? "bg-panel/40 border-panelBorder/40 opacity-40" : ""}
        ${!isWinner && !isLoser && team ? "bg-panel border-panelBorder hover:border-purple-mid/50" : ""}
        ${!team ? "bg-panel/30 border-dashed border-panelBorder/40" : ""}
        ${isActive && !isWinner && !isLoser ? "border-purple-mid/70 shadow-glow-sm" : ""}
        ${fxState === "winner" ? "bracket-card-winner" : ""}
        ${fxState === "advanced" ? "bracket-card-advanced" : ""}
      `}
      style={{ height: CARD_H, width: CARD_W }}
      draggable={Boolean(team) && match.status !== "completed"}
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
        <span className="min-w-[22px] text-center font-mono text-[11px] text-text-muted">
          {String(team.seed).padStart(2, "0")}
        </span>
      )}

      <span
        className={`
          flex-1 truncate font-display text-[15px] font-bold tracking-[0.12em]
          ${isWinner ? "text-purple-bright" : ""}
          ${isLoser ? "text-text-muted" : ""}
          ${!isWinner && !isLoser && team ? "text-text-primary" : ""}
          ${!team ? "text-text-dim" : ""}
        `}
      >
        {team?.name ?? "TBD"}
      </span>

      {isWinner && <span className="text-sm text-accent-yellow">*</span>}

      {isActive && !isWinner && !isLoser && team && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-vivid animate-pulse-slow" />
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
  advancementFx,
}: {
  match: Match;
  activeMatchId: number | null;
  onWinnerClick: (matchId: number, teamId: number) => void;
  onDragStart: (e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => void;
  onDrop: (e: React.DragEvent, matchId: number, slot: 1 | 2) => void;
  onSetActive: (matchId: number) => void;
  isFinal?: boolean;
  advancementFx: { matchId: number; winnerId: number; nextMatchId: number | null } | null;
}) {
  const isActive = match.id === activeMatchId;

  const team1Fx =
    advancementFx && match.team1?.id === advancementFx.winnerId
      ? match.id === advancementFx.matchId
        ? "winner"
        : match.id === advancementFx.nextMatchId
          ? "advanced"
          : null
      : null;
  const team2Fx =
    advancementFx && match.team2?.id === advancementFx.winnerId
      ? match.id === advancementFx.matchId
        ? "winner"
        : match.id === advancementFx.nextMatchId
          ? "advanced"
          : null
      : null;

  return (
    <div className={`group relative flex flex-col gap-[3px] ${isFinal ? "scale-110" : ""}`}>
      <div
        className={`
          absolute -top-6 left-0 right-0 text-center font-mono text-[10px] tracking-[0.24em] transition-opacity duration-200
          ${isActive ? "text-purple-vivid opacity-100" : "text-text-dim opacity-0 group-hover:opacity-60"}
        `}
      >
        {isActive ? "LIVE" : `M${match.id}`}
      </div>

      <TeamCard
        team={match.team1}
        match={match}
        slot={1}
        activeMatchId={activeMatchId}
        onWinnerClick={onWinnerClick}
        onDragStart={onDragStart}
        onDrop={onDrop}
        fxState={team1Fx}
      />

      <div className="flex items-center gap-2 px-4">
        <div className="h-px flex-1 bg-panelBorder/60" />
        <span className="font-mono text-[10px] tracking-[0.24em] text-text-dim">VS</span>
        <div className="h-px flex-1 bg-panelBorder/60" />
      </div>

      <TeamCard
        team={match.team2}
        match={match}
        slot={2}
        activeMatchId={activeMatchId}
        onWinnerClick={onWinnerClick}
        onDragStart={onDragStart}
        onDrop={onDrop}
        fxState={team2Fx}
      />

      {!isActive && match.team1_id && match.team2_id && match.status !== "completed" && (
        <button
          onClick={() => onSetActive(match.id)}
          className="absolute -bottom-7 left-0 right-0 text-center font-mono text-[10px] tracking-[0.18em] text-text-dim opacity-0 transition-colors group-hover:opacity-100 hover:text-purple-vivid"
        >
          SET ACTIVE
        </button>
      )}
    </div>
  );
}

export default function BracketPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [roulette, setRoulette] = useState<RouletteState | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [winnerModal, setWinnerModal] = useState<{ matchId: number; teamId: number } | null>(null);
  const [dragInfo, setDragInfo] = useState<{ teamId: number; matchId: number; slot: 1 | 2 } | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const [stageViewport, setStageViewport] = useState({ width: 0, height: 0 });
  const [advancementFx, setAdvancementFx] = useState<{
    matchId: number;
    winnerId: number;
    nextMatchId: number | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const state = await api.getState();
      setMatches(state.matches ?? []);
      setRoulette(state.roulette ?? null);
      setActiveMatchId(state.active_match_id);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!advancementFx) return;
    const timeout = window.setTimeout(() => setAdvancementFx(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [advancementFx]);

  useEffect(() => {
    const node = stageViewportRef.current;
    if (!node) return;

    const updateSize = () => {
      setStageViewport({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useWebSocket((msg: WSMessage) => {
    if (
      [
        "bracket_updated",
        "active_match_changed",
        "bracket_initialized",
        "tournament_reset",
        "roulette_team_selected",
        "roulette_completed",
      ].includes(msg.type)
    ) {
      loadData();
    }
    if (msg.type === "winner_selected") {
      setAdvancementFx({
        matchId: msg.match_id,
        winnerId: msg.winner_id,
        nextMatchId: msg.next_match_id,
      });
      loadData();
    }
    if (msg.type === "active_match_changed") {
      setActiveMatchId(msg.match_id);
    }
  });

  const handleWinnerClick = useCallback((matchId: number, teamId: number) => {
    setWinnerModal({ matchId, teamId });
  }, []);

  const confirmWinner = useCallback(async () => {
    if (!winnerModal) return;

    try {
      await api.selectWinner(winnerModal.matchId, winnerModal.teamId);
      setWinnerModal(null);
      loadData();
    } catch (error) {
      console.error(error);
    }
  }, [loadData, winnerModal]);

  const handleSetActive = useCallback(async (matchId: number) => {
    try {
      await api.setActiveMatch(matchId);
      setActiveMatchId(matchId);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, teamId: number, matchId: number, slot: 1 | 2) => {
    setDragInfo({ teamId, matchId, slot });
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetMatchId: number, targetSlot: 1 | 2) => {
      e.preventDefault();
      if (!dragInfo) return;
      if (dragInfo.matchId === targetMatchId && dragInfo.slot === targetSlot) return;

      try {
        const update =
          targetSlot === 1
            ? { match_id: targetMatchId, team1_id: dragInfo.teamId }
            : { match_id: targetMatchId, team2_id: dragInfo.teamId };
        await api.updateMatch(targetMatchId, update.team1_id, update.team2_id);
        setDragInfo(null);
        loadData();
      } catch (error) {
        console.error(error);
      }
    },
    [dragInfo, loadData]
  );

  const matchNodeHeight = CARD_H * 2 + 3 + 14;
  const leftR16 = matches.filter((match) => match.round === 1 && match.side === "left").sort((a, b) => a.slot_index - b.slot_index);
  const leftQF = matches.filter((match) => match.round === 2 && match.side === "left").sort((a, b) => a.slot_index - b.slot_index);
  const leftSF = matches.filter((match) => match.round === 3 && match.side === "left");
  const rightR16 = matches.filter((match) => match.round === 1 && match.side === "right").sort((a, b) => a.slot_index - b.slot_index);
  const rightQF = matches.filter((match) => match.round === 2 && match.side === "right").sort((a, b) => a.slot_index - b.slot_index);
  const rightSF = matches.filter((match) => match.round === 3 && match.side === "right");
  const final = matches.find((match) => match.round === 4);

  const r16Pitch = matchNodeHeight + 28;
  const totalH = 4 * r16Pitch + 60;
  const leftR16Y = leftR16.map((_, index) => 30 + index * r16Pitch);
  const leftQFY = leftQF.map((_, index) => 30 + r16Pitch / 2 + index * r16Pitch * 2);
  const leftSFY = [(totalH - matchNodeHeight) / 2];
  const rightR16Y = rightR16.map((_, index) => 30 + index * r16Pitch);
  const rightQFY = rightQF.map((_, index) => 30 + r16Pitch / 2 + index * r16Pitch * 2);
  const rightSFY = [(totalH - matchNodeHeight) / 2];
  const finalY = (totalH - matchNodeHeight) / 2;

  const padding = 40;
  const leftR16X = padding;
  const leftQFX = padding + CARD_W + H_GAP;
  const leftSFX = padding + (CARD_W + H_GAP) * 2;
  const centerX = padding + (CARD_W + H_GAP) * 3;
  const rightSFX = centerX + CARD_W + H_GAP;
  const rightQFX = rightSFX + CARD_W + H_GAP;
  const rightR16X = rightQFX + CARD_W + H_GAP;
  const totalW = rightR16X + CARD_W + padding;
  const stageHeight = STAGE_TOP + STAGE_LABELS + totalH + STAGE_BOTTOM;
  const scale =
    stageViewport.width > 0 && stageViewport.height > 0
      ? Math.min(stageViewport.width / totalW, stageViewport.height / stageHeight, 1)
      : 1;

  const matchPositions = new Map<number, { x: number; y: number }>();
  leftR16.forEach((match, index) => matchPositions.set(match.id, { x: leftR16X, y: leftR16Y[index] }));
  leftQF.forEach((match, index) => matchPositions.set(match.id, { x: leftQFX, y: leftQFY[index] }));
  leftSF.forEach((match, index) => matchPositions.set(match.id, { x: leftSFX, y: leftSFY[index] }));
  if (final) matchPositions.set(final.id, { x: centerX, y: finalY });
  rightSF.forEach((match, index) => matchPositions.set(match.id, { x: rightSFX, y: rightSFY[index] }));
  rightQF.forEach((match, index) => matchPositions.set(match.id, { x: rightQFX, y: rightQFY[index] }));
  rightR16.forEach((match, index) => matchPositions.set(match.id, { x: rightR16X, y: rightR16Y[index] }));

  const tournamentReady = Boolean(roulette?.can_start_tournament);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-display text-sm tracking-widest text-purple-vivid animate-pulse">LOADING BRACKET...</div>
      </div>
    );
  }

  return (
    <div className="grid-bg min-h-screen flex flex-col">
      <header className="glass-panel sticky top-0 z-20 flex items-center justify-between border-b border-panelBorder/60 px-8 py-4">
        <Link href="/" className="font-display text-xl font-black tracking-wider text-text-primary transition-colors hover:text-purple-vivid">
          A.R.B
        </Link>
        <div className="text-center">
          <div className="font-display text-xl font-bold tracking-[0.2em] text-text-primary">African Robotic Brains</div>
          <div className="font-mono text-sm tracking-[0.3em] text-text-muted">16 TEAMS - SINGLE ELIMINATION</div>
        </div>
        <div className="flex gap-3">
          <Link href="/roulette" className="rounded border border-panelBorder px-3 py-1.5 font-mono text-xs text-text-secondary transition-all hover:border-purple-mid/50 hover:text-purple-vivid">
            ROULETTE
          </Link>
          <Link
            href="/timer"
            className={`rounded border px-3 py-1.5 font-mono text-xs transition-all ${
              tournamentReady
                ? "border-panelBorder text-text-secondary hover:border-purple-mid/50 hover:text-purple-vivid"
                : "pointer-events-none border-panelBorder/60 text-text-dim"
            }`}
          >
            MATCH CTRL
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

      {!tournamentReady && (
        <div className="border-b border-panelBorder/50 bg-white/[0.04] px-8 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-center">
            <span className="font-mono text-[10px] tracking-[0.24em] text-text-secondary">
              TOURNAMENT START IS LOCKED UNTIL THE ROULETTE FILLS ALL 16 OPENING SLOTS.
            </span>
            <Link
              href="/roulette"
              className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 font-mono text-[10px] tracking-[0.22em] text-text-primary transition-colors hover:bg-white/[0.12]"
            >
              OPEN ROULETTE
            </Link>
          </div>
        </div>
      )}

      <div ref={stageViewportRef} className="relative flex-1 overflow-hidden">
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: totalW,
            height: stageHeight,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <div
            className="flex items-center justify-between px-[40px]"
            style={{ width: totalW, height: STAGE_LABELS, paddingTop: 2 }}
          >
            {[
              { x: leftR16X + CARD_W / 2, label: "ROUND OF 16" },
              { x: leftQFX + CARD_W / 2, label: "QUARTER-FINALS" },
              { x: leftSFX + CARD_W / 2, label: "SEMI-FINALS" },
              { x: centerX + CARD_W / 2, label: "FINAL" },
              { x: rightSFX + CARD_W / 2, label: "SEMI-FINALS" },
              { x: rightQFX + CARD_W / 2, label: "QUARTER-FINALS" },
              { x: rightR16X + CARD_W / 2, label: "ROUND OF 16" },
            ].map((item) => (
              <div key={`${item.label}-${item.x}`} className="text-center font-mono text-[11px] tracking-[0.24em] text-text-muted">
                {item.label}
              </div>
            ))}
          </div>

          <div style={{ width: totalW, height: totalH + STAGE_TOP + STAGE_BOTTOM, position: "relative" }}>
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              viewBox={`0 0 ${totalW} ${totalH + STAGE_TOP + STAGE_BOTTOM}`}
              preserveAspectRatio="none"
            >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {[...leftR16, ...leftQF, ...leftSF].map((match) => {
              if (!match.next_match_id) return null;
              const from = matchPositions.get(match.id);
              const to = matchPositions.get(match.next_match_id);
              if (!from || !to) return null;

              const fromX = from.x + CARD_W;
              const fromY = STAGE_TOP + from.y + matchNodeHeight / 2;
              const toX = to.x;
              const toY = STAGE_TOP + to.y + matchNodeHeight / 2;
              const midX = (fromX + toX) / 2;
              const isLit = Boolean(match.winner_id);
              const path = `M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`;

              return (
                <g key={`left-${match.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isLit ? "rgba(205,210,215,0.36)" : "rgba(103,109,115,0.78)"}
                    strokeWidth={isLit ? 1.5 : 1}
                    strokeDasharray={isLit ? undefined : "4 3"}
                    filter={isLit ? "url(#glow)" : undefined}
                  />
                  {advancementFx?.matchId === match.id && (
                    <path
                      d={path}
                      fill="none"
                      stroke="rgba(226,232,240,0.92)"
                      strokeWidth={2.25}
                      pathLength={100}
                      className="bracket-path-advance"
                    />
                  )}
                </g>
              );
            })}

            {[...rightR16, ...rightQF, ...rightSF].map((match) => {
              if (!match.next_match_id) return null;
              const from = matchPositions.get(match.id);
              const to = matchPositions.get(match.next_match_id);
              if (!from || !to) return null;

              const fromX = from.x;
              const fromY = STAGE_TOP + from.y + matchNodeHeight / 2;
              const toX = to.x + CARD_W;
              const toY = STAGE_TOP + to.y + matchNodeHeight / 2;
              const midX = (fromX + toX) / 2;
              const isLit = Boolean(match.winner_id);
              const path = `M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`;

              return (
                <g key={`right-${match.id}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isLit ? "rgba(205,210,215,0.36)" : "rgba(103,109,115,0.78)"}
                    strokeWidth={isLit ? 1.5 : 1}
                    strokeDasharray={isLit ? undefined : "4 3"}
                    filter={isLit ? "url(#glow)" : undefined}
                  />
                  {advancementFx?.matchId === match.id && (
                    <path
                      d={path}
                      fill="none"
                      stroke="rgba(226,232,240,0.92)"
                      strokeWidth={2.25}
                      pathLength={100}
                      className="bracket-path-advance"
                    />
                  )}
                </g>
              );
            })}
            </svg>

            {matches.map((match) => {
              const position = matchPositions.get(match.id);
              if (!position) return null;

              const isFinal = match.round === 4;
              return (
                <div
                  key={match.id}
                  style={{ position: "absolute", left: position.x, top: STAGE_TOP + position.y, zIndex: isFinal ? 10 : 1 }}
                >
                  {isFinal && (
                    <div
                      className="pointer-events-none absolute -inset-3 rounded-xl"
                      style={{
                        background: "radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 70%)",
                        border: "1px solid rgba(255,255,255,0.08)",
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
                    advancementFx={advancementFx}
                  />

                  {isFinal && match.winner && (
                    <div className="absolute -bottom-12 left-0 right-0 text-center">
                      <div className="inline-flex items-center gap-3 rounded-full border border-purple-soft/60 bg-purple-dim/80 px-4 py-2 shadow-glow-purple">
                        <span className="text-base text-accent-yellow">*</span>
                        <span className="font-display text-sm font-bold tracking-[0.2em] text-purple-bright">
                          {match.winner.name}
                        </span>
                        <span className="text-base text-accent-yellow">*</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {winnerModal && (() => {
        const match = matches.find((item) => item.id === winnerModal.matchId);
        const team = match?.team1?.id === winnerModal.teamId ? match.team1 : match?.team2;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="glass-panel mx-4 w-full max-w-sm rounded-xl p-8">
              <div className="mb-6 text-center">
                <div className="mb-3 text-3xl">*</div>
                <div className="mb-2 font-display text-xs tracking-widest text-text-muted">CONFIRM WINNER</div>
                <div className="font-display text-2xl font-bold text-text-primary">{team?.name}</div>
                <div className="mt-2 text-sm text-text-secondary">
                  {getRoundLabel(match?.round ?? 1)} - Match #{match?.id}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setWinnerModal(null)}
                  className="flex-1 rounded-lg border border-panelBorder py-3 font-mono text-sm text-text-secondary transition-all hover:border-purple-mid/30"
                >
                  CANCEL
                </button>
                <button
                  onClick={confirmWinner}
                  className="shadow-glow-sm flex-1 rounded-lg border border-white/12 bg-white/[0.08] py-3 font-display text-sm font-bold tracking-wider text-text-primary transition-all hover:bg-white/[0.12]"
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
