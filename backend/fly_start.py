from database import Base, SessionLocal, engine
from models import Team
from seed import run as seed_database


def main() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        has_teams = db.query(Team.id).first() is not None
    finally:
        db.close()

    if not has_teams:
        seed_database()


if __name__ == "__main__":
    main()
