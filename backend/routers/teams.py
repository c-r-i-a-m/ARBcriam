from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Team
from schemas import TeamCreate, TeamOut
from services.audit import log_action
from typing import List

router = APIRouter()


@router.get("/", response_model=List[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    return db.query(Team).order_by(Team.seed, Team.id).all()


@router.post("/", response_model=TeamOut)
def create_team(body: TeamCreate, db: Session = Depends(get_db)):
    team = Team(name=body.name, seed=body.seed)
    db.add(team)
    db.commit()
    db.refresh(team)
    log_action(db, "team_created", team_id=team.id, payload={"name": team.name})
    return team


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    return team


@router.put("/{team_id}", response_model=TeamOut)
def update_team(team_id: int, body: TeamCreate, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(404, "Team not found")
    old_name = team.name
    team.name = body.name
    if body.seed is not None:
        team.seed = body.seed
    db.commit()
    db.refresh(team)
    log_action(db, "team_updated", team_id=team.id, payload={"old": old_name, "new": team.name})
    return team
