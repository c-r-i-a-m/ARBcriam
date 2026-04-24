from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class TeamBase(BaseModel):
    name: str
    seed: Optional[int] = None


class TeamCreate(TeamBase):
    pass


class TeamOut(TeamBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MatchBase(BaseModel):
    round: int
    slot_index: int
    side: Optional[str] = None


class MatchOut(BaseModel):
    id: int
    round: int
    slot_index: int
    side: Optional[str]
    team1_id: Optional[int]
    team2_id: Optional[int]
    winner_id: Optional[int]
    status: str
    next_match_id: Optional[int]
    next_match_slot: Optional[int]
    team1: Optional[TeamOut]
    team2: Optional[TeamOut]
    winner: Optional[TeamOut]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimerStateOut(BaseModel):
    id: int
    match_id: Optional[int]
    is_running: bool
    started_at: Optional[datetime]
    accumulated_elapsed_ms: int
    current_elapsed_ms: int  # computed
    updated_at: datetime

    class Config:
        from_attributes = True


class PenaltyEventOut(BaseModel):
    id: int
    match_id: int
    team_id: int
    penalty_value: int
    created_at: datetime
    source: str
    team: Optional[TeamOut]

    class Config:
        from_attributes = True


class RecordEventOut(BaseModel):
    id: int
    match_id: int
    team_id: int
    recorded_elapsed_ms: int
    label: Optional[str]
    created_at: datetime
    source: str
    team: Optional[TeamOut]

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    id: int
    action_type: str
    match_id: Optional[int]
    team_id: Optional[int]
    payload_json: Optional[str]
    created_at: datetime
    source: str

    class Config:
        from_attributes = True


class BracketUpdateRequest(BaseModel):
    match_id: int
    team1_id: Optional[int] = None
    team2_id: Optional[int] = None


class WinnerSelectRequest(BaseModel):
    match_id: int
    winner_id: int
    source: str = "web"


class TimerActionRequest(BaseModel):
    match_id: int
    source: str = "web"


class PenaltyRequest(BaseModel):
    match_id: int
    team_id: int
    source: str = "web"


class RecordRequest(BaseModel):
    match_id: int
    team_id: int
    label: Optional[str] = None
    source: str = "web"


class TournamentStateOut(BaseModel):
    active_match_id: Optional[int]
    current_round: int
    active_match: Optional[MatchOut]
    timer: Optional[TimerStateOut]
    teams: List[TeamOut]
    matches: List[MatchOut]

    class Config:
        from_attributes = True
