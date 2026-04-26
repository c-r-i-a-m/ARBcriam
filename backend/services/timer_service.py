from datetime import datetime
from sqlalchemy.orm import Session
from models import TimerState, PenaltyEvent, RecordEvent
from typing import Optional


def get_or_create_timer(db: Session, match_id: int) -> TimerState:
    timer = db.query(TimerState).filter(TimerState.match_id == match_id).first()
    if not timer:
        timer = TimerState(match_id=match_id, is_running=False, accumulated_elapsed_ms=0)
        db.add(timer)
        db.commit()
        db.refresh(timer)
    return timer


def compute_elapsed_ms(timer: TimerState) -> int:
    if timer.is_running and timer.started_at:
        delta = datetime.utcnow() - timer.started_at
        return timer.accumulated_elapsed_ms + int(delta.total_seconds() * 1000)
    return timer.accumulated_elapsed_ms


def start_timer(db: Session, match_id: int) -> TimerState:
    timer = get_or_create_timer(db, match_id)
    if not timer.is_running:
        timer.is_running = True
        timer.started_at = datetime.utcnow()
        timer.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(timer)
    return timer


def stop_timer(db: Session, match_id: int) -> TimerState:
    timer = get_or_create_timer(db, match_id)
    if timer.is_running and timer.started_at:
        delta = datetime.utcnow() - timer.started_at
        timer.accumulated_elapsed_ms += int(delta.total_seconds() * 1000)
        timer.is_running = False
        timer.started_at = None
        timer.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(timer)
    return timer


def reset_timer(db: Session, match_id: int) -> TimerState:
    timer = get_or_create_timer(db, match_id)
    timer.is_running = False
    timer.started_at = None
    timer.accumulated_elapsed_ms = 0
    timer.updated_at = datetime.utcnow()

    db.query(PenaltyEvent).filter(PenaltyEvent.match_id == match_id).delete()
    db.query(RecordEvent).filter(RecordEvent.match_id == match_id).delete()

    db.commit()
    db.refresh(timer)
    return timer
