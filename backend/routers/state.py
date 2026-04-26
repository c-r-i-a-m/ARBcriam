from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Match, Team, TournamentState, PenaltyEvent, RecordEvent, RouletteSelection
from services.timer_service import get_or_create_timer, compute_elapsed_ms
from services.bracket_service import (
    ensure_active_match,
    ensure_bracket_exists,
    get_full_bracket,
    get_roulette_state,
    seed_bracket,
)
from services.audit import log_action
from services.match_resolution import get_pending_resolution
from services.penalties import build_penalty_summaries
from services.websocket_manager import manager

router = APIRouter()


@router.get("/current")
def get_current_state(db: Session = Depends(get_db)):
    ensure_bracket_exists(db)
    ensure_active_match(db)
    state = db.query(TournamentState).first()
    teams = db.query(Team).order_by(Team.seed, Team.id).all()
    matches = get_full_bracket(db)
    roulette = get_roulette_state(db)

    active_match = None
    timer_data = None
    penalties = {}
    records = {}
    pending_resolution = get_pending_resolution(db)

    if state and state.active_match_id:
        active_match = db.query(Match).filter(Match.id == state.active_match_id).first()
        if active_match:
            timer = get_or_create_timer(db, active_match.id)
            elapsed = compute_elapsed_ms(timer)
            timer_data = {
                "id": timer.id,
                "match_id": timer.match_id,
                "is_running": timer.is_running,
                "started_at": str(timer.started_at) if timer.started_at else None,
                "accumulated_elapsed_ms": timer.accumulated_elapsed_ms,
                "current_elapsed_ms": elapsed,
            }
            evs = db.query(PenaltyEvent).filter(PenaltyEvent.match_id == active_match.id).all()
            penalties = build_penalty_summaries(evs)
            # Records
            recs = db.query(RecordEvent).filter(RecordEvent.match_id == active_match.id).order_by(RecordEvent.created_at).all()
            for r in recs:
                if r.team_id not in records:
                    records[r.team_id] = []
                records[r.team_id].append({
                    "id": r.id,
                    "match_id": r.match_id,
                    "team_id": r.team_id,
                    "recorded_elapsed_ms": r.recorded_elapsed_ms,
                    "label": r.label,
                    "created_at": str(r.created_at),
                    "source": r.source,
                })

    def serialize_team(t):
        return {"id": t.id, "name": t.name, "seed": t.seed} if t else None

    def serialize_match(m):
        return {
            "id": m.id,
            "round": m.round,
            "slot_index": m.slot_index,
            "side": m.side,
            "team1_id": m.team1_id,
            "team2_id": m.team2_id,
            "winner_id": m.winner_id,
            "status": m.status,
            "next_match_id": m.next_match_id,
            "next_match_slot": m.next_match_slot,
            "team1": serialize_team(m.team1),
            "team2": serialize_team(m.team2),
            "winner": serialize_team(m.winner),
        }

    return {
        "active_match_id": state.active_match_id if state else None,
        "current_round": state.current_round if state else 1,
        "timer": timer_data,
        "pending_resolution": pending_resolution,
        "penalties": penalties,
        "records": records,
        "roulette": roulette,
        "teams": [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams],
        "matches": [serialize_match(m) for m in matches],
    }


@router.post("/reset")
async def reset_tournament(db: Session = Depends(get_db)):
    """Hard reset - clears all match data, keeps teams."""
    from models import AuditLog, PenaltyEvent, RecordEvent, TimerState, TournamentState
    db.query(AuditLog).delete()
    db.query(PenaltyEvent).delete()
    db.query(RecordEvent).delete()
    db.query(RouletteSelection).delete()
    db.query(TimerState).delete()
    db.query(TournamentState).delete()
    db.query(Match).delete()
    db.commit()

    if db.query(Team).count() > 0:
        seed_bracket(db)

    log_action(db, "tournament_reset", payload={"teams": db.query(Team).count()})

    await manager.broadcast({"type": "tournament_reset"})
    return {"ok": True}


@router.post("/init")
async def init_bracket(db: Session = Depends(get_db)):
    """Initialize the empty bracket shell (idempotent if already done)."""
    existing = db.query(Match).count()
    if existing > 0:
        ensure_active_match(db)
        return {"ok": True, "message": "Bracket already initialized", "matches": existing}

    seed_bracket(db)
    log_action(db, "bracket_initialized", payload={"teams": db.query(Team).count()})
    await manager.broadcast({"type": "bracket_initialized"})
    return {"ok": True, "message": "Bracket shell initialized"}
