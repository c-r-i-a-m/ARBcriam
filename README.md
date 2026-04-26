# ARB — Tournament Control System

> Elite robotics/mechanical competition management platform.  
> Full-stack · Next.js 15 · FastAPI · SQLite · WebSockets · Real-time

---

## Stack

| Layer     | Tech                                        |
|-----------|---------------------------------------------|
| Frontend  | Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| Backend   | FastAPI, SQLAlchemy ORM, SQLite3            |
| Real-time | WebSocket (native FastAPI)                  |
| State     | Zustand (client), SQLite (server, source of truth) |

---

## Pages

| Route      | Purpose                        | Optimized for       |
|------------|--------------------------------|---------------------|
| `/`        | Navigation hub                 | Any screen          |
| `/bracket` | 16-team elimination tree       | Large projector     |
| `/timer`   | Match chrono + team controls   | Large projector     |
| `/jury`    | Penalty + chrono actions       | Mobile phone        |

---

## Quick Start (Local)

### 1. Backend

```bash
cd backend

# Create virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Seed the database with 16 teams + bracket
python seed.py

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API available at: http://localhost:8000  
Swagger docs at: http://localhost:8000/docs

---

### 2. Frontend

```bash
cd frontend

# Copy env file
cp .env.local.example .env.local
# Edit .env.local if your backend is not on localhost:8000

# Install dependencies
npm install

# Start dev server
npm run dev
```

App available at: http://localhost:3000

---

## Quick Start (Docker)

```bash
# From the project root
docker-compose up --build

# Seed teams on first run
docker-compose exec backend python seed.py
```

## Deploy (Fly.io)

Fly deployment files live at the project root:

- `fly.backend.toml`
- `fly.frontend.toml`
- `Dockerfile.fly.backend`
- `Dockerfile.fly.frontend`

See [FLY.md](./FLY.md) for the full two-app deployment flow.

---

## Project Structure

```
tournament/
├── backend/
│   ├── main.py                  # FastAPI entry point, CORS, routes
│   ├── database.py              # SQLAlchemy engine + session
│   ├── models.py                # ORM models (Team, Match, Timer, …)
│   ├── schemas.py               # Pydantic request/response schemas
│   ├── seed.py                  # Seeds 16 teams + full bracket
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── routers/
│   │   ├── teams.py             # CRUD for teams
│   │   ├── bracket.py           # Bracket, winner selection, active match
│   │   ├── matches.py           # Match read endpoints
│   │   ├── timer.py             # Start / Stop / Reset chrono
│   │   ├── events.py            # Penalties + recorded times
│   │   ├── logs.py              # Audit log queries
│   │   └── state.py             # Full state restore, reset, init
│   └── services/
│       ├── bracket_service.py   # Bracket seeding, winner propagation
│       ├── timer_service.py     # Timer arithmetic (no drift)
│       ├── audit.py             # Centralized audit log writer
│       └── websocket_manager.py # WS connection pool + broadcast
│
└── frontend/
    ├── app/
    │   ├── layout.tsx            # Root layout, Google Fonts
    │   ├── globals.css           # Tailwind base + custom design tokens
    │   ├── page.tsx              # Home / nav hub
    │   ├── bracket/page.tsx      # Full 16-team bracket
    │   ├── timer/page.tsx        # Match chrono interface
    │   └── jury/page.tsx         # Mobile jury panel
    ├── hooks/
    │   ├── useWebSocket.ts       # Auto-reconnecting WS hook
    │   └── useTimer.ts           # Live elapsed-time hook (50ms tick)
    ├── lib/
    │   ├── api.ts                # Typed REST client
    │   └── store.ts              # Zustand tournament state store
    ├── types/index.ts            # Full TypeScript interfaces
    ├── tailwind.config.js        # Custom color palette + fonts
    └── .env.local.example        # Environment template
```

---

## API Reference

### State
| Method | Path                  | Description                        |
|--------|-----------------------|------------------------------------|
| GET    | `/api/state/current`  | Full tournament state (restore)    |
| POST   | `/api/state/init`     | Initialize bracket (idempotent)    |
| POST   | `/api/state/reset`    | Hard reset (keeps teams)           |

### Teams
| Method | Path                  | Description         |
|--------|-----------------------|---------------------|
| GET    | `/api/teams/`         | List all teams      |
| POST   | `/api/teams/`         | Create team         |
| PUT    | `/api/teams/{id}`     | Update team name    |

### Bracket
| Method | Path                        | Description                       |
|--------|-----------------------------|-----------------------------------|
| GET    | `/api/bracket/`             | Full bracket (all 15 matches)     |
| PUT    | `/api/bracket/match`        | Assign team to match slot         |
| POST   | `/api/bracket/winner`       | Select winner, propagate          |
| POST   | `/api/bracket/active/{id}`  | Set match as active/live          |

### Timer
| Method | Path                          | Description              |
|--------|-------------------------------|--------------------------|
| GET    | `/api/timer/{match_id}`       | Timer state + elapsed    |
| POST   | `/api/timer/{match_id}/start` | Start (no-op if running) |
| POST   | `/api/timer/{match_id}/stop`  | Stop, persist elapsed    |
| POST   | `/api/timer/{match_id}/reset` | Reset to 0               |

### Events
| Method | Path                                  | Description                 |
|--------|---------------------------------------|-----------------------------|
| POST   | `/api/events/penalties`               | Add penalty event           |
| GET    | `/api/events/penalties/{match_id}`    | All penalties for match     |
| GET    | `/api/events/penalties/{match_id}/counts` | Totals per team         |
| POST   | `/api/events/records`                 | Record current timer value  |
| GET    | `/api/events/records/{match_id}`      | All records for match       |

### WebSocket
```
ws://localhost:8000/ws
```

**Messages broadcast by server:**
```
bracket_updated         { match_id, round, slot_index }
winner_selected         { match_id, winner_id, next_match_id }
active_match_changed    { match_id, round }
timer_started           { match_id, accumulated_elapsed_ms, started_at }
timer_stopped           { match_id, accumulated_elapsed_ms }
timer_reset             { match_id }
penalty_added           { match_id, team_id, total_penalties, source }
time_recorded           { match_id, team_id, elapsed_ms, record_id, label, source }
tournament_reset        {}
bracket_initialized     {}
```

**Client → server:** send `"ping"`, server replies `{"type":"pong"}`

---

## Bracket Structure

```
LEFT SIDE                           CENTER     RIGHT SIDE
─────────────────────────────────────────────────────────
R16[0]─┐                                         ┌─R16[4]
R16[1]─┤QF[0]─┐                           ┌─QF[2]├─R16[5]
R16[2]─┤      ├─SF[0]─┐         ┌─SF[1]──┤      ├─R16[6]
R16[3]─┘QF[1]─┘       └──FINAL──┘        └─QF[3]└─R16[7]
                                                    ···
```

- 15 matches total (8 + 4 + 2 + 1)
- Winner auto-propagates to next match via `next_match_id` + `next_match_slot`
- Full state recoverable from SQLite at any time

---

## Data Persistence & Recovery

Every meaningful action writes to SQLite **before** broadcasting.  
On restart, `GET /api/state/current` returns complete tournament state:
- All 16 teams
- All 15 matches with winners
- Active match ID
- Timer state (accumulated elapsed + whether it was running)
- Per-team penalty counts
- Recorded timestamps per team per match

The frontend calls this endpoint on mount and hydrates from it.

---

## Design System

```
Background:   #08080f  (void black)
Panel:        #0e0e1a  (dark glass)
Border:       #1e1e30
Purple mid:   #7c4ff5
Purple vivid: #9d6fff
Accent green: #00ff9d  (timer running)
Accent red:   #ff3a5c  (penalties)

Fonts:
  Display:  Orbitron (bold, futuristic)
  Mono:     JetBrains Mono (data, labels)
  Body:     DM Sans (readable prose)
```

---

## Customising Teams

Edit `backend/seed.py`:
```python
TEAMS = [
    ("YOUR_TEAM_1", 1),
    ("YOUR_TEAM_2", 2),
    # ... 16 entries total
]
```
Then run `python seed.py` (this resets all match data).

---

## Production Notes

- Timer drift: The backend stores `started_at` UTC timestamp + `accumulated_elapsed_ms`. Even if the server restarts, elapsed time is accurate.
- WebSocket reconnects automatically every 2s on disconnect.
- All UI actions are optimistic but always confirmed by WS broadcast.
- SQLite WAL mode is not explicitly set — for high-concurrency add `PRAGMA journal_mode=WAL` to `database.py`.

---

## License

MIT — use freely for competitions, hackathons, or events.
