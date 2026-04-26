"""
Run with: python seed.py
Seeds the database with 16 placeholder teams and initializes the empty bracket shell.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import models
from database import Base, SessionLocal, apply_schema_updates, engine
from models import Team
from services.audit import log_action
from services.bracket_service import TOURNAMENT_TEAM_CAPACITY, seed_bracket

TEAMS = [
    ("GreenLab", 1),
    ("Maze Runners", 2),
    ("Akatsuki", 3),
    ("Meca 36", 4),
    ("lmkmlin", 5),
    ("CR^2", 6),
    ("MazeRiders", 7),
    ("fsdmrobotics", 8),
    ("GearStorm", 9),
    ("AUI Mechatronics", 10),
    ("lbalbala", 11),
    ("ElectroPower", 12),
    ("IMPERIUM", 13),
    ("CSC-", 14),
    ("ERROR POWER", 15),
    ("circuit breaker", 16),
]


def validate_seed_data() -> None:
    if len(TEAMS) != TOURNAMENT_TEAM_CAPACITY:
        raise ValueError(
            f"Expected exactly {TOURNAMENT_TEAM_CAPACITY} teams for the roulette flow, found {len(TEAMS)}."
        )

    names = [name for name, _seed in TEAMS]
    if len(set(names)) != len(names):
        raise ValueError("Team names in TEAMS must be unique.")

    seeds = [seed for _name, seed in TEAMS]
    if len(set(seeds)) != len(seeds):
        raise ValueError("Team seeds in TEAMS must be unique.")


def clear_database(db) -> None:
    db.query(models.AuditLog).delete()
    db.query(models.PenaltyEvent).delete()
    db.query(models.RecordEvent).delete()
    db.query(models.RouletteSelection).delete()
    db.query(models.TimerState).delete()
    db.query(models.TournamentState).delete()
    db.query(models.Match).delete()
    db.query(models.Team).delete()
    db.commit()


def create_teams(db) -> list[Team]:
    teams: list[Team] = []
    for name, seed in TEAMS:
        team = Team(name=name, seed=seed)
        db.add(team)
        db.flush()
        teams.append(team)

    db.commit()

    for team in teams:
        db.refresh(team)

    return teams


def run() -> None:
    validate_seed_data()
    Base.metadata.create_all(bind=engine)
    apply_schema_updates()

    db = SessionLocal()
    try:
        clear_database(db)
        teams = create_teams(db)

        # Create the empty 15-match bracket shell.
        # Teams are then placed from the roulette page before tournament start.
        seed_bracket(db)

        log_action(db, "database_seeded", payload={"teams": [team.name for team in teams]})

        print(f"Seeded {len(teams)} teams")
        print("Created empty bracket with 15 matches")
        print("Roulette is required to place teams into the bracket before the tournament starts")
        print("\nTeams:")
        for team in teams:
            print(f"  [{team.seed:2d}] {team.name} (id={team.id})")
    finally:
        db.close()


if __name__ == "__main__":
    run()
