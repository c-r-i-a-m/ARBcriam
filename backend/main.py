from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import teams, bracket, matches, timer, events, logs, state
from services.websocket_manager import router as ws_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tournament Control System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(teams.router,   prefix="/api/teams",   tags=["teams"])
app.include_router(bracket.router, prefix="/api/bracket", tags=["bracket"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(timer.router,   prefix="/api/timer",   tags=["timer"])
app.include_router(events.router,  prefix="/api/events",  tags=["events"])
app.include_router(logs.router,    prefix="/api/logs",    tags=["logs"])
app.include_router(state.router,   prefix="/api/state",   tags=["state"])
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"status": "ok"}
