from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from models import Match, Team, TournamentState
from services.bracket_service import advance_winner, ensure_active_match


def get_tournament_state(db: Session) -> TournamentState:
    state = db.query(TournamentState).first()
    if not state:
        state = TournamentState(current_round=1)
        db.add(state)
        db.commit()
        db.refresh(state)
    return state


def _get_team_name(db: Session, team_id: Optional[int]) -> Optional[str]:
    if not team_id:
        return None
    team = db.query(Team).filter(Team.id == team_id).first()
    return team.name if team else None


def serialize_pending_resolution(db: Session, state: TournamentState) -> Optional[dict[str, Any]]:
    if (
        not state.pending_resolution_type
        or not state.pending_resolution_match_id
        or not state.pending_resolution_winner_id
        or not state.pending_resolution_loser_id
    ):
        return None

    metadata: dict[str, Any] = {}
    if state.pending_resolution_payload_json:
        try:
            metadata = json.loads(state.pending_resolution_payload_json)
        except json.JSONDecodeError:
            metadata = {}

    return {
        "type": state.pending_resolution_type,
        "match_id": state.pending_resolution_match_id,
        "winner_id": state.pending_resolution_winner_id,
        "winner_name": _get_team_name(db, state.pending_resolution_winner_id),
        "loser_id": state.pending_resolution_loser_id,
        "loser_name": _get_team_name(db, state.pending_resolution_loser_id),
        "message": state.pending_resolution_message,
        "tone": state.pending_resolution_tone,
        "metadata": metadata,
        "created_at": str(state.pending_resolution_created_at) if state.pending_resolution_created_at else None,
    }


def get_pending_resolution(db: Session) -> Optional[dict[str, Any]]:
    state = get_tournament_state(db)
    return serialize_pending_resolution(db, state)


def has_pending_resolution_for_match(db: Session, match_id: int) -> bool:
    state = get_tournament_state(db)
    return state.pending_resolution_match_id == match_id


def set_pending_resolution(
    db: Session,
    *,
    match_id: int,
    winner_id: int,
    loser_id: int,
    resolution_type: str,
    message: str,
    tone: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    state = get_tournament_state(db)
    state.pending_resolution_type = resolution_type
    state.pending_resolution_match_id = match_id
    state.pending_resolution_winner_id = winner_id
    state.pending_resolution_loser_id = loser_id
    state.pending_resolution_message = message
    state.pending_resolution_tone = tone
    state.pending_resolution_payload_json = json.dumps(metadata or {})
    state.pending_resolution_created_at = datetime.utcnow()
    state.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(state)
    return serialize_pending_resolution(db, state) or {}


def clear_pending_resolution(db: Session) -> None:
    state = get_tournament_state(db)
    state.pending_resolution_type = None
    state.pending_resolution_match_id = None
    state.pending_resolution_winner_id = None
    state.pending_resolution_loser_id = None
    state.pending_resolution_message = None
    state.pending_resolution_tone = None
    state.pending_resolution_payload_json = None
    state.pending_resolution_created_at = None
    state.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(state)


def apply_pending_resolution(db: Session) -> tuple[Match, Optional[Match], Optional[dict[str, Any]]]:
    state = get_tournament_state(db)
    pending_resolution = serialize_pending_resolution(db, state)
    if not pending_resolution:
        raise ValueError("No pending resolution to confirm")

    match = db.query(Match).filter(Match.id == state.pending_resolution_match_id).first()
    if not match:
        raise ValueError("Pending resolution match not found")

    winner_id = state.pending_resolution_winner_id
    if winner_id not in {match.team1_id, match.team2_id}:
        raise ValueError("Pending winner must be one of the match teams")

    match.winner_id = winner_id
    match.status = "completed"
    match.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    next_match = advance_winner(db, match, winner_id)
    was_active = state.active_match_id == match.id
    clear_pending_resolution(db)
    next_active_match = ensure_active_match(db) if was_active else None
    return match, next_match, pending_resolution
