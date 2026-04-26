from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Match, PenaltyEvent, RecordEvent
from schemas import (
    ConfirmPendingResolutionRequest,
    FinishMatchRequest,
    PenaltyEventOut,
    PenaltyRequest,
    RecordEventOut,
    RecordRequest,
)
from services.audit import log_action
from services.match_resolution import (
    apply_pending_resolution,
    get_pending_resolution,
    get_tournament_state,
    has_pending_resolution_for_match,
    set_pending_resolution,
)
from services.penalties import build_penalty_summaries, get_penalty_seconds
from services.timer_service import compute_elapsed_ms, get_or_create_timer, stop_timer
from services.websocket_manager import manager

router = APIRouter()


def _format_elapsed_ms(elapsed_ms: int) -> str:
    minutes = elapsed_ms // 60000
    seconds = (elapsed_ms % 60000) // 1000
    centiseconds = (elapsed_ms % 1000) // 10
    return f"{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def _get_team_name(match: Match, team_id: int) -> str:
    if match.team1_id == team_id and match.team1:
        return match.team1.name
    if match.team2_id == team_id and match.team2:
        return match.team2.name
    return f"Team {team_id}"


def _get_latest_record(db: Session, match_id: int, team_id: int) -> RecordEvent | None:
    return (
        db.query(RecordEvent)
        .filter(RecordEvent.match_id == match_id, RecordEvent.team_id == team_id)
        .order_by(RecordEvent.created_at.desc(), RecordEvent.id.desc())
        .first()
    )


@router.post("/penalties", response_model=PenaltyEventOut)
async def add_penalty(body: PenaltyRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if match.team1_id is None or match.team2_id is None:
        raise HTTPException(400, "Match must have two teams before penalties can be recorded")
    if body.team_id not in {match.team1_id, match.team2_id}:
        raise HTTPException(400, "Penalty team must be one of the match teams")
    if match.status == "completed":
        raise HTTPException(400, "Cannot add penalties to a completed match")
    if has_pending_resolution_for_match(db, body.match_id):
        raise HTTPException(409, "Confirm the pending match resolution before adding more penalties")

    penalty_value = get_penalty_seconds(body.penalty_type)
    penalty_event = PenaltyEvent(
        match_id=body.match_id,
        team_id=body.team_id,
        penalty_type=body.penalty_type,
        penalty_value=penalty_value,
        source=body.source,
    )
    db.add(penalty_event)
    db.commit()
    db.refresh(penalty_event)

    team_penalties = (
        db.query(PenaltyEvent)
        .filter(PenaltyEvent.match_id == body.match_id, PenaltyEvent.team_id == body.team_id)
        .order_by(PenaltyEvent.created_at, PenaltyEvent.id)
        .all()
    )
    penalty_summary = build_penalty_summaries(team_penalties).get(body.team_id)
    total_penalties = len(team_penalties)
    eliminated = bool(penalty_summary and penalty_summary["eliminated"])
    auto_winner_id = match.team2_id if match.team1_id == body.team_id else match.team1_id
    pending_resolution = None
    stopped_timer = None

    log_action(
        db,
        "penalty_added",
        match_id=body.match_id,
        team_id=body.team_id,
        payload={
            "penalty_type": body.penalty_type,
            "penalty_value": penalty_value,
            "total_penalties": total_penalties,
            "penalty_summary": penalty_summary,
        },
        source=body.source,
    )

    if eliminated and auto_winner_id:
        timer = get_or_create_timer(db, match.id)
        if timer.is_running:
            stopped_timer = stop_timer(db, match.id)

        loser_name = _get_team_name(match, body.team_id)
        winner_name = _get_team_name(match, auto_winner_id)
        pending_resolution = set_pending_resolution(
            db,
            match_id=match.id,
            winner_id=auto_winner_id,
            loser_id=body.team_id,
            resolution_type="elimination",
            message=f"{loser_name} was eliminated after 4 interventions. Confirm to advance {winner_name}.",
            tone="red",
            metadata={
                "intervention_count": penalty_summary["intervention_count"] if penalty_summary else 4,
                "winner_team_name": winner_name,
                "loser_team_name": loser_name,
            },
        )

        log_action(
            db,
            "team_eliminated_pending_confirmation",
            match_id=body.match_id,
            team_id=body.team_id,
            payload={
                "penalty_summary": penalty_summary,
                "winner_id": auto_winner_id,
            },
            source=body.source,
        )

    await manager.broadcast(
        {
            "type": "penalty_added",
            "match_id": body.match_id,
            "team_id": body.team_id,
            "penalty_type": body.penalty_type,
            "penalty_value": penalty_value,
            "penalty_summary": penalty_summary,
            "total_penalties": total_penalties,
            "penalty_id": penalty_event.id,
            "source": body.source,
            "eliminated": eliminated,
            "auto_winner_id": auto_winner_id if eliminated else None,
        }
    )

    if stopped_timer:
        await manager.broadcast(
            {
                "type": "timer_stopped",
                "match_id": match.id,
                "accumulated_elapsed_ms": stopped_timer.accumulated_elapsed_ms,
            }
        )

    if pending_resolution:
        await manager.broadcast(
            {
                "type": "match_resolution_pending",
                "pending_resolution": pending_resolution,
            }
        )

    return penalty_event


@router.get("/penalties/{match_id}", response_model=List[PenaltyEventOut])
def get_penalties(match_id: int, db: Session = Depends(get_db)):
    return (
        db.query(PenaltyEvent)
        .filter(PenaltyEvent.match_id == match_id)
        .order_by(PenaltyEvent.created_at)
        .all()
    )


@router.get("/penalties/{match_id}/counts")
def get_penalty_counts(match_id: int, db: Session = Depends(get_db)):
    penalties = db.query(PenaltyEvent).filter(PenaltyEvent.match_id == match_id).all()
    return build_penalty_summaries(penalties)


@router.post("/records", response_model=RecordEventOut)
async def add_record(body: RecordRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if has_pending_resolution_for_match(db, body.match_id):
        raise HTTPException(409, "Confirm the pending match resolution before recording more times")

    timer = get_or_create_timer(db, body.match_id)
    elapsed_ms = compute_elapsed_ms(timer)

    record_event = RecordEvent(
        match_id=body.match_id,
        team_id=body.team_id,
        recorded_elapsed_ms=elapsed_ms,
        label=body.label,
        source=body.source,
    )
    db.add(record_event)
    db.commit()
    db.refresh(record_event)

    log_action(
        db,
        "time_recorded",
        match_id=body.match_id,
        team_id=body.team_id,
        payload={"elapsed_ms": elapsed_ms, "label": body.label},
        source=body.source,
    )

    await manager.broadcast(
        {
            "type": "time_recorded",
            "match_id": body.match_id,
            "team_id": body.team_id,
            "elapsed_ms": elapsed_ms,
            "record_id": record_event.id,
            "label": body.label,
            "source": body.source,
        }
    )
    return record_event


@router.get("/records/{match_id}", response_model=List[RecordEventOut])
def get_records(match_id: int, db: Session = Depends(get_db)):
    return (
        db.query(RecordEvent)
        .filter(RecordEvent.match_id == match_id)
        .order_by(RecordEvent.created_at)
        .all()
    )


@router.post("/finish")
async def finish_match(body: FinishMatchRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if match.status == "completed":
        raise HTTPException(400, "This match has already been completed")
    if match.team1_id is None or match.team2_id is None:
        raise HTTPException(400, "Both teams must be present before finishing the match")
    if has_pending_resolution_for_match(db, body.match_id):
        raise HTTPException(409, "Confirm the pending match resolution before finishing this match")

    timer = get_or_create_timer(db, body.match_id)
    if timer.is_running:
        raise HTTPException(409, "Stop the timer before finishing the match")

    latest_team1_record = _get_latest_record(db, body.match_id, match.team1_id)
    latest_team2_record = _get_latest_record(db, body.match_id, match.team2_id)
    if not latest_team1_record or not latest_team2_record:
        raise HTTPException(400, "Both teams need a recorded time before you can finish the match")

    penalty_summaries = build_penalty_summaries(
        db.query(PenaltyEvent).filter(PenaltyEvent.match_id == body.match_id).all()
    )
    team1_summary = penalty_summaries.get(match.team1_id, {"total_seconds": 0})
    team2_summary = penalty_summaries.get(match.team2_id, {"total_seconds": 0})
    team1_adjusted_ms = latest_team1_record.recorded_elapsed_ms + team1_summary["total_seconds"] * 1000
    team2_adjusted_ms = latest_team2_record.recorded_elapsed_ms + team2_summary["total_seconds"] * 1000

    if team1_adjusted_ms == team2_adjusted_ms:
        raise HTTPException(409, "The adjusted times are tied, so the winner must be selected manually")

    if team1_adjusted_ms < team2_adjusted_ms:
        winner_id = match.team1_id
        loser_id = match.team2_id
        winner_adjusted_ms = team1_adjusted_ms
        loser_adjusted_ms = team2_adjusted_ms
        winner_raw_ms = latest_team1_record.recorded_elapsed_ms
        loser_raw_ms = latest_team2_record.recorded_elapsed_ms
    else:
        winner_id = match.team2_id
        loser_id = match.team1_id
        winner_adjusted_ms = team2_adjusted_ms
        loser_adjusted_ms = team1_adjusted_ms
        winner_raw_ms = latest_team2_record.recorded_elapsed_ms
        loser_raw_ms = latest_team1_record.recorded_elapsed_ms

    winner_name = _get_team_name(match, winner_id)
    loser_name = _get_team_name(match, loser_id)
    pending_resolution = set_pending_resolution(
        db,
        match_id=match.id,
        winner_id=winner_id,
        loser_id=loser_id,
        resolution_type="time_win",
        message=f"{winner_name} wins with the lowest adjusted time. Confirm to advance the bracket.",
        tone="green",
        metadata={
            "winner_team_name": winner_name,
            "loser_team_name": loser_name,
            "winner_adjusted_elapsed_ms": winner_adjusted_ms,
            "loser_adjusted_elapsed_ms": loser_adjusted_ms,
            "winner_adjusted_elapsed_display": _format_elapsed_ms(winner_adjusted_ms),
            "loser_adjusted_elapsed_display": _format_elapsed_ms(loser_adjusted_ms),
            "winner_raw_elapsed_ms": winner_raw_ms,
            "loser_raw_elapsed_ms": loser_raw_ms,
            "winner_raw_elapsed_display": _format_elapsed_ms(winner_raw_ms),
            "loser_raw_elapsed_display": _format_elapsed_ms(loser_raw_ms),
        },
    )

    log_action(
        db,
        "match_finish_pending_confirmation",
        match_id=match.id,
        team_id=winner_id,
        payload={
            "winner_id": winner_id,
            "loser_id": loser_id,
            "winner_adjusted_elapsed_ms": winner_adjusted_ms,
            "loser_adjusted_elapsed_ms": loser_adjusted_ms,
        },
        source=body.source,
    )

    await manager.broadcast(
        {
            "type": "match_resolution_pending",
            "pending_resolution": pending_resolution,
        }
    )
    return pending_resolution


@router.post("/confirm-resolution")
async def confirm_pending_resolution(body: ConfirmPendingResolutionRequest, db: Session = Depends(get_db)):
    pending_resolution = get_pending_resolution(db)
    if not pending_resolution:
        raise HTTPException(404, "There is no pending match resolution to confirm")
    if pending_resolution["match_id"] != body.match_id:
        raise HTTPException(409, "The pending resolution belongs to a different match")

    original_match = db.query(Match).filter(Match.id == body.match_id).first()
    old_winner = original_match.winner_id if original_match else None

    try:
        match, next_match, pending_resolution = apply_pending_resolution(db)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error

    log_action(
        db,
        "winner_selected",
        match_id=match.id,
        team_id=match.winner_id,
        payload={
            "old_winner": old_winner,
            "winner_id": match.winner_id,
            "next_match_id": next_match.id if next_match else None,
            "reason": pending_resolution["type"],
            "pending_resolution": pending_resolution,
        },
        source=body.source,
    )

    await manager.broadcast(
        {
            "type": "match_resolution_cleared",
            "match_id": match.id,
        }
    )
    await manager.broadcast(
        {
            "type": "winner_selected",
            "match_id": match.id,
            "winner_id": match.winner_id,
            "next_match_id": next_match.id if next_match else None,
        }
    )

    tournament_state = get_tournament_state(db)
    active_match = None
    if tournament_state.active_match_id:
        active_match = db.query(Match).filter(Match.id == tournament_state.active_match_id).first()

    await manager.broadcast(
        {
            "type": "active_match_changed",
            "match_id": active_match.id if active_match else None,
            "round": active_match.round if active_match else None,
        }
    )

    return {
        "ok": True,
        "match_id": match.id,
        "winner_id": match.winner_id,
        "next_match_id": next_match.id if next_match else None,
    }
