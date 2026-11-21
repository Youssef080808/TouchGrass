# Turfed

**Phones down. Crew up. Take your turf.**

Turfed rewards time spent off your phone with real people. Start a Hang somewhere real, friends join by scanning
your QR code, everyone puts their phone face-down, and you earn points. Points also claim map hexagons for your
team, so your crew can take over parks and neighbourhoods. When another team takes one of your zones, you get a
**Friend or Foe** choice: fight back, or team up for a joint Hang.

Built for CodeJam 16 (Touch Grass / People First tracks). It's a mobile website that installs to the home screen
like an app, so anyone can join a Hang by scanning a QR code with no app store.

## What's in here

```
backend/                FastAPI + SQLAlchemy (Postgres on Neon, or SQLite for quick testing)
  app/main.py           app setup; also serves the built front end
  app/models.py         database tables
  app/points.py         the points formula (tune the numbers here)
  app/territory.py      hexagon ownership, fading, Friend or Foe alerts
  app/places.py         place suggestions (Google Places or sample Montreal places)
  app/routers/          API endpoints: users, teams (join requests), hangs (+ live WebSocket), map/leaderboard/suggestions
  seed.py               fake teams, players and territory for demos
frontend/               React + Vite + Tailwind, phone-first
  src/pages/            Onboarding, Home, HangPage, Results, MapPage, Leaderboard, Profile, JoinPage
  src/hooks/            useHang (live updates), usePhoneDown (phone-down detection)
  src/index.css         colours for the light and dark themes (change them here)
Dockerfile              builds everything into one container for deploying
```

## Design

- Colours for light and dark mode live in `frontend/src/index.css` (navy + lime, hexagons as the motif).
- Fonts: Barlow Condensed for headings and numbers, Barlow for text (bundled, no Google Fonts request).
- From [21st.dev](https://21st.dev): the floating tab bar (`components/TabBar.jsx`, based on "Bottom Nav Bar" by
  arunachalam) and rolling numbers (`components/AnimatedNumber.jsx`, based on "Animated Number" by ikascom).
- Confetti on the results screen uses `canvas-confetti`. All animations turn off when the phone asks for reduced motion.

## Run it locally

You need Python 3.11+ and Node 22+. Use two terminals.

**Terminal 1: backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then paste your Neon DATABASE_URL, or leave it empty for SQLite
python seed.py --reset             # fake teams, players and territory
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

**Terminal 2: front end**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. On a laptop, go to **Me → Testing tools → Pretend I'm at McGill** so location works.
To test a group Hang on one computer, open a second browser window in private/incognito mode as another player.

**After `git pull`:** run `npm install` in `frontend` if packages changed, and restart the backend so it loads
the new code. If a new feature is missing (for example "Your team" says the server is running older code), an old
backend is probably still running. This happens a lot on Windows, where Ctrl+C can leave the old server alive:

```powershell
netstat -ano | findstr :8000        # the last number is the process ID (PID) still using port 8000
taskkill /PID <that number> /F      # stop it, then start the backend again
```

To check which code the backend runs, open http://localhost:8000/docs: the **teams** section should list
`/api/me/team/leave`.

## Test on real phones (needs HTTPS)

Phone browsers only allow location, motion sensors and keep-screen-awake on HTTPS sites. Two options:

**Quick: tunnel from your laptop**

```bash
cd frontend && npm run build       # FastAPI now serves the app too
cd ../backend && uvicorn app.main:app --port 8000
cloudflared tunnel --url http://localhost:8000    # install cloudflared first; prints an https://....trycloudflare.com link
```

Open that link on your phones. Everything (app + API + live updates) goes through the one URL.

**For the demo: deploy**

1. Create a free Postgres database on [Neon](https://neon.tech) and copy its connection string.
2. On [Render](https://render.com): New → Web Service → connect this repo → it detects the `Dockerfile`.
3. Add environment variables: `DATABASE_URL` (Neon), optionally `GOOGLE_PLACES_API_KEY` and `POINTS_TIME_SCALE`.
4. Deploy, then run the seed once from your laptop with the same `DATABASE_URL` in `backend/.env`:
   `python seed.py --reset`.

## Demo tips

- Set `POINTS_TIME_SCALE=60` so each real second counts as a minute. A 1-minute live Hang then earns real points.
- The QR code holds a link (`/join/CODE`), so judges scan it with their normal camera, sign up, and land in your Hang.
- Players must be within 100 m to join (`JOIN_RADIUS_M`). Make it bigger if the demo room's GPS is poor.
- `python seed.py --reset` wipes everything and reloads the sample data before you present. Also run it after
  pulling changes that add database columns (SQLite doesn't update existing tables).

## How it works (for the judges' Q&A)

- **Points:** minutes together × party bonus (+0.5 per teammate, +0.3 per other player, max 3×) × phones-down
  bonus (up to 1.5×) × streak bonus (+10% per day, max +50%) × active place (+20%) × bad weather (+20%), plus 25
  for a new place. Daily cap 300. See `backend/app/points.py`.
- **Locking your phone is fine:** your time counts from check-in to check-out (or until the host ends the Hang).
  A website stops running when the phone locks, so time is verified with location at check-in and check-out.
- **Phones-down bonus (optional):** keep the app open on the black screen with the phone face-down. The app sends
  a heartbeat every 15 s; the bonus grows with the share of your time spent this way. Picking the phone up,
  switching apps or locking it pauses the bonus (heartbeats stop, so the server stops counting).
  See `frontend/src/hooks/usePhoneDown.js` and `backend/app/routers/hangs.py`.
  A native app would read real screen-time data instead, with no black screen needed.
- **Anti-cheat:** you must be within 100 m of the host to join. After that the group can move around together:
  your time only stops if you go home (within 100 m of your rounded, private home, unless the Hang is there).
  While the app is open it checks your location every 30 s; checking out from home stops your time at the last
  moment you were confirmed out; the host can't end the Hang from home; solo sessions only count 100 m+ from
  home or at a suggested place.
  - Hangs under 10 minutes earn nothing (stops "zone hopping" with 1-minute Hangs).
  - If nobody else stays 10+ minutes, the Hang counts as solo, so a "group" of one on the couch earns nothing.
  - "I'm here" at a suggested place only works within 400 m of it.
  - If nobody opens the app for 3 hours, the Hang ends by itself and time counts only up to the last check-in.
    It also ends once everyone has left.
  - The "pretend I'm somewhere else" testing tools only exist in demo builds (`VITE_DEMO_MODE=true`, always on
    with `npm run dev`). A determined person can still fake GPS with outside tools; a native app could use the
    phone's mock-location detection.
- **Teams:** you can't just put yourself on a team. Asking to join sends a request to everyone on it, and you're
  in once any one of them accepts (the first answer counts). Empty teams are open. You can leave, or ask to
  switch to another team and move over when they accept. See `backend/app/routers/teams.py`.
- **Territory:** the map uses Uber's H3 hexagons (about 350 m across). Each Hang adds each member's points to
  their team in that hexagon. Scores fade 10% a day, so zones must be defended. Most points owns it; within 20% is
  "contested". See `backend/app/territory.py`.
- **Live updates:** the Hang screen keeps a WebSocket open; the server checks the Hang every 2 s and pushes changes.
  If the WebSocket fails, the app falls back to asking every 3 s.
- **Privacy:** 18+ only; no live location is shown to anyone; home is rounded and never shown; the map shows teams,
  never individual people.
- **What breaks at 100× the users:** territory is computed from every score row on each request (fix: keep running
  totals per hex and team, fade them nightly); the WebSocket checks the database every 2 s per viewer (fix:
  Postgres LISTEN/NOTIFY or Redis pub/sub); tables are created on startup (fix: Alembic migrations).

## Ideas to build next

- "Team up" button: start a joint Hang with the rival team and split the zone (now it just starts a Hang).
- Photo check with an AI vision model as extra proof you're outside.
- Friends list and matching with nearby people who share interests.
- Native app version: real screen-time and pickup data, app blocking, push notifications.
