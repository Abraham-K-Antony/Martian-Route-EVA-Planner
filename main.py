import os
import uuid
import logging
import asyncio
import dotenv
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, SecretStr
from typing import Tuple, Dict, List, Optional

# Rate Limiting via slowapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables
dotenv.load_dotenv()

from core.pathfinder import MartianPathfinder, calculate_route
from core.ai_briefing import generate_eva_briefing
from core.storage import save_route, get_cached_routes, get_preset_waypoints

# Logger Configuration
logger = logging.getLogger("martian_eva")
logger.setLevel(logging.INFO)

app = FastAPI(
    title="Martian Route & EVA Planner API",
    description="Hybrid Geospatial Graph-AI Engine for Mars Surface Extravehicular Activity",
    version="2.2.0"
)

# Initialize slowapi Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Global Concurrency Semaphore (max 2 concurrent pathfinding calculations)
calc_semaphore = asyncio.Semaphore(2)

# In-memory Briefing Cache
_briefing_cache: Dict[str, str] = {}

# Developer Watermark HTTP Middleware
@app.middleware("http")
async def add_developer_watermark_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Developer-Author"] = "Abraham K Antony"
    response.headers["X-Repository-URL"] = "https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner"
    response.headers["X-Watermark-Signature"] = "AUTHENTIC-ORIGINAL-ABRAHAM-K-ANTONY-2026"
    return response

# Standardized 500 Global Exception Handler (Hides tracebacks, logs error_id)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    
    error_id = f"ERR-{uuid.uuid4().hex[:8]}"
    logger.error(f"[{error_id}] Global server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error_id": error_id,
            "detail": "An unexpected server error occurred during mission calculation."
        }
    )

# Hardened CORS Configuration (Same-Origin by default; whitelist via ALLOWED_ORIGINS env)
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
        allow_headers=["*"],
    )

# Static directory setup
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class RouteRequest(BaseModel):
    start_lat: float = Field(..., ge=-90.0, le=90.0, description="Start latitude (-90 to 90)")
    start_lon: float = Field(..., ge=-180.0, le=180.0, description="Start longitude (-180 to 180)")
    end_lat: float = Field(..., ge=-90.0, le=90.0, description="Destination latitude (-90 to 90)")
    end_lon: float = Field(..., ge=-180.0, le=180.0, description="Destination longitude (-180 to 180)")
    penalty_k: float = Field(10.0, gt=0.0, le=50.0)
    max_slope_deg: float = Field(15.0, gt=0.0, le=30.0)
    preferred_slope_deg: float = Field(8.0, ge=1.0, le=25.0)
    walking_speed_kmh: float = Field(3.5, gt=0.0, le=10.0)
    is_round_trip: bool = Field(False)
    start_name: Optional[str] = "Custom Point A"
    end_name: Optional[str] = "Custom Point B"

class BriefingRequest(BaseModel):
    distance_m: float = Field(..., gt=0.0)
    duration_h: float = Field(..., gt=0.0)
    max_slope: float = Field(..., ge=0.0)
    elevation_gain_m: float = Field(0.0)
    elevation_loss_m: float = Field(0.0)
    o2_consumed_liters: float = Field(0.0)
    o2_consumed_kg: float = Field(0.0)
    plss_used_pct: float = Field(0.0)
    los_coverage_pct: float = Field(100.0)
    glare_hazards_count: int = Field(0)
    shadow_hazards_count: int = Field(0)
    hazards_avoided: int = Field(0)
    point_of_no_return_index: int = Field(0)
    start_name: Optional[str] = "Start Base"
    end_name: Optional[str] = "Destination Target"

@app.api_route("/", methods=["GET", "HEAD"])
@app.get("/planner")
@app.get("/how-it-works")
@app.get("/mission-sites")
@app.get("/about")
@app.get("/contact")
async def read_index(request: Request):
    """Serves the main NASA Mission Control single-page web app."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found in static folder.")
    return FileResponse(index_path, headers={"Cache-Control": "no-cache, must-revalidate"})

@app.get("/favicon.ico")
async def favicon(request: Request):
    """Returns a Mars red planet SVG favicon."""
    svg_content = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#ff4500"/><path d="M20 50 Q50 30 80 50 Q50 70 20 50" fill="none" stroke="#ffaa88" stroke-width="4"/><circle cx="35" cy="35" r="8" fill="#cc3300"/><circle cx="65" cy="60" r="12" fill="#cc3300"/></svg>'
    from fastapi.responses import Response
    return Response(content=svg_content, media_type="image/svg+xml")

@app.get("/api/presets")
@limiter.limit("30/minute")
async def get_presets(request: Request):
    """Get predefined Jezero Crater waypoints."""
    return {"status": "success", "presets": get_preset_waypoints()}

@app.get("/api/routes/cached")
@limiter.limit("30/minute")
async def get_cached(request: Request):
    """Get recent cached routes from SQLite database."""
    return {"status": "success", "routes": get_cached_routes(limit=10)}

@app.post("/api/route/calculate")
@limiter.limit("10/minute")
async def calculate_eva_route(
    request: Request,
    req: RouteRequest
):
    """
    Calculates physical Minetti metabolic A* EVA routes over Mars DEM grid 
    immediately returning path metrics and Go/No-Go verdict without waiting for LLM.
    """
    if calc_semaphore.locked():
        raise HTTPException(
            status_code=503,
            detail="Server busy with active mission calculations. Please try again in a few seconds."
        )

    async with calc_semaphore:
        try:
            start_pt = (req.start_lat, req.start_lon)
            end_pt = (req.end_lat, req.end_lon)
            
            pathfinder = MartianPathfinder()
            
            # Verify coordinates fall within DEM spatial bounds
            bounds = pathfinder.dem.bounds
            if (req.start_lat < bounds.bottom or req.start_lat > bounds.top or
                req.start_lon < bounds.left or req.start_lon > bounds.right):
                raise ValueError(f"Start coordinate ({req.start_lat:.4f}, {req.start_lon:.4f}) is outside Jezero DEM bounds [{bounds.bottom:.2f}-{bounds.top:.2f}°N, {bounds.left:.2f}-{bounds.right:.2f}°E]. Select a location inside Jezero Crater.")
            if (req.end_lat < bounds.bottom or req.end_lat > bounds.top or
                req.end_lon < bounds.left or req.end_lon > bounds.right):
                raise ValueError(f"Destination coordinate ({req.end_lat:.4f}, {req.end_lon:.4f}) is outside Jezero DEM bounds [{bounds.bottom:.2f}-{bounds.top:.2f}°N, {bounds.left:.2f}-{bounds.right:.2f}°E]. Select a location inside Jezero Crater.")

            # Calculate routes with internal node expansion & time budget limits
            multi_result = pathfinder.calculate_all_routes(
                start_pt,
                end_pt,
                penalty_k=req.penalty_k,
                max_slope_deg=req.max_slope_deg,
                preferred_slope_deg=req.preferred_slope_deg,
                walking_speed_kmh=req.walking_speed_kmh,
                is_round_trip=req.is_round_trip
            )
            
            rec_mode = multi_result["recommended"]
            rec_route = multi_result["routes"][rec_mode]
            route_data = rec_route
            path_stats = rec_route["stats"]
            path_stats["start_name"] = req.start_name
            path_stats["end_name"] = req.end_name
            path_stats["is_synthetic_dem"] = pathfinder.dem.is_synthetic

            # Fast telemetry briefing for instant rendering
            briefing = generate_eva_briefing(path_stats, api_key=None)
            
            # Cache Route in SQLite
            route_name = f"{req.start_name} ➔ {req.end_name}" + (" (Round Trip)" if req.is_round_trip else "")
            save_route(route_name, start_pt, end_pt, path_stats, route_data['geojson'], briefing)
            
            return {
                "status": "success",
                "is_synthetic_dem": pathfinder.dem.is_synthetic,
                "developer": {
                    "author": "Abraham K Antony",
                    "repository": "https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner",
                    "signature": "AUTHENTIC-ABRAHAM-K-ANTONY-2026"
                },
                "multi_routes": multi_result["routes"],
                "recommended_mode": rec_mode,
                "route_data": route_data,
                "path_stats": path_stats,
                "briefing": briefing
            }
        except ValueError as ve:
            raise HTTPException(status_code=422, detail=str(ve))

@app.post("/api/briefing")
@limiter.limit("15/minute")
async def get_ai_briefing(
    request: Request,
    req: BriefingRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key")
):
    """
    Dedicated AI Flight Director briefing endpoint (~15s timeout, cached by parameter hash).
    """
    user_key = x_gemini_key.strip() if x_gemini_key and x_gemini_key.strip() else None
    stats = req.model_dump()
    
    # Hash cache key
    cache_key = f"{req.distance_m:.1f}_{req.duration_h:.2f}_{req.max_slope:.1f}_{req.start_name}_{req.end_name}_{bool(user_key)}"
    if cache_key in _briefing_cache:
        return {"status": "success", "briefing": _briefing_cache[cache_key], "cached": True}
        
    briefing = generate_eva_briefing(stats, api_key=user_key)
    _briefing_cache[cache_key] = briefing
    return {"status": "success", "briefing": briefing, "cached": False}

@app.get("/api/watermark")
async def get_system_watermark(request: Request):
    """System Verification Endpoint confirming original authorship."""
    return {
        "author": "Abraham K Antony",
        "project": "Martian Route & EVA Planner",
        "repository": "https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner",
        "copyright": "Copyright (c) 2026 Abraham K Antony. All Rights Reserved.",
        "watermark_hash": "AKA-EVA-2026-JEZERO-CRATER-WATERMARK-VERIFIED",
        "status": "Authentic System Original"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
