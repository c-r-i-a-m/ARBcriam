import { create } from "zustand";
import type { Match, Team, RecordEvent, TeamPenaltySummary } from "@/types";

interface TournamentStore {
  teams: Team[];
  matches: Match[];
  activeMatchId: number | null;
  currentRound: number;
  timer: {
    isRunning: boolean;
    accumulatedMs: number;
    startedAt: string | null;
  } | null;
  penalties: Record<number, TeamPenaltySummary>;
  records: Record<number, RecordEvent[]>;

  setFullState: (state: {
    teams: Team[];
    matches: Match[];
    activeMatchId: number | null;
    currentRound: number;
    timer: TournamentStore["timer"];
    penalties: Record<number, TeamPenaltySummary>;
    records: Record<number, RecordEvent[]>;
  }) => void;

  updateMatch: (matchId: number, updates: Partial<Match>) => void;
  setActiveMatch: (matchId: number | null) => void;
  setTimer: (timer: TournamentStore["timer"]) => void;
  setPenalty: (teamId: number, summary: TeamPenaltySummary) => void;
  addRecord: (teamId: number, record: RecordEvent) => void;
  getActiveMatch: () => Match | null;
}

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  teams: [],
  matches: [],
  activeMatchId: null,
  currentRound: 1,
  timer: null,
  penalties: {},
  records: {},

  setFullState: (s) =>
    set({
      teams: s.teams,
      matches: s.matches,
      activeMatchId: s.activeMatchId,
      currentRound: s.currentRound,
      timer: s.timer,
      penalties: s.penalties,
      records: s.records,
    }),

  updateMatch: (matchId, updates) =>
    set((state) => ({
      matches: state.matches.map((m) =>
        m.id === matchId ? { ...m, ...updates } : m
      ),
    })),

  setActiveMatch: (matchId) => set({ activeMatchId: matchId }),

  setTimer: (timer) => set({ timer }),

  setPenalty: (teamId, summary) =>
    set((state) => ({
      penalties: { ...state.penalties, [teamId]: summary },
    })),

  addRecord: (teamId, record) =>
    set((state) => ({
      records: {
        ...state.records,
        [teamId]: [...(state.records[teamId] ?? []), record],
      },
    })),

  getActiveMatch: () => {
    const { matches, activeMatchId } = get();
    if (!activeMatchId) return null;
    return matches.find((m) => m.id === activeMatchId) ?? null;
  },
}));
