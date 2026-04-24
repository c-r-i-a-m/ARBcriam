from sqlalchemy.orm import Session
from models import AuditLog
from typing import Optional, Any
import json


def log_action(
    db: Session,
    action_type: str,
    match_id: Optional[int] = None,
    team_id: Optional[int] = None,
    payload: Optional[Any] = None,
    source: str = "system",
):
    entry = AuditLog(
        action_type=action_type,
        match_id=match_id,
        team_id=team_id,
        payload_json=json.dumps(payload) if payload is not None else None,
        source=source,
    )
    db.add(entry)
    db.commit()
    return entry
