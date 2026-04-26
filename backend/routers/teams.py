import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Team
from schemas import RouletteConfirmRequest, TeamCreate, TeamOut
from services.audit import log_action
from services.bracket_service import (
    TOURNAMENT_TEAM_CAPACITY,
    assign_team_to_next_slot,
    ensure_active_match,
    ensure_bracket_exists,
    get_match_for_selection_order,
    get_ordered_teams,
    get_remaining_roulette_teams,
    get_roulette_state,
)
from services.websocket_manager import manager

router = APIRouter()


def _validate_roulette_team_count(teams: List[Team]) -> None:
    if len(teams) != TOURNAMENT_TEAM_CAPACITY:
        raise HTTPException(
            400,
            f"Roulette requires exactly {TOURNAMENT_TEAM_CAPACITY} teams. Found {len(teams)}.",
        )


def _serialize_pick(team: Team, selection_order: int, match_id: int, team_slot: int) -> dict:
    return {
        "selected_team": {"id": team.id, "name": team.name, "seed": team.seed},
        "pending_selection": {
            "selection_order": selection_order,
            "match_id": match_id,
            "team_slot": team_slot,
        },
    }


def _serialize_confirm_result(selected_team: Team, selection, roulette_state: dict, active_match) -> dict:
    return {
        "selected_team": {"id": selected_team.id, "name": selected_team.name, "seed": selected_team.seed},
        "selection": {
            "id": selection.id,
            "selection_order": selection.selection_order,
            "match_id": selection.match_id,
            "team_slot": selection.team_slot,
            "created_at": str(selection.created_at),
        },
        "tournament_ready": bool(roulette_state["can_start_tournament"]),
        "active_match_id": active_match.id if active_match else None,
        "roulette": roulette_state,
    }


@router.get("/", response_model=List[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    return db.query(Team).order_by(Team.seed, Team.id).all()


@router.post("/", response_model=TeamOut)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    team = Team(name=body.name, seed=body.seed)
    db.add(team)
    db.commit()
    db.refresh(team)
    log_action(db, "team_created", team_id=team.id, payload={"name": team.name})
    return team


@router.get("/roulette")
def get_roulette(db: Session = Depends(get_db)):
    ensure_bracket_exists(db)
    return get_roulette_state(db)


@router.post("/roulette/pick")
def pick_roulette_team(db: Session = Depends(get_db)):
    ensure_bracket_exists(db)

    teams = get_ordered_teams(db)
    _validate_roulette_team_count(teams)

    remaining_teams = get_remaining_roulette_teams(db)
    if not remaining_teams:
        raise HTTPException(409, "All teams have already been placed in the bracket")

    selected_team = random.choice(remaining_teams)
    roulette_state = get_roulette_state(db)
    selection_order = int(roulette_state["assigned_count"]) + 1
    assigned_match, team_slot = get_match_for_selection_order(db, selection_order)
    return _serialize_pick(selected_team, selection_order, assigned_match.id, team_slot)


@router.post("/roulette/confirm")
async def confirm_roulette_team(body: RouletteConfirmRequest, db: Session = Depends(get_db)):
    ensure_bracket_exists(db)

    teams = get_ordered_teams(db)
    _validate_roulette_team_count(teams)

    remaining_team_ids = {team.id for team in get_remaining_roulette_teams(db)}
    if body.team_id not in remaining_team_ids:
        raise HTTPException(409, "This team is no longer available in the roulette")

    selected_team = db.query(Team).filter(Team.id == body.team_id).first()
    if not selected_team:
        raise HTTPException(404, "Team not found")

    selection = assign_team_to_next_slot(db, selected_team)
    assigned_match, team_slot = get_match_for_selection_order(db, selection.selection_order)
    roulette_state = get_roulette_state(db)
    tournament_ready = bool(roulette_state["can_start_tournament"])

    log_action(
        db,
        "roulette_team_selected",
        match_id=assigned_match.id,
        team_id=selected_team.id,
        payload={
            "selection_order": selection.selection_order,
            "team_slot": team_slot,
            "tournament_ready": tournament_ready,
        },
        source=body.source,
    )

    await manager.broadcast(
        {
            "type": "roulette_team_selected",
            "team_id": selected_team.id,
            "team_name": selected_team.name,
            "selection_order": selection.selection_order,
            "match_id": assigned_match.id,
            "team_slot": team_slot,
            "tournament_ready": tournament_ready,
        }
    )
    await manager.broadcast(
        {
            "type": "bracket_updated",
            "match_id": assigned_match.id,
            "round": assigned_match.round,
            "slot_index": assigned_match.slot_index,
        }
    )

    active_match = None
    if tournament_ready:
        active_match = ensure_active_match(db)
        await manager.broadcast({"type": "roulette_completed"})
        await manager.broadcast(
            {
                "type": "active_match_changed",
                "match_id": active_match.id if active_match else None,
                "round": active_match.round if active_match else None,
            }
        )

    return _serialize_confirm_result(selected_team, selection, roulette_state, active_match)


@router.post("/roulette/spin")
async def spin_roulette(db: Session = Depends(get_db)):
    pick = pick_roulette_team(db)
    body = RouletteConfirmRequest(team_id=pick["selected_team"]["id"], source="web")
    return await confirm_roulette_team(body, db)


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    return team


@router.put("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, body: TeamCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    old_name = team.name
    team.name = body.name
    if body.seed is not None:
        team.seed = body.seed
    db.commit()
    db.refresh(team)
    log_action(db, "team_updated", team_id=team.id, payload={"old": old_name, "new": team.name})
    return team
