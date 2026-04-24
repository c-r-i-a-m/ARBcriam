export interface Team {
  id: number;
  name: string;
  seed?: number;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: number;
  round: number;       // 1=R16, 2=QF, 3=SF, 4=Final
  slot_index: number;
  side: "left" | "right" | "center" | null;
  team1_id: number | null;
  team2_id: number | null;
  winner_id: number | null;
  status: "pending" | "active" | "completed";
  next_match_id: number | null;
  next_match_slot: number | null;
  team1: Team | null;
  team2: Team | null;
  winner: Team | null;
  created_at: string;
  updated_at: string;
}

export interface TimerState {
  id: number;
  match_id: number | null;
  is_running: boolean;
  started_at: string | null;
  accumulated_elapsed_ms: number;
  current_elapsed_ms: number;
  updated_at: string;
}

export interface PenaltyEvent {
  id: number;
  match_id: number;
  team_id: number;
  penalty_value: number;
  created_at: string;
  source: string;
  team?: Team;
}

export interface RecordEvent {
  id: number;
  match_id: number;
  team_id: number;
  recorded_elapsed_ms: number;
  label: string | null;
  created_at: string;
  source: string;
  team?: Team;
}

export interface AuditLog {
  id: number;
  action_type: string;
  match_id: number | null;
  team_id: number | null;
  payload_json: string | null;
  created_at: string;
  source: string;
}

export interface TournamentState {
  active_match_id: number | null;
  current_round: number;
  timer: TimerState | null;
  penalties: Record<number, number>;
  records: Record<number, RecordEvent[]>;
  teams: Team[];
  matches: Match[];
}

export type WSMessage =
  | { type: "pong" }
  | { type: "bracket_updated"; match_id: number; round: number; slot_index: number }
  | { type: "winner_selected"; match_id: number; winner_id: number; next_match_id: number | null }
  | { type: "active_match_changed"; match_id: number; round: number }
  | { type: "timer_started"; match_id: number; accumulated_elapsed_ms: number; started_at: string }
  | { type: "timer_stopped"; match_id: number; accumulated_elapsed_ms: number }
  | { type: "timer_reset"; match_id: number }
  | { type: "penalty_added"; match_id: number; team_id: number; total_penalties: number; penalty_id: number; source: string }
  | { type: "time_recorded"; match_id: number; team_id: number; elapsed_ms: number; record_id: number; label: string | null; source: string }
  | { type: "tournament_reset" }
  | { type: "bracket_initialized" };
