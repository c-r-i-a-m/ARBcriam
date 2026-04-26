from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Match, TournamentState
from schemas import MatchOut, WinnerSelectRequest, BracketUpdateRequest
from services.bracket_service import (
    advance_winner,
    ensure_active_match,
    ensure_bracket_exists,
    get_full_bracket,
    is_bracket_ready,
    is_playable_match,
    set_tournament_active_match,
)
from services.audit import log_action
from services.match_resolution import has_pending_resolution_for_match
from services.websocket_manager import manager
from typing import List

router = APIRouter()


@router.get("/", response_model=List[MatchOut])
def get_bracket(db: Session = Depends(get_db)):
    ensure_bracket_exists(db)
    return get_full_bracket(db)


@router.put("/match", response_model=MatchOut)
async def update_match_teams(body: BracketUpdateRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")

    old = {"t1": match.team1_id, "t2": match.team2_id}
    if body.team1_id is not None:
        match.team1_id = body.team1_id
    if body.team2_id is not None:
        match.team2_id = body.team2_id

    from datetime import datetime
    match.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    log_action(db, "bracket_team_moved", match_id=match.id,
               payload={"old": old, "new": {"t1": match.team1_id, "t2": match.team2_id}})

    await manager.broadcast({
        "type": "bracket_updated",
        "match_id": match.id,
        "round": match.round,
        "slot_index": match.slot_index,
    })
    return match


@router.post("/winner", response_model=MatchOut)
async def select_winner(body: WinnerSelectRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if has_pending_resolution_for_match(db, body.match_id):
        raise HTTPException(409, "Confirm the pending timer-page resolution before updating the bracket")

    if body.winner_id not in [match.team1_id, match.team2_id]:
        raise HTTPException(400, "Winner must be one of the match teams")

    old_winner = match.winner_id
    was_active = (
        db.query(TournamentState)
        .filter(TournamentState.active_match_id == match.id)
        .first()
        is not None
    )
    match.winner_id = body.winner_id
    match.status = "completed"

    from datetime import datetime
    match.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(match)

    # Propagate winner to next match
    advance_winner(db, match, body.winner_id)

    log_action(db, "winner_selected", match_id=match.id,
               team_id=body.winner_id,
               payload={"old_winner": old_winner, "winner_id": body.winner_id,
                        "next_match_id": match.next_match_id},
               source=body.source)

    await manager.broadcast({
        "type": "winner_selected",
        "match_id": match.id,
        "winner_id": body.winner_id,
        "next_match_id": match.next_match_id,
    })
    if was_active:
        active_match = ensure_active_match(db)
        await manager.broadcast({
            "type": "active_match_changed",
            "match_id": active_match.id if active_match else None,
            "round": active_match.round if active_match else None,
        })
    db.refresh(match)
    return match


@router.post("/active/{match_id}")
async def set_active_match(match_id: int, db: Session = Depends(get_db)):
    if not is_bracket_ready(db):
        raise HTTPException(400, "The tournament cannot start until the roulette fills all 16 slots")

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if not is_playable_match(match):
        raise HTTPException(400, "Active match must have two teams and must not be completed")

    set_tournament_active_match(db, match)

    log_action(db, "active_match_set", match_id=match_id,
               payload={"round": match.round, "slot": match.slot_index})

    await manager.broadcast({
        "type": "active_match_changed",
        "match_id": match_id,
        "round": match.round,
    })
    return {"ok": True, "active_match_id": match_id}


@router.get("/active")
def get_active_match(db: Session = Depends(get_db)):
    ensure_active_match(db)
    state = db.query(TournamentState).first()
    if not state or not state.active_match_id:
        return {"active_match_id": None}
    return {"active_match_id": state.active_match_id}
