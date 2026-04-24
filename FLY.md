# Fly.io deployment

This project deploys as two Fly apps:

- Backend FastAPI app: `fly.backend.toml`
- Frontend Next.js app: `fly.frontend.toml`

The frontend needs the backend public URL at build time because `NEXT_PUBLIC_API_URL`
is bundled into the browser code.

## 1. Pick app names

The default config uses:

- `nexus-tournament-backend`
- `nexus-tournament-frontend`

Fly app names are globally unique. If either name is taken, edit the `app` values in
`fly.backend.toml` and `fly.frontend.toml`.

If you rename the backend app, also update both `NEXT_PUBLIC_API_URL` values in
`fly.frontend.toml`:

```toml
NEXT_PUBLIC_API_URL = "https://your-backend-app.fly.dev"
```

## 2. Create the apps

```bash
fly apps create nexus-tournament-backend
fly apps create nexus-tournament-frontend
```

Use your edited names if you changed them.

## 3. Create the backend volume

SQLite needs persistent disk storage on Fly:

```bash
fly volumes create tournament_data \
  --app nexus-tournament-backend \
  --region mad \
  --size 1
```

Use the same region as `primary_region` in `fly.backend.toml`.

## 4. Deploy backend

```bash
fly deploy --config fly.backend.toml
```

On first boot, the backend creates `/data/tournament.db` and seeds the default
16-team bracket only if the database is empty.

## 5. Deploy frontend

If you kept the default backend app name:

```bash
fly deploy --config fly.frontend.toml
```

If you renamed the backend app, either edit `fly.frontend.toml` first or pass the
backend URL as a build arg:

```bash
fly deploy --config fly.frontend.toml \
  --build-arg NEXT_PUBLIC_API_URL=https://your-backend-app.fly.dev
```

## Useful commands

```bash
fly status --config fly.backend.toml
fly logs --config fly.backend.toml
fly ssh console --config fly.backend.toml

fly status --config fly.frontend.toml
fly logs --config fly.frontend.toml
```

## Notes

- Keep the backend at one running Machine while using SQLite, because one writable
  volume can only be attached to one Machine at a time.
- The backend config disables autostop so the WebSocket and timer state stay
  available during the tournament.
- The frontend config also disables autostop to avoid cold starts during live use.
