from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Match, RouletteSelection, Team, TournamentState


# Progression map: match_slot_index -> (next_match_slot_index, team_slot_in_next (1 or 2))
# This encodes the full 15-match single elimination bracket split left/right
#
# Left side R16: slots 0-3 (round 1)
# Right side R16: slots 4-7 (round 1)
# Left QF: slots 0-1 (round 2)
# Right QF: slots 2-3 (round 2)
# Left SF: slot 0 (round 3)
# Right SF: slot 1 (round 3)
# Final: slot 0 (round 4)

BRACKET_STRUCTURE = [
    # (round, slot_index, side, next_match_round, next_match_slot, next_team_slot)
    (1, 0, "left", 2, 0, 1),
    (1, 1, "left", 2, 0, 2),
    (1, 2, "left", 2, 1, 1),
    (1, 3, "left", 2, 1, 2),
    (1, 4, "right", 2, 2, 1),
    (1, 5, "right", 2, 2, 2),
    (1, 6, "right", 2, 3, 1),
    (1, 7, "right", 2, 3, 2),
    (2, 0, "left", 3, 0, 1),
    (2, 1, "left", 3, 0, 2),
    (2, 2, "right", 3, 1, 1),
    (2, 3, "right", 3, 1, 2),
    (3, 0, "left", 4, 0, 1),
    (3, 1, "right", 4, 0, 2),
    (4, 0, "center", None, None, None),
]

TOURNAMENT_TEAM_CAPACITY = 16


def is_playable_match(match: Match) -> bool:
    return bool(match.team1_id and match.team2_id and match.status != "completed")


def serialize_team(team: Optional[Team]) -> Optional[Dict[str, Any]]:
    if not team:
        return None
    return {"id": team.id, "name": team.name, "seed": team.seed}


def serialize_roulette_selection(selection: RouletteSelection) -> Dict[str, Any]:
    return {
        "id": selection.id,
        "team_id": selection.team_id,
        "selection_order": selection.selection_order,
        "match_id": selection.match_id,
        "team_slot": selection.team_slot,
        "created_at": str(selection.created_at),
        "team": serialize_team(selection.team),
    }


def get_ordered_teams(db: Session) -> List[Team]:
    return db.query(Team).order_by(Team.seed, Team.id).all()


def get_ordered_roulette_selections(db: Session) -> List[RouletteSelection]:
    return (
        db.query(RouletteSelection)
        .order_by(RouletteSelection.selection_order, RouletteSelection.id)
        .all()
    )


def bootstrap_roulette_from_existing_bracket(db: Session) -> None:
    if db.query(RouletteSelection).count() > 0:
        return

    opening_matches = (
        db.query(Match)
        .filter(Match.round == 1)
        .order_by(Match.slot_index)
        .all()
    )
    if not opening_matches:
        return

    order = 1
    seen_team_ids = set()
    created_any = False

    for match in opening_matches:
        for team_slot, team_id in ((1, match.team1_id), (2, match.team2_id)):
            if not team_id or team_id in seen_team_ids:
                continue

            db.add(
                RouletteSelection(
                    team_id=team_id,
                    selection_order=order,
                    match_id=match.id,
                    team_slot=team_slot,
                )
            )
            seen_team_ids.add(team_id)
            order += 1
            created_any = True

    if created_any:
        db.commit()


def get_remaining_roulette_teams(db: Session) -> List[Team]:
    bootstrap_roulette_from_existing_bracket(db)
    selected_team_ids = {
        selection.team_id for selection in get_ordered_roulette_selections(db)
    }
    return [team for team in get_ordered_teams(db) if team.id not in selected_team_ids]


def get_roulette_state(db: Session) -> Dict[str, Any]:
    bootstrap_roulette_from_existing_bracket(db)

    teams = get_ordered_teams(db)
    selections = get_ordered_roulette_selections(db)
    remaining_teams = get_remaining_roulette_teams(db)
    total_teams = len(teams)
    assigned_count = len(selections)
    can_spin = total_teams == TOURNAMENT_TEAM_CAPACITY and assigned_count < TOURNAMENT_TEAM_CAPACITY
    can_start_tournament = (
        total_teams == TOURNAMENT_TEAM_CAPACITY
        and assigned_count == TOURNAMENT_TEAM_CAPACITY
    )

    return {
        "total_teams": total_teams,
        "capacity": TOURNAMENT_TEAM_CAPACITY,
        "assigned_count": assigned_count,
        "remaining_count": len(remaining_teams),
        "can_spin": can_spin,
        "can_start_tournament": can_start_tournament,
        "assigned_teams": [serialize_roulette_selection(selection) for selection in selections],
        "remaining_teams": [serialize_team(team) for team in remaining_teams],
    }


def ensure_bracket_exists(db: Session) -> List[Match]:
    existing_matches = db.query(Match).count()
    if existing_matches == 0:
        seed_bracket(db)
    bootstrap_roulette_from_existing_bracket(db)
    return get_full_bracket(db)


def get_next_playable_match(db: Session) -> Optional[Match]:
    return (
        db.query(Match)
        .filter(
            Match.team1_id.isnot(None),
            Match.team2_id.isnot(None),
            Match.status != "completed",
        )
        .order_by(Match.round, Match.slot_index)
        .first()
    )


def set_tournament_active_match(db: Session, match: Optional[Match]) -> Optional[Match]:
    state = db.query(TournamentState).first()
    if not state:
        state = TournamentState(current_round=match.round if match else 1)
        db.add(state)

    active_matches = db.query(Match).filter(Match.status == "active").all()
    for active in active_matches:
        if match and active.id == match.id:
            continue
        active.status = "pending"

    if match:
        match.status = "active"
        state.active_match_id = match.id
        state.current_round = match.round
    else:
        state.active_match_id = None
        state.current_round = 1

    state.updated_at = datetime.utcnow()
    db.commit()
    if match:
        db.refresh(match)
    db.refresh(state)
    return match


def is_bracket_ready(db: Session) -> bool:
    roulette_state = get_roulette_state(db)
    return bool(roulette_state["can_start_tournament"])


def ensure_active_match(db: Session) -> Optional[Match]:
    if not is_bracket_ready(db):
        return set_tournament_active_match(db, None)

    state = db.query(TournamentState).first()
    if state and state.active_match_id:
        active = db.query(Match).filter(Match.id == state.active_match_id).first()
        if active and is_playable_match(active):
            if active.status != "active":
                return set_tournament_active_match(db, active)
            return active

    return set_tournament_active_match(db, get_next_playable_match(db))


def get_match_for_selection_order(db: Session, selection_order: int) -> tuple[Match, int]:
    if selection_order < 1 or selection_order > TOURNAMENT_TEAM_CAPACITY:
        raise ValueError("Selection order is out of bounds for the opening bracket")

    slot_index = (selection_order - 1) // 2
    team_slot = 1 if selection_order % 2 == 1 else 2
    match = (
        db.query(Match)
        .filter(Match.round == 1, Match.slot_index == slot_index)
        .first()
    )
    if not match:
        raise ValueError("Opening match slot does not exist")

    return match, team_slot


def assign_team_to_next_slot(db: Session, team: Team) -> RouletteSelection:
    bootstrap_roulette_from_existing_bracket(db)

    current_count = db.query(RouletteSelection).count()
    if current_count >= TOURNAMENT_TEAM_CAPACITY:
        raise ValueError("All opening slots are already filled")

    existing_selection = (
        db.query(RouletteSelection)
        .filter(RouletteSelection.team_id == team.id)
        .first()
    )
    if existing_selection:
        raise ValueError("Team has already been assigned by the roulette")

    selection_order = current_count + 1
    match, team_slot = get_match_for_selection_order(db, selection_order)

    if team_slot == 1:
        match.team1_id = team.id
    else:
        match.team2_id = team.id

    match.updated_at = datetime.utcnow()

    selection = RouletteSelection(
        team_id=team.id,
        selection_order=selection_order,
        match_id=match.id,
        team_slot=team_slot,
    )
    db.add(selection)
    db.commit()
    db.refresh(selection)
    db.refresh(match)
    return selection


def seed_bracket(db: Session, teams: Optional[List[Team]] = None):
    match_map = {}
    for rnd, slot, side, *_ in BRACKET_STRUCTURE:
        match = Match(round=rnd, slot_index=slot, side=side, status="pending")
        db.add(match)
        db.flush()
        match_map[(rnd, slot)] = match

    for rnd, slot, _side, next_rnd, next_slot, next_team_slot in BRACKET_STRUCTURE:
        if next_rnd is None:
            continue
        current = match_map[(rnd, slot)]
        next_match = match_map[(next_rnd, next_slot)]
        current.next_match_id = next_match.id
        current.next_match_slot = next_team_slot

    state = db.query(TournamentState).first()
    if not state:
        state = TournamentState(active_match_id=None, current_round=1)
        db.add(state)
    else:
        state.active_match_id = None
        state.current_round = 1

    db.commit()

    if teams:
        for team in teams[:TOURNAMENT_TEAM_CAPACITY]:
            assign_team_to_next_slot(db, team)
        ensure_active_match(db)

    return match_map


def advance_winner(db: Session, match: Match, winner_id: int) -> Optional[Match]:
    if not match.next_match_id:
        return None

    next_match = db.query(Match).filter(Match.id == match.next_match_id).first()
    if not next_match:
        return None

    if match.next_match_slot == 1:
        next_match.team1_id = winner_id
    else:
        next_match.team2_id = winner_id

    next_match.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(next_match)
    return next_match


def get_full_bracket(db: Session) -> List[Match]:
    return db.query(Match).order_by(Match.round, Match.slot_index).all()
