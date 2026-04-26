import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./tournament.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def apply_schema_updates() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_names = inspector.get_table_names()
        if "penalty_events" in table_names:
            columns = {column["name"] for column in inspector.get_columns("penalty_events")}
            if "penalty_type" not in columns:
                connection.execute(text("ALTER TABLE penalty_events ADD COLUMN penalty_type VARCHAR(20)"))

            connection.execute(
                text(
                    "UPDATE penalty_events "
                    "SET penalty_type = 'legacy' "
                    "WHERE penalty_type IS NULL OR penalty_type = ''"
                )
            )

        if "tournament_state" not in table_names:
            return

        tournament_state_columns = {
            column["name"] for column in inspector.get_columns("tournament_state")
        }
        missing_columns = {
            "pending_resolution_type": "VARCHAR(32)",
            "pending_resolution_match_id": "INTEGER",
            "pending_resolution_winner_id": "INTEGER",
            "pending_resolution_loser_id": "INTEGER",
            "pending_resolution_message": "VARCHAR(255)",
            "pending_resolution_tone": "VARCHAR(16)",
            "pending_resolution_payload_json": "TEXT",
            "pending_resolution_created_at": "DATETIME",
        }

        for column_name, column_type in missing_columns.items():
            if column_name in tournament_state_columns:
                continue
            connection.execute(
                text(
                    f"ALTER TABLE tournament_state ADD COLUMN {column_name} {column_type}"
                )
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
