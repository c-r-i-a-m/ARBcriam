from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Match
from schemas import MatchOut
from typing import List

router = APIRouter()


@router.get("/", response_model=List[MatchOut])
def list_matches(db: Session = Depends(get_db)):
    return db.query(Match).order_by(Match.round, Match.slot_index).all()


@router.get("/{match_id}", response_model=MatchOut)
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(404, "Match not found")
    return match
