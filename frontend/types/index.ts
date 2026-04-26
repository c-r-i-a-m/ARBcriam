export interface Team {
  id: number;
  name: string;
  seed?: number;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: number;
  round: number;
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

export interface RouletteSelection {
  id: number;
  team_id: number;
  selection_order: number;
  match_id: number;
  team_slot: number;
  created_at: string;
  team: Team | null;
}

export interface RouletteState {
  total_teams: number;
  capacity: number;
  assigned_count: number;
  remaining_count: number;
  can_spin: boolean;
  can_start_tournament: boolean;
  assigned_teams: RouletteSelection[];
  remaining_teams: Team[];
}

export type PenaltyType = "hit_the_wall" | "intervention";

export interface TeamPenaltySummary {
  hit_the_wall_count: number;
  intervention_count: number;
  hit_the_wall_seconds: number;
  intervention_seconds: number;
  legacy_seconds: number;
  total_seconds: number;
  eliminated: boolean;
}

export interface PenaltyEvent {
  id: number;
  match_id: number;
  team_id: number;
  penalty_type: PenaltyType | "legacy";
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
  pending_resolution: PendingResolution | null;
  penalties: Record<number, TeamPenaltySummary>;
  records: Record<number, RecordEvent[]>;
  roulette: RouletteState;
  teams: Team[];
  matches: Match[];
}

export interface PendingResolution {
  type: "time_win" | "elimination";
  match_id: number;
  winner_id: number;
  winner_name: string | null;
  loser_id: number;
  loser_name: string | null;
  message: string | null;
  tone: "green" | "red" | null;
  metadata: {
    winner_team_name?: string;
    loser_team_name?: string;
    winner_adjusted_elapsed_ms?: number;
    loser_adjusted_elapsed_ms?: number;
    winner_adjusted_elapsed_display?: string;
    loser_adjusted_elapsed_display?: string;
    winner_raw_elapsed_ms?: number;
    loser_raw_elapsed_ms?: number;
    winner_raw_elapsed_display?: string;
    loser_raw_elapsed_display?: string;
    intervention_count?: number;
  };
  created_at: string | null;
}

export type WSMessage =
  | { type: "pong" }
  | { type: "bracket_updated"; match_id: number; round: number; slot_index: number }
  | { type: "winner_selected"; match_id: number; winner_id: number; next_match_id: number | null }
  | { type: "active_match_changed"; match_id: number | null; round: number | null }
  | {
      type: "roulette_team_selected";
      team_id: number;
      team_name: string;
      selection_order: number;
      match_id: number;
      team_slot: number;
      tournament_ready: boolean;
    }
  | { type: "roulette_completed" }
  | { type: "timer_started"; match_id: number; accumulated_elapsed_ms: number; started_at: string }
  | { type: "timer_stopped"; match_id: number; accumulated_elapsed_ms: number }
  | { type: "timer_reset"; match_id: number }
  | {
      type: "penalty_added";
      match_id: number;
      team_id: number;
      penalty_type: PenaltyType;
      penalty_value: number;
      penalty_summary: TeamPenaltySummary;
      total_penalties: number;
      penalty_id: number;
      source: string;
      eliminated: boolean;
      auto_winner_id: number | null;
    }
  | { type: "match_resolution_pending"; pending_resolution: PendingResolution }
  | { type: "match_resolution_cleared"; match_id: number }
  | { type: "time_recorded"; match_id: number; team_id: number; elapsed_ms: number; record_id: number; label: string | null; source: string }
  | { type: "tournament_reset" }
  | { type: "bracket_initialized" };
