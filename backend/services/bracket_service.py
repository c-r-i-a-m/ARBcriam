from sqlalchemy.orm import Session
from models import Match, Team, TournamentState
from typing import List, Optional
from datetime import datetime


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
    # R16 Left
    (1, 0, "left",   2, 0, 1),
    (1, 1, "left",   2, 0, 2),
    (1, 2, "left",   2, 1, 1),
    (1, 3, "left",   2, 1, 2),
    # R16 Right
    (1, 4, "right",  2, 2, 1),
    (1, 5, "right",  2, 2, 2),
    (1, 6, "right",  2, 3, 1),
    (1, 7, "right",  2, 3, 2),
    # QF Left
    (2, 0, "left",   3, 0, 1),
    (2, 1, "left",   3, 0, 2),
    # QF Right
    (2, 2, "right",  3, 1, 1),
    (2, 3, "right",  3, 1, 2),
    # SF Left
    (3, 0, "left",   4, 0, 1),
    # SF Right
    (3, 1, "right",  4, 0, 2),
    # Final
    (4, 0, "center", None, None, None),
]


def is_playable_match(match: Match) -> bool:
    return bool(match.team1_id and match.team2_id and match.status != "completed")


def get_next_playable_match(db: Session) -> Optional[Match]:
    """Return the next match that can be shown on timer/jury screens."""
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
    """Persist the active match and keep at most one non-completed match active."""
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

    state.updated_at = datetime.utcnow()
    db.commit()
    if match:
        db.refresh(match)
    db.refresh(state)
    return match


def ensure_active_match(db: Session) -> Optional[Match]:
    """Keep timer/jury screens from falling back to TBD when a match is ready."""
    state = db.query(TournamentState).first()
    if state and state.active_match_id:
        active = db.query(Match).filter(Match.id == state.active_match_id).first()
        if active and is_playable_match(active):
            if active.status != "active":
                return set_tournament_active_match(db, active)
            return active

    return set_tournament_active_match(db, get_next_playable_match(db))


def seed_bracket(db: Session, teams: List[Team]):
    """Create all 15 matches and assign teams to R16 slots."""
    # Create all matches first (no teams assigned)
    match_map = {}  # (round, slot) -> Match
    for (rnd, slot, side, *_) in BRACKET_STRUCTURE:
        m = Match(round=rnd, slot_index=slot, side=side, status="pending")
        db.add(m)
        db.flush()
        match_map[(rnd, slot)] = m

    # Set next_match_id references
    for (rnd, slot, side, next_rnd, next_slot, next_team_slot) in BRACKET_STRUCTURE:
        if next_rnd is not None:
            current = match_map[(rnd, slot)]
            next_m = match_map[(next_rnd, next_slot)]
            current.next_match_id = next_m.id
            current.next_match_slot = next_team_slot

    # Assign teams to R16 - left side gets first 8, right side gets last 8
    left_r16 = [(1, i) for i in range(4)]
    right_r16 = [(1, i+4) for i in range(4)]

    team_assignments = [
        # Match slot -> (team1, team2)
        (left_r16[0],  teams[0], teams[1]),
        (left_r16[1],  teams[2], teams[3]),
        (left_r16[2],  teams[4], teams[5]),
        (left_r16[3],  teams[6], teams[7]),
        (right_r16[0], teams[8], teams[9]),
        (right_r16[1], teams[10], teams[11]),
        (right_r16[2], teams[12], teams[13]),
        (right_r16[3], teams[14], teams[15]),
    ]

    for ((rnd, slot), t1, t2) in team_assignments:
        m = match_map[(rnd, slot)]
        m.team1_id = t1.id
        m.team2_id = t2.id

    # Create or update tournament state
    first_match = match_map[(1, 0)]
    first_match.status = "active"
    state = db.query(TournamentState).first()
    if not state:
        state = TournamentState(active_match_id=first_match.id, current_round=1)
        db.add(state)
    else:
        state.active_match_id = first_match.id
        state.current_round = 1

    db.commit()

    return match_map


def advance_winner(db: Session, match: Match, winner_id: int) -> Optional[Match]:
    """Propagate winner to the next match."""
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
