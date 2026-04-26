from __future__ import annotations

from typing import Any, Iterable, Literal

from models import PenaltyEvent

PenaltyType = Literal["hit_the_wall", "intervention", "legacy"]

HIT_THE_WALL_SECONDS = 2
INTERVENTION_SECONDS = 5
ELIMINATION_INTERVENTION_COUNT = 4


def empty_penalty_summary() -> dict[str, Any]:
    return {
        "hit_the_wall_count": 0,
        "intervention_count": 0,
        "hit_the_wall_seconds": 0,
        "intervention_seconds": 0,
        "legacy_seconds": 0,
        "total_seconds": 0,
        "eliminated": False,
    }


def normalize_penalty_type(value: str | None) -> PenaltyType:
    if value in {"hit_the_wall", "intervention"}:
        return value
    return "legacy"


def get_penalty_seconds(penalty_type: PenaltyType, penalty_value: int | None = None) -> int:
    if penalty_type == "hit_the_wall":
        return HIT_THE_WALL_SECONDS
    if penalty_type == "intervention":
        return INTERVENTION_SECONDS
    return max(penalty_value or 0, 0)


def _apply_penalty(summary: dict[str, Any], penalty_type: PenaltyType, penalty_value: int) -> None:
    if penalty_type == "hit_the_wall":
        summary["hit_the_wall_count"] += 1
        summary["hit_the_wall_seconds"] += penalty_value
        return

    if penalty_type == "intervention":
        summary["intervention_count"] += 1
        summary["intervention_seconds"] += penalty_value
        return

    summary["legacy_seconds"] += penalty_value


def finalize_penalty_summary(summary: dict[str, Any]) -> dict[str, Any]:
    summary["total_seconds"] = (
        summary["hit_the_wall_seconds"]
        + summary["intervention_seconds"]
        + summary["legacy_seconds"]
    )
    summary["eliminated"] = summary["intervention_count"] >= ELIMINATION_INTERVENTION_COUNT
    return summary


def build_penalty_summary(events: Iterable[PenaltyEvent]) -> dict[str, Any]:
    summary = empty_penalty_summary()
    for event in events:
        penalty_type = normalize_penalty_type(getattr(event, "penalty_type", None))
        penalty_value = get_penalty_seconds(penalty_type, getattr(event, "penalty_value", None))
        _apply_penalty(summary, penalty_type, penalty_value)
    return finalize_penalty_summary(summary)


def build_penalty_summaries(events: Iterable[PenaltyEvent]) -> dict[int, dict[str, Any]]:
    summaries: dict[int, dict[str, Any]] = {}

    for event in events:
        summary = summaries.setdefault(event.team_id, empty_penalty_summary())
        penalty_type = normalize_penalty_type(getattr(event, "penalty_type", None))
        penalty_value = get_penalty_seconds(penalty_type, getattr(event, "penalty_value", None))
        _apply_penalty(summary, penalty_type, penalty_value)

    for summary in summaries.values():
        finalize_penalty_summary(summary)

    return summaries
