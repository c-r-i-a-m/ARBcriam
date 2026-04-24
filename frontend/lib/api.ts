import type { PenaltyType, TeamPenaltySummary } from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 8000;

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...opts?.headers },
      ...opts,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${res.status}: ${err}`);
    }
    return res.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  getState:        () => req<any>("/api/state/current"),
  resetTournament: () => req<any>("/api/state/reset", { method: "POST" }),
  initBracket:     () => req<any>("/api/state/init", { method: "POST" }),

  getTeams:  () => req<any[]>("/api/teams/"),
  createTeam: (name: string, seed?: number) =>
    req<any>("/api/teams/", { method: "POST", body: JSON.stringify({ name, seed }) }),
  updateTeam: (id: number, name: string, seed?: number) =>
    req<any>(`/api/teams/${id}`, { method: "PUT", body: JSON.stringify({ name, seed }) }),

  getBracket:   () => req<any[]>("/api/bracket/"),
  updateMatch:  (match_id: number, team1_id?: number | null, team2_id?: number | null) =>
    req<any>("/api/bracket/match", { method: "PUT", body: JSON.stringify({ match_id, team1_id, team2_id }) }),
  selectWinner: (match_id: number, winner_id: number, source = "web") =>
    req<any>("/api/bracket/winner", { method: "POST", body: JSON.stringify({ match_id, winner_id, source }) }),
  setActiveMatch: (match_id: number) =>
    req<any>(`/api/bracket/active/${match_id}`, { method: "POST" }),
  getActiveMatch: () => req<any>("/api/bracket/active"),

  getTimer:   (match_id: number) => req<any>(`/api/timer/${match_id}`),
  startTimer: (match_id: number, source = "web") =>
    req<any>(`/api/timer/${match_id}/start?source=${source}`, { method: "POST" }),
  stopTimer:  (match_id: number, source = "web") =>
    req<any>(`/api/timer/${match_id}/stop?source=${source}`, { method: "POST" }),
  resetTimer: (match_id: number, source = "web") =>
    req<any>(`/api/timer/${match_id}/reset?source=${source}`, { method: "POST" }),

  addPenalty: (match_id: number, team_id: number, penalty_type: PenaltyType, source = "web") =>
    req<any>("/api/events/penalties", {
      method: "POST",
      body: JSON.stringify({ match_id, team_id, penalty_type, source }),
    }),
  getPenaltyCounts: (match_id: number) =>
    req<Record<string, TeamPenaltySummary>>(`/api/events/penalties/${match_id}/counts`),
  addRecord: (match_id: number, team_id: number, source = "web") =>
    req<any>("/api/events/records", { method: "POST", body: JSON.stringify({ match_id, team_id, source }) }),
  getRecords: (match_id: number) => req<any[]>(`/api/events/records/${match_id}`),

  getLogs: (match_id?: number, limit = 50) =>
    req<any[]>(`/api/logs/?limit=${limit}${match_id ? `&match_id=${match_id}` : ""}`),
};

export const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
