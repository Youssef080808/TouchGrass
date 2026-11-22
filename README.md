# Turfed

**Phones down. Crew up. Take your turf.**

Turfed rewards time spent off your phone with real people. Start a Hang somewhere real, friends join by scanning
your QR code, everyone puts their phone face-down, and you earn points. Points also claim map hexagons for your
team, so your crew can take over parks and neighbourhoods. When another team takes one of your zones, you get a
**Friend or Foe** choice: fight back, or team up for a joint Hang and share the zone. Plan **rallies** ahead of
time, chase the day's **hot zones** for double points, and see your **week offline** every Sunday.

Built for CodeJam 16 (Touch Grass / People First tracks). It's a mobile website that installs to the home screen
like an app, so anyone can join a Hang by scanning a QR code with no app store.

## What's in here

```
backend/                FastAPI + SQLAlchemy (Postgres on Neon, or SQLite for quick testing)
  app/main.py           app setup; also serves the built front end
  app/models.py         database tables
  app/points.py         the points formula (tune the numbers here)
  app/territory.py      hexagon ownership, fading, Friend or Foe alerts
  app/auth.py           accounts: email + password, Sign in with Google, sessions
  app/places.py         place suggestions (Google Places or sample Montreal places)
  app/plans.py          rallies: reminders, auto-expiry, Team up truces
  app/hotzones.py       the day's hot zones (double points) and the evening push
  app/routers/          API endpoints: accounts (sign in/out), users, teams (join requests), hangs (+ live WebSocket), map/leaderboard/suggestions,
                        meet (open Hangs), rallies (plans, zones, hot zones), recap (weekly recap, history)
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
- Animated folded-glass backgrounds on the welcome and results screens (`components/GlassFold.jsx`, a WebGL
  shader from [GradFlow](https://gradflow.meerbahadin.dev) via 21st.dev). Only on those two one-off screens to save
  battery; it pauses off screen and falls back to plain navy without WebGL.
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
3. Add environment variables: `DATABASE_URL` (Neon), optionally `GOOGLE_CLIENT_ID` (see below),
   `GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY` and `POINTS_TIME_SCALE`.
4. Deploy, then run the seed once from your laptop with the same `DATABASE_URL` in `backend/.env`:
   `python seed.py --reset`.

**AI ideas and icebreakers (optional)**

Put `GEMINI_API_KEY=...` (free from [Google AI Studio](https://aistudio.google.com/apikey)) in `backend/.env`
and restart the backend. Then a Hang gets "What should we do?" ideas picked for that group (shared interests,
time of day, weather), icebreakers written for the group, and Meet cards get a short "why you'd like it" line.
Only Hang details go to the model, never names, emails or exact locations. Without the key, or if the call
fails, the app uses built-in ideas and questions. To check it works: in a Hang, tap "Give us ideas"; an
"AI" tag shows when the answer came from Gemini (otherwise the backend log says why).

**Sign in with Google (optional)**

Email + password works with no setup. To add the "Continue with Google" button:

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client
   ID → Web application (set up the consent screen first if it asks: External, app name, your email).
2. Under "Authorized JavaScript origins" add `http://localhost:5173` and your deployed address
   (e.g. `https://turfed.onrender.com`). No redirect URIs needed.
3. Put the client ID in `GOOGLE_CLIENT_ID` (`backend/.env` locally, environment variables on Render) and restart.
   The button shows up on its own; no front-end rebuild.

## Demo tips

- Set `POINTS_TIME_SCALE=60` so each real second counts as a minute. A 1-minute live Hang then earns real points.
- The QR code holds a link (`/join/CODE`), so judges scan it with their normal camera, sign up, and land in your Hang.
- Players must be within 100 m to join (`JOIN_RADIUS_M`). Make it bigger if the demo room's GPS is poor.
- Notifications on a laptop: turn them on in the Me tab, allow your browser in macOS System Settings >
  Notifications, and turn off Focus. For a second player use another Chrome profile, not incognito (incognito
  blocks notifications). With `POINTS_TIME_SCALE=60` a 30-minute Hang timer goes off after 30 seconds.
- Open Hangs for Meet: `python seed.py --reset` also adds three open Hangs from sample players near McGill
  (basketball, a study session that needs approval, a run). They end by themselves after 3 hours without
  check-ins, so run `python seed.py --open` again shortly before presenting.
- Meet demo with two phones: phone A starts an open Hang; phone B (a few hundred metres away, or with a test
  location) sees it in Meet, taps "I'm coming", then "I'm here" on arrival (or just waits: with the app open it
  checks itself in within about 30 seconds of getting within 100 m). Nobody scans anything.
- Rallies: `python seed.py --reset` (or `--open`) also adds three sample rallies: a Team up soccer game with a
  rival team, an open board games night and an open run. Plan your own from Home ("Plan one"), from the Map (tap
  any zone, then "Rally here") or with "Team up" on a Friend or Foe alert. Saying "I'm in" checks you in by
  itself when you get there with the app open.
- Hot zones: two zones a day are picked automatically (one contested, one outdoors) and announced at 5 PM
  (`HOT_ZONE_PUSH_HOUR`). Any Hang in one shows "Hot zone x2" and scores double.
- `python seed.py --reset` wipes everything and reloads the sample data before you present. Also run it after
  pulling changes that add database columns (SQLite doesn't update existing tables).

## How it works (for the judges' Q&A)

- **Points:** minutes together × party bonus (+0.5 per teammate, +0.3 per other player, max 3×) × phones-down
  bonus (up to 1.5×) × streak bonus (+10% per day, max +50%) × active place (+20%) × bad weather (+20%) × hot zone
  (2×), plus 25
  for a new place, plus 15 for each person you've never been in a Hang with (up to 45), so meeting new people
  pays. Daily cap 300. See `backend/app/points.py`.
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
- **Meet (people first):** a Hang can be open to new people. Open Hangs show up in the Meet tab and on Home for
  people within 5 km, people who share your interests first. "I'm coming" tells the host (no push, so their game
  isn't interrupted); for "I approve each person" Hangs the host sees a small profile (interests, Hangs done)
  and taps yes or no, and the exact spot is only shown once you're accepted. On arrival you check yourself in
  (the server checks you're within 100 m), so nobody stops to scan a QR code; the QR stays for friends. The
  host sets the party size, and a full Hang takes no more people. Safety: open Hangs can't start at the host's
  home, anyone can be reported, reports from 3 different people block someone from open Hangs, and after the
  game the host can say a walk-in wasn't really there (their points for it are taken back). See
  `backend/app/routers/meet.py`.
- **Rallies (plan a Hang for later):** pick a place (a suggested one, where you are, or a pin you drop anywhere on
  the map, which shows whose zone it's in), a time (up to 7 days ahead) and an activity, for your team or
  open to people nearby who share your interests. Everyone who says "I'm in" gets a push 20 minutes before; from
  30 minutes before the start, the app checks you in when you're within 400 m (only while it's open, since a
  website can't track location in the background). The first person to arrive starts the Hang and the rest join
  it; nobody scans anything. Rallies nobody shows up to expire 2 hours after the start. See
  `backend/app/routers/rallies.py` and `backend/app/plans.py`.
- **Team up:** on a Friend or Foe alert, "Team up" plans a rally at that zone with the rival team invited. If
  people from both teams show up and earn points, the zone is shared for 7 days: it counts for both teams on the
  leaderboard, it isn't shown as contested, and neither team gets a "zone taken" alert from the other. This
  turns rivals into new people to meet, which is the People First idea.
- **Hot zones:** two zones a day score 2×: one that's contested (so teams fight over it) and one outdoor place.
  The pick is the same for everyone (seeded by the date), they glow on the map until midnight, and everyone with
  notifications on gets one push at 5 PM. They spread people around the city and give a reason to go out tonight.
- **Your week offline:** the Me tab shows this week's hours with friends, new people met, zones held and
  phones-down time, compared with last week, plus a history of every Hang. A push goes out on Sunday evening.
  See `backend/app/routers/recap.py`.
- **Your people:** the Meet tab lists everyone you've hung out with and your hours together. Research by
  Jeffrey Hall (2018) found it takes about 50 hours together to become casual friends, 90 to become friends and
  200 to become close friends, so each person shows a level and progress to the next one. "Hang again" sends
  them a note. When people meet for the first time, the Hang screen shows an icebreaker question based on
  what they have in common.
- **Teams:** you can't just put yourself on a team. Asking to join sends a request to everyone on it, and you're
  in once any one of them accepts (the first answer counts). Empty teams are open. You can leave, or ask to
  switch to another team and move over when they accept. See `backend/app/routers/teams.py`.
- **Notifications (Web Push):** real notifications, even when the app is closed, so phones can stay away. The host
  can set a timer ("buzz us in 1 h") and everyone hears when it's up; people also hear when a Hang ends (with
  their points), when someone asks to join their team, and when a rival takes their zone. Works in laptop
  browsers from a normal tab; on iPhone only once the site is added to the Home Screen. Keys are made on first
  run (`backend/vapid.json`, git-ignored). See `backend/app/notify.py` and `frontend/public/sw.js`.
- **Territory:** the map uses Uber's H3 hexagons (about 350 m across). Each Hang adds each member's points to
  their team in that hexagon. Scores fade 10% a day, so zones must be defended. Most points owns it; within 20% is
  "contested". See `backend/app/territory.py`.
- **Live updates:** the Hang screen keeps a WebSocket open; the server checks the Hang every 2 s and pushes changes.
  If the WebSocket fails, the app falls back to asking every 3 s.
- **Accounts:** sign up with an email + password or "Continue with Google", then sign in on any phone. Passwords
  are hashed with scrypt; each signed-in phone gets its own session token, and the database only stores a hash
  of it, so logging out really signs that phone out. Google sign-in is checked on the server (Google's signature,
  our client ID, expiry). Accounts made before this keep working and see "Save your account" in the Me tab.
  8 wrong passwords in 15 minutes locks that email for a while. No password reset email yet (needs an email
  service), but you can link Google as a second way in. See `backend/app/auth.py` and `routers/accounts.py`.
- **Privacy:** 18+ only; no live location is shown to anyone; home is rounded and never shown; the map shows teams,
  never individual people.
- **What breaks at 100× the users:** territory is computed from every score row on each request (fix: keep running
  totals per hex and team, fade them nightly); the WebSocket checks the database every 2 s per viewer (fix:
  Postgres LISTEN/NOTIFY or Redis pub/sub); tables are created on startup (fix: Alembic migrations); reminders and
  daily pushes run inside the web server every 30 s (fix: one worker process; daily and weekly pushes already
  record that they ran, so two servers won't send them twice).

## Ideas to build next

- Photo check with an AI vision model as extra proof you're outside.
- Friends list and matching with nearby people who share interests.
- Native app version: real screen-time and pickup data, app blocking, push notifications.
