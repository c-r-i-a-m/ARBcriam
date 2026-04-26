from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import AuditLog
from schemas import AuditLogOut
from typing import List, Optional

router = APIRouter()


@router.get("/", response_model=List[AuditLogOut])
def get_logs(
    limit: int = Query(100, le=500),
    match_id: Optional[int] = None,
    action_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if match_id:
        q = q.filter(AuditLog.match_id == match_id)
    if action_type:
        q = q.filter(AuditLog.action_type == action_type)
    return q.order_by(AuditLog.created_at.desc()).limit(limit).all()
