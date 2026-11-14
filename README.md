# Planet X — SPHEREx Explorer

Interactive viewer for NASA/IPAC IRSA SPHEREx sky data.

## Run

### Docker (recommended)

First build (host network avoids a container-DNS timeout on PyPI):

```bash
sudo docker build --network host --allow network.host -t orbit9-api ./backend
```

Then run:

```bash
sudo docker compose up --build
```

Web: http://localhost:8080 · API: http://localhost:8000 · docs: http://localhost:8000/docs

The `web` service builds the frontend and serves it with nginx, proxying the
API on the same origin. A cold SPHEREx render can take a couple of minutes.

### Local dev (no Docker)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
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

Copy `.env.example` and adjust: `DATABASE_URL`, `STORAGE_DIR`, `CORS_ORIGINS`,
`MAX_RAW_GB`, `MAX_PNG_GB`.

## Accounts and discoveries

Register with `POST /register` and log in with `POST /login`, using JSON
`{"username":"observer", "password":"at-least-8-characters"}`. Login returns a
bearer token valid for seven days. Send it in `Authorization: Bearer <token>`
to use `GET /me`, `POST /logout`, and `POST /discoveries`. A discovery accepts
JSON such as `{"name":"New world", "ra":12.3, "dec":-4.5}`. Anyone can
read `GET /discoveries`. The first claim within one arcsecond wins.

### Candidate classification on submission

Every accepted claim is classified in the background, so `POST /discoveries`
returns immediately with `"classification": null`. The backend queries IRSA for
the band files at that position, measures background-subtracted aperture
photometry, fits a blackbody temperature and molecular absorption indices, and
stores the result on the discovery. `GET /discoveries` returns it once ready:

```json
"classification": {
  "classification": "L/T Brown Dwarf",
  "confidence": 0.9,
  "measurements": {"t_eff_k": 1450.0, "ch4_depth": 0.31, "n_bands_valid": 2, ...}
}
```

To also fit **parallax and proper motion**, include the positions you clicked in
each epoch (at least 4 distinct epochs; 3 is fully determined and would report a
fake parallax):

```json
{"name": "New world", "ra": 269.452, "dec": 4.693,
 "epochs": [{"mjd": 60903.86, "ra": 269.4520, "dec": 4.6930},
            {"mjd": 61087.12, "ra": 269.4524, "dec": 4.6932},
            {"mjd": 61270.40, "ra": 269.4522, "dec": 4.6931},
            {"mjd": 61420.63, "ra": 269.4525, "dec": 4.6933}]}
```

The classifier is indicative, not publication-grade: it uses broadband detector-array
files (not 102 spectra) with no photometric calibration. The first submission at a
position downloads up to 4 × 60 MB FITS files; the classification appears on
`GET /discoveries` when it finishes.

To reset the database, stop the API first. For local SQLite, remove
`backend/storage/app.db` and restart the API. For Docker, run
`docker compose down -v` and then `docker compose up`. These commands delete
all database records; startup recreates the tables and preset targets.

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
