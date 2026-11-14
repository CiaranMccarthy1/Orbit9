from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Planet X API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_targets.router)
app.include_router(routes_frames.router)
app.include_router(routes_render.router)

# only rendered PNGs are public; fits_raw/ and the sqlite db stay private
app.mount("/storage/png_renders",
          StaticFiles(directory=str(Path(config.STORAGE_DIR, "png_renders"))),
          name="storage")


@app.get("/health")
def health():
    return {"status": "ok"}
