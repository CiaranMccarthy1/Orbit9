# Planet X — SPHEREx Explorer · Project Structure

Interactive multi-epoch SPHEREx sky explorer built on NASA/IPAC IRSA SPHEREx data
(DR1 + quick releases). Stack: FastAPI + PostgreSQL backend, Vite + TypeScript +
Aladin Lite v3 frontend.

## Repo tree

```
.
├── docker-compose.yml          db (postgres) + api (FastAPI); prod serves built frontend
├── .env.example                DATABASE_URL, STORAGE_DIR, CORS_ORIGINS, MAX_RAW_GB
├── PLAN.md                     full build plan (phases 0–4)
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt        fastapi, sqlalchemy, alembic, astropy, reproject,
│   │                           pillow, httpx, pytest
│   ├── alembic.ini
│   │
│   ├── storage/                named Docker volume; raw FITS + rendered PNGs
│   │   ├── fits_raw/           downloaded MEF FITS per epoch (LRU-capped)
│   │   └── png_renders/        cache-keyed ZScale PNGs + display FITS
│   │
│   └── app/
│       ├── main.py             FastAPI app; serves /storage and frontend dist/ static
│       ├── config.py           env-driven settings (no hardcoded localhost)
│       ├── database.py         SQLAlchemy engine/session
│       ├── models.py           targets, frames, renders (JSONB WCS + spectral meta)
│       ├── schemas.py          Pydantic response models
│       │
│       ├── api/
│       │   ├── routes_targets.py    GET /targets (seeded challenge presets)
│       │   ├── routes_renders.py    GET /frames, /render, /sed, /flags
│       │   └── routes_overlays.py   overlay/catalog helpers (Gaia, base HiPS)
│       │
│       ├── pipeline/
│       │   ├── irsa_fetcher.py      IRSA SIA2 query by ra/dec → epochs; FITS download
│       │   ├── wcs_aligner.py       reproject epochs onto a common grid
│       │   ├── png_renderer.py      ZODI-subtract, ZScale → PNG + display FITS
│       │   ├── diff_engine.py       epoch N − N−1 → motion dipoles
│       │   ├── coadd_engine.py      weighted stack of K epochs
│       │   ├── band_stacker.py      sum bands per detector array (1–6) + All
│       │   ├── rgb_composer.py      molecular false-color band→RGB composites
│       │   ├── flag_masker.py       FLAGS/VARIANCE artifact mask overlay
│       │   └── sed_extractor.py     per-band aperture photometry (102 channels)
│       │
│       └── scripts/
│           ├── seed_presets.py      Barnard's Star, Eps Ind B, WISE 0855, RW Aur, R Dra
│           └── sync_new_releases.py re-query IRSA since=last_seen per cached target
│
└── frontend/
    ├── package.json            vite, typescript, aladin-lite, chart.js, tailwind
    ├── vite.config.ts          dev proxy → backend api; build → dist/ served by FastAPI
    ├── index.html
    ├── tailwind.config.js
    │
    └── src/
        ├── main.ts             Aladin init, LoD rule (FoV ≤ 1° → SPHEREx layer), wiring
        ├── styles.css
        ├── api.ts              typed fetch wrappers for /targets, /frames, /render…
        ├── urlState.ts         ra/dec/fov/epoch/band/mode ↔ URL params (+ &embed=true)
        │
        └── ui/
            ├── timeline.ts     scrubber: play/pause, step, FPS slider, epoch badges
            ├── targetBar.ts    challenge-target quick-launcher
            ├── split.ts        dual-pane epoch N vs N−1 comparator, synced pan/zoom
            ├── bandMixer.ts    detector-array toggles (1–6 + All), RGB channel assign
            ├── sedDrawer.ts    Chart.js log-log spectrum on sky click
            └── inspector.ts    FLAGS/VARIANCE/ZODI quality panel + red artifact mask
```

## Request flow

```
URL state → Aladin (ra/dec/fov)
  → GET /frames     (IRSA SIA2 query, cached in Postgres)
  → epoch list
  → GET /render     (per epoch → PNG + display-FITS, sha1 cache key)
  → Aladin layer / split panes / diff view / SED extractor
```

## Render modes (one endpoint, `mode=`)

| mode | Output |
|---|---|
| `single` | one epoch, one band/array selection |
| `diff` | epoch N − N−1, motion dipoles |
| `coadd` | weighted stack of K epochs |
| `rgb` | three assigned bands composited false-color |

## Deployment

- Local dev: `docker compose up` (db + api) + vite dev server.
- EC2: `docker compose up -d` only — FastAPI serves the built frontend; all URLs env-driven.
