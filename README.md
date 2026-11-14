# Planet X — SPHEREx Explorer

Interactive viewer for NASA/IPAC IRSA SPHEREx sky data.

## Run

### Docker (recommended)

Build once (Compose uses the host network for the API build to avoid the PyPI DNS timeout):

```bash
sudo docker compose build
```

Then run:

```bash
sudo docker compose up -d --no-build
```

Web: http://localhost:8080 · API: http://localhost:8000 · docs: http://localhost:8000/docs

The `web` service builds the frontend and serves it with nginx, proxying the
API on the same origin. A cold SPHEREx render can take a couple of minutes.

### Local dev (no Docker)

```bash
cd backend
cp ../.env.example .env
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000
```

Uses SQLite in `backend/storage/` by default.

If `backend/storage` was created by an earlier `sudo docker` run, take it back once:

```bash
sudo chown -R $(id -u):$(id -g) backend/storage
```

### Frontend dev

```bash
cd frontend
npm ci
npm run dev
```

Vite runs on http://localhost:5173 and proxies API requests to `localhost:8000`.
Set `VITE_API_BASE_URL` to point at a different backend.

## Endpoints

| Path | What it does | Auth |
|---|---|---|
| `GET /health` | liveness | — |
| `GET /targets` | preset sky targets | — |
| `GET /frames?ra&dec&radius` | observation epochs covering a position (cached 24 h) | — |
| `GET /render?url=...` | IRSA SPHEREx FITS → stretched PNG | — |
| `GET /combine?mode=diff\|coadd\|stack&urls=...` | epoch subtraction / stacking / band sums → PNG | — |
| `GET /rgb?r&g&b` | three bands → false-colour composite | — |
| `GET /photometry?ra&dec&urls=...` | aperture medians across band files | — |
| `GET /flags?url=...` | FLAGS bit counts + VARIANCE summary | — |
| `POST /register` | create account `{username, password}` | — |
| `POST /login` | log in, returns 7-day bearer token | — |
| `GET /me` | current account | bearer |
| `POST /logout` | invalidate the token | bearer |
| `GET /discoveries` | claimed planets (public read) | — |
| `POST /discoveries` | claim a discovery `{name, ra, dec}`; first claim within 1″ wins | bearer |

All endpoints are JSON. `POST` bodies are JSON objects; query params on `GET`.
Every IRSA URL parameter is validated against `https://irsa.ipac.caltech.edu/ibe/data/spherex/`.
Rendered PNGs are served at `/storage/png_renders/{sha1}.png`.

## Curl examples
The first claim within 1 arcsecond wins. RA and Dec work like
```bash
curl localhost:8000/health
curl localhost:8000/targets
curl "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05"

URL=$(curl -s "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05" \
  | jq -r '.exposures[0].bands[0].url')
curl --get --data-urlencode "url=$URL" localhost:8000/render

# epoch N - N-1 of the same detector array (motion dipoles)
URL2=$(curl -s "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05" \
  | jq -r '.exposures[1].bands[0].url')
curl -G localhost:8000/combine --data-urlencode "mode=diff" \
  --data-urlencode "urls=$URL,$URL2"

# aperture photometry at the target position
curl -G localhost:8000/photometry --data-urlencode "ra=269.452" \
  --data-urlencode "dec=4.693" --data-urlencode "urls=$URL,$URL2"
```

## Config

Copy `.env.example` to `backend/.env` for local development. Always launch with
`uv run --env-file .env ...`; the app does not implicitly load dotenv files.
Adjust `DATABASE_URL`, `STORAGE_DIR`, `CORS_ORIGINS`, `MAX_RAW_GB`, `MAX_PNG_GB`.
SQLite defaults to `backend/storage/app.db` when started from `backend/`.
Startup logs the resolved database backend, host and database, without credentials.
Compose explicitly uses Postgres at the Docker hostname `db`, and its named storage
volume; the local SQLite example is not a Docker database override.

Both published ports bind to loopback. For public access, terminate HTTPS on a
reverse proxy/load balancer in front of `127.0.0.1:8080`, redirect HTTP to HTTPS,
and keep port 8000 private. Passwords and bearer tokens require HTTPS on public
networks. nginx limits `/login` and `/register` to 10 requests/minute/IP with a
burst of 10 (429 when exceeded); school NATs share that budget. Behind another
proxy, configure nginx real-IP handling only for that trusted proxy so clients
do not all share its address. Vite is for local development and has no rate limit.
Expired sessions are removed on login and startup.

## Accounts and discoveries

Open `/signin` to sign in or create an account. `/login` remains a POST-only API.
Every page header offers session controls. A signed-out claim returns through
`/signin?next=...` with its name and coordinates preserved; only local redirect
paths are accepted. `/catalog`, `/explorer`, and `/signin` are real HTML entries.
Catalog cards show pending, completed, and retrying classifications. “Load more”
fetches another 50 claims; search, counts and the observer list cover loaded results.
`GET /discoveries?limit=50&offset=0` remains a JSON array (maximum limit 100).

Register with `POST /register` and log in with `POST /login`, using JSON
`{"username":"observer", "password":"at-least-8-characters"}`. Login returns a
bearer token valid for seven days. Send it in `Authorization: Bearer <token>`
to use `GET /me`, `POST /logout`, and `POST /discoveries`. A discovery accepts
JSON such as `{"name":"New world", "ra":12.3, "dec":-4.5}`. Anyone can
read `GET /discoveries`. The first claim within one arcsecond wins.

### Candidate classification on submission

Every accepted claim persists its optional epoch clicks and is classified by one
background worker per API process, so `POST /discoveries`
returns immediately with `"classification": null`. The backend queries IRSA for
the band files at that position, measures background-subtracted aperture
photometry, fits a blackbody temperature and molecular absorption indices, and
stores the result on the discovery. Failed work is retried after five minutes;
interrupted work becomes eligible again when its 15-minute lease expires, including
after restart. No in-memory task backlog or queue service is needed. `GET /discoveries`
returns results once ready:

```json
"classification": {
  "classification": "L/T Brown Dwarf",
  "confidence": 0.9,
  "measurements": {"t_eff_k": 1450.0, "ch4_depth": 0.31, "n_bands_valid": 2, ...}
}
```

To also fit **parallax and proper motion**, include the positions you clicked in
each epoch (at least 5 distinct epochs; four exactly fit the four model coefficients
and cannot expose bad clicks through residuals):

```json
{"name": "New world", "ra": 269.452, "dec": 4.693,
 "epochs": [{"mjd": 60903.86, "ra": 269.4520, "dec": 4.6930},
            {"mjd": 61087.12, "ra": 269.4524, "dec": 4.6932},
            {"mjd": 61270.40, "ra": 269.4522, "dec": 4.6931},
            {"mjd": 61420.63, "ra": 269.4525, "dec": 4.6933},
            {"mjd": 61520.63, "ra": 269.4526, "dec": 4.6934}]}
```

The browser claim form is **photometric-only**; submit epoch clicks through the API
for motion/parallax fits. Without clicks the newest two exposures are selected.
Zero or one usable band produces an insufficient-data label. Flagged or absent
pixels alone do not establish cosmic-ray evidence, so this pipeline does not label
them cosmic rays. Fits with residuals above 1 arcsecond are labelled unreliable.
Confidence numbers are heuristic scores, capped at 0.6 for two usable bands and
0.9 otherwise; they are not calibrated probabilities.

The classifier is indicative, not publication-grade: it uses broadband detector-array
files (not 102 spectra) with no photometric calibration. The first submission at a
position downloads up to 4 × 60 MB FITS files; the classification appears on
`GET /discoveries` when it finishes.

Keep the Postgres and storage volumes when restarting. Back up user data before
any database maintenance; normal build/restart commands do not delete claims.
FITS downloads are validated before caching. Linux `flock` locks prevent duplicate
builds and protect active readers. PNG eviction keeps a five-minute grace period
for recently advertised URLs, so disk caps are soft during active work. Lock files
are intentionally retained to preserve lock identity across processes.

### Account and discovery curl tests

Run against the local API at `http://localhost:8000`:

```bash
# Register, then log in and save the bearer token
curl -i -X POST http://localhost:8000/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"observer","password":"at-least-8-characters"}'
TOKEN=$(curl -s -X POST http://localhost:8000/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"observer","password":"at-least-8-characters"}' \
  | jq -r '.access_token')

# Check the authenticated user
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/me

# List discoveries (public)
curl http://localhost:8000/discoveries

# Claim a planet (first claim within 1 arcsecond wins)
curl -i -X POST http://localhost:8000/discoveries \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"New world","ra":12.3,"dec":-4.5}'

# Log out; this invalidates the token
curl -i -X POST http://localhost:8000/logout \
  -H "Authorization: Bearer $TOKEN"
```

## Checks

```bash
cd backend
uv run pytest -q
uvx pyright app tests
cd ../frontend
npm ci
npm test
npm run build
cd ..
docker compose config
# Requires Docker daemon permission:
docker compose build
docker compose up -d --no-build
curl -fsS localhost:8000/health
curl -fsS localhost:8080/ | head
```

The backend tests cover HTTP auth/status shapes, expiry cleanup, 1″ conflicts,
concurrent startup/seeding, database retries, spatial prefiltering, pagination,
cache races/eviction, malformed SIA/FITS input, redirects and classifier decisions.
Frontend tests use the installed TypeScript compiler and Node test runner (no new
runtime dependencies): safe redirects, error messages, classification states,
escaped session names and independent HTML entries.

Browser release checks: disable cache and select Slow 3G, hard-reload `/`, and verify
the dark background and hidden guide before JS; visit each entry directly; test
register/duplicate/wrong password/login/logout/expired token; claim after a sign-in
redirect and test a 1″ conflict; check delayed/error IRSA paths, 390px width, Tab,
Escape and focus restoration. Use a separate database and verify the test API's
port before creating any test records. Safari/iOS, speech and live IRSA load need
separate hardware/network checks.

The original build shipped 2,651 KB JS (863 KB gzip) with the homepage. The split
build loads about 4.8 KB JS for sign-in and 12 KB for catalog; Aladin remains a
2,610 KB (848 KB gzip) lazy chunk for maps. nginx compresses JS/CSS/JSON and caches
hashed assets for one year. `frontend/package.json` is the only npm manifest;
`frontend/dist` is generated by the build, never an authoritative source.
