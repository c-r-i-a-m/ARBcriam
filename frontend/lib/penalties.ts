import type { PenaltyType, RecordEvent, TeamPenaltySummary } from "@/types";

export const EMPTY_PENALTY_SUMMARY: TeamPenaltySummary = {
  hit_the_wall_count: 0,
  intervention_count: 0,
  hit_the_wall_seconds: 0,
  intervention_seconds: 0,
  legacy_seconds: 0,
  total_seconds: 0,
  eliminated: false,
};

export function getPenaltyTypeLabel(penaltyType: PenaltyType) {
  return penaltyType === "hit_the_wall" ? "Hit the wall" : "Intervention";
}

export function getPenaltyTypeShortLabel(penaltyType: PenaltyType) {
  return penaltyType === "hit_the_wall" ? "WALL" : "INTERVENTION";
}

export function getTeamPenaltySummary(
  penalties: Record<number, TeamPenaltySummary>,
  teamId: number | null | undefined
): TeamPenaltySummary {
  if (!teamId) return EMPTY_PENALTY_SUMMARY;
  return penalties[teamId] ?? EMPTY_PENALTY_SUMMARY;
}

export function getAdjustedElapsedMs(recordedElapsedMs: number, summary: TeamPenaltySummary) {
  return recordedElapsedMs + summary.total_seconds * 1000;
}

export function getLatestRecord(records: RecordEvent[] | undefined) {
  return records?.at(-1) ?? null;
}

export function getLatestAdjustedElapsedMs(records: RecordEvent[] | undefined, summary: TeamPenaltySummary) {
  const latestRecord = getLatestRecord(records);
  return latestRecord ? getAdjustedElapsedMs(latestRecord.recorded_elapsed_ms, summary) : null;
}

export function getPenaltyBreakdown(summary: TeamPenaltySummary) {
  const parts: string[] = [];

  if (summary.hit_the_wall_count > 0) {
    parts.push(`${summary.hit_the_wall_count} wall${summary.hit_the_wall_count > 1 ? "s" : ""}`);
  }
  if (summary.intervention_count > 0) {
    parts.push(
      `${summary.intervention_count} intervention${summary.intervention_count > 1 ? "s" : ""}`
    );
  }
  if ((summary.legacy_seconds ?? 0) > 0) {
    parts.push(`${summary.legacy_seconds}s legacy`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No penalties";
}
