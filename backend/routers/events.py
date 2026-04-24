from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import PenaltyEvent, RecordEvent, Match
from schemas import PenaltyEventOut, RecordEventOut, PenaltyRequest, RecordRequest
from services.timer_service import get_or_create_timer, compute_elapsed_ms
from services.audit import log_action
from services.websocket_manager import manager
from typing import List
from datetime import datetime

router = APIRouter()


# ─── Penalties ───────────────────────────────────────────────────────────────

@router.post("/penalties", response_model=PenaltyEventOut)
async def add_penalty(body: PenaltyRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")

    ev = PenaltyEvent(
        match_id=body.match_id,
        team_id=body.team_id,
        penalty_value=1,
        source=body.source,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    # Count total penalties for this team in this match
    total = db.query(PenaltyEvent).filter(
        PenaltyEvent.match_id == body.match_id,
        PenaltyEvent.team_id == body.team_id,
    ).count()

    log_action(db, "penalty_added", match_id=body.match_id, team_id=body.team_id,
               payload={"total": total, "source": body.source}, source=body.source)

    await manager.broadcast({
        "type": "penalty_added",
        "match_id": body.match_id,
        "team_id": body.team_id,
        "total_penalties": total,
        "penalty_id": ev.id,
        "source": body.source,
    })
    return ev


@router.get("/penalties/{match_id}", response_model=List[PenaltyEventOut])
def get_penalties(match_id: int, db: Session = Depends(get_db)):
    return db.query(PenaltyEvent).filter(PenaltyEvent.match_id == match_id).order_by(PenaltyEvent.created_at).all()


@router.get("/penalties/{match_id}/counts")
def get_penalty_counts(match_id: int, db: Session = Depends(get_db)):
    penalties = db.query(PenaltyEvent).filter(PenaltyEvent.match_id == match_id).all()
    counts = {}
    for p in penalties:
        counts[p.team_id] = counts.get(p.team_id, 0) + p.penalty_value
    return counts


# ─── Records ─────────────────────────────────────────────────────────────────

@router.post("/records", response_model=RecordEventOut)
async def add_record(body: RecordRequest, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == body.match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")

    # Snapshot the current global match timer exactly when the record is created.
    timer = get_or_create_timer(db, body.match_id)
    elapsed_ms = compute_elapsed_ms(timer)

    ev = RecordEvent(
        match_id=body.match_id,
        team_id=body.team_id,
        recorded_elapsed_ms=elapsed_ms,
        label=body.label,
        source=body.source,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    log_action(db, "time_recorded", match_id=body.match_id, team_id=body.team_id,
               payload={"elapsed_ms": elapsed_ms, "label": body.label}, source=body.source)

    await manager.broadcast({
        "type": "time_recorded",
        "match_id": body.match_id,
        "team_id": body.team_id,
        "elapsed_ms": elapsed_ms,
        "record_id": ev.id,
        "label": body.label,
        "source": body.source,
    })
    return ev


@router.get("/records/{match_id}", response_model=List[RecordEventOut])
def get_records(match_id: int, db: Session = Depends(get_db)):
    return db.query(RecordEvent).filter(RecordEvent.match_id == match_id).order_by(RecordEvent.created_at).all()
