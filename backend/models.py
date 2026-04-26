from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, BigInteger
)
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    seed = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RouletteSelection(Base):
    __tablename__ = "roulette_selections"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, unique=True)
    selection_order = Column(Integer, nullable=False, unique=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    team_slot = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    team = relationship("Team")
    match = relationship("Match")


class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True, index=True)
    round = Column(Integer, nullable=False)        # 1=R16, 2=QF, 3=SF, 4=Final
    slot_index = Column(Integer, nullable=False)   # position within round
    side = Column(String(10), nullable=True)       # 'left', 'right', 'center'
    team1_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    team2_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    winner_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    status = Column(String(20), default="pending")  # pending, active, completed
    next_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    next_match_slot = Column(Integer, nullable=True)  # 1 or 2 (team1/team2)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    team1 = relationship("Team", foreign_keys=[team1_id])
    team2 = relationship("Team", foreign_keys=[team2_id])
    winner = relationship("Team", foreign_keys=[winner_id])


class TimerState(Base):
    __tablename__ = "timer_states"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True, unique=True)
    is_running = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    accumulated_elapsed_ms = Column(BigInteger, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PenaltyEvent(Base):
    __tablename__ = "penalty_events"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    penalty_type = Column(String(20), default="legacy")
    penalty_value = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String(100), default="web")

    team = relationship("Team")


class RecordEvent(Base):
    __tablename__ = "record_events"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    recorded_elapsed_ms = Column(BigInteger, nullable=False)
    label = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String(100), default="web")

    team = relationship("Team")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    action_type = Column(String(100), nullable=False)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String(100), default="system")


class TournamentState(Base):
    __tablename__ = "tournament_state"
    id = Column(Integer, primary_key=True)
    active_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    current_round = Column(Integer, default=1)
    pending_resolution_type = Column(String(32), nullable=True)
    pending_resolution_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    pending_resolution_winner_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    pending_resolution_loser_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    pending_resolution_message = Column(String(255), nullable=True)
    pending_resolution_tone = Column(String(16), nullable=True)
    pending_resolution_payload_json = Column(Text, nullable=True)
    pending_resolution_created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
