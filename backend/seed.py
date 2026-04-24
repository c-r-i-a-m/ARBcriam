"""
Run with: python seed.py
Seeds the database with 16 placeholder teams and initializes the bracket.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, SessionLocal, Base
import models
from models import Team, Match, TournamentState
from services.bracket_service import seed_bracket
from services.audit import log_action

TEAMS = [
    ("MECHA-01", 1), ("TITAN-7", 2), ("ARB", 3), ("APEX UNIT", 4),
    ("IRONCLAD", 5), ("PHANTOM X", 6), ("VORTEX", 7), ("ZERO-G", 8),
    ("STRIKER", 9), ("NOVA", 10), ("PULSE", 11), ("ECHO", 12),
    ("AXIOM", 13), ("HYDRA", 14), ("DELTA-3", 15), ("SPARK", 16),
]


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Clear existing data
    db.query(models.AuditLog).delete()
    db.query(models.PenaltyEvent).delete()
    db.query(models.RecordEvent).delete()
    db.query(models.TimerState).delete()
    db.query(models.TournamentState).delete()
    db.query(models.Match).delete()
    db.query(models.Team).delete()
    db.commit()

    # Create teams
    teams = []
    for name, seed in TEAMS:
        t = Team(name=name, seed=seed)
        db.add(t)
        db.flush()
        teams.append(t)
    db.commit()

    # Refresh all
    for t in teams:
        db.refresh(t)

    # Initialize bracket
    seed_bracket(db, teams)

    log_action(db, "database_seeded", payload={"teams": [t.name for t in teams]})

    print(f"✓ Seeded {len(teams)} teams")
    print(f"✓ Created bracket with 15 matches")
    print("\nTeams:")
    for t in teams:
        print(f"  [{t.seed:2d}] {t.name} (id={t.id})")

    db.close()


if __name__ == "__main__":
    run()
