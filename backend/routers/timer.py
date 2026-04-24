from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas import TimerStateOut, TimerActionRequest
from services.timer_service import (
    get_or_create_timer, compute_elapsed_ms,
    start_timer, stop_timer, reset_timer
)
from services.audit import log_action
from services.websocket_manager import manager
from typing import Optional

router = APIRouter()


def _serialize_timer(timer, elapsed: int) -> dict:
    return {
        "id": timer.id,
        "match_id": timer.match_id,
        "is_running": timer.is_running,
        "started_at": str(timer.started_at) if timer.started_at else None,
        "accumulated_elapsed_ms": timer.accumulated_elapsed_ms,
        "current_elapsed_ms": elapsed,
        "updated_at": str(timer.updated_at),
    }


@router.get("/{match_id}")
def get_timer(match_id: int, db: Session = Depends(get_db)):
    timer = get_or_create_timer(db, match_id)
    elapsed = compute_elapsed_ms(timer)
    return _serialize_timer(timer, elapsed)


@router.post("/{match_id}/start")
async def start(match_id: int, source: str = "web", db: Session = Depends(get_db)):
    timer = start_timer(db, match_id)
    elapsed = compute_elapsed_ms(timer)
    log_action(db, "timer_started", match_id=match_id, payload={"elapsed": elapsed}, source=source)
    await manager.broadcast({
        "type": "timer_started",
        "match_id": match_id,
        "accumulated_elapsed_ms": timer.accumulated_elapsed_ms,
        "started_at": str(timer.started_at),
    })
    return _serialize_timer(timer, elapsed)


@router.post("/{match_id}/stop")
async def stop(match_id: int, source: str = "web", db: Session = Depends(get_db)):
    timer = stop_timer(db, match_id)
    elapsed = timer.accumulated_elapsed_ms
    log_action(db, "timer_stopped", match_id=match_id, payload={"elapsed": elapsed}, source=source)
    await manager.broadcast({
        "type": "timer_stopped",
        "match_id": match_id,
        "accumulated_elapsed_ms": elapsed,
    })
    return _serialize_timer(timer, elapsed)


@router.post("/{match_id}/reset")
async def reset(match_id: int, source: str = "web", db: Session = Depends(get_db)):
    timer = reset_timer(db, match_id)
    log_action(db, "timer_reset", match_id=match_id, source=source)
    await manager.broadcast({
        "type": "timer_reset",
        "match_id": match_id,
    })
    return _serialize_timer(timer, 0)
