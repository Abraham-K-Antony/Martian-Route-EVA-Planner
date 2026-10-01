import os
import dotenv
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Tuple, Dict, List, Optional

# Load environment variables
dotenv.load_dotenv()

from core.pathfinder import MartianPathfinder, calculate_route
from core.ai_briefing import generate_eva_briefing
from core.storage import save_route, get_cached_routes, get_preset_waypoints

# Martian Route & EVA Planner Engine
# Developed & Architected by: Abraham K Antony
# Repository: https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner
# Copyright (c) 2026 Abraham K Antony. All Rights Reserved.

__author__ = "Abraham K Antony"
__copyright__ = "Copyright (c) 2026 Abraham K Antony"

app = FastAPI(
    title="Martian Route & EVA Planner API",
    description="Hybrid Geospatial Graph-AI Engine for Mars Surface Extravehicular Activity",
    version="2.0.0"
)

# Developer Watermark HTTP Middleware
@app.middleware("http")
async def add_developer_watermark_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Developer-Author"] = "Abraham K Antony"
    response.headers["X-Repository-URL"] = "https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner"
    response.headers["X-Watermark-Signature"] = "AUTHENTIC-ORIGINAL-ABRAHAM-K-ANTONY-2026"
    return response

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static directory setup
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class RouteRequest(BaseModel):
    start_lat: float = Field(..., ge=-90.0, le=90.0, description="Start latitude (-90 to 90)", example=18.4447)
    start_lon: float = Field(..., ge=-180.0, le=180.0, description="Start longitude (-180 to 180)", example=77.4508)
    end_lat: float = Field(..., ge=-90.0, le=90.0, description="Destination latitude (-90 to 90)", example=18.4550)
    end_lon: float = Field(..., ge=-180.0, le=180.0, description="Destination longitude (-180 to 180)", example=77.4180)
    penalty_k: float = Field(10.0, ge=1.0, le=50.0, example=10.0)
    max_slope_deg: float = Field(15.0, ge=3.0, le=30.0, example=15.0)
    preferred_slope_deg: float = Field(8.0, ge=1.0, le=25.0, example=8.0)
    walking_speed_kmh: float = Field(3.5, ge=0.5, le=10.0, example=3.5)
    is_round_trip: bool = Field(False, example=False)
    api_key: Optional[str] = None
    start_name: Optional[str] = "Custom Point A"
    end_name: Optional[str] = "Custom Point B"

@app.api_route("/", methods=["GET", "HEAD"])
async def read_index():
    """Serves the main NASA Mission Control single-page web app."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found in static folder.")
    return FileResponse(index_path)

@app.get("/favicon.ico")
async def favicon():
    """Returns a Mars red planet SVG favicon."""
    svg_content = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#ff4500"/><path d="M20 50 Q50 30 80 50 Q50 70 20 50" fill="none" stroke="#ffaa88" stroke-width="4"/><circle cx="35" cy="35" r="8" fill="#cc3300"/><circle cx="65" cy="60" r="12" fill="#cc3300"/></svg>'
    from fastapi.responses import Response
    return Response(content=svg_content, media_type="image/svg+xml")

@app.get("/api/presets")
async def get_presets():
    """Get predefined Jezero Crater waypoints."""
    return {"status": "success", "presets": get_preset_waypoints()}

@app.get("/api/routes/cached")
async def get_cached():
    """Get recent cached routes from SQLite database."""
    return {"status": "success", "routes": get_cached_routes(limit=10)}

@app.post("/api/route/calculate")
async def calculate_eva_route(req: RouteRequest):
    """
    Calculates physical Minetti metabolic A* EVA routes over Mars DEM grid 
    (Lowest Energy, Fastest, Safest, Legacy) and generates Gemini AI briefing.
    """
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
        
        # Generate Gemini AI Safety Briefing
        briefing = generate_eva_briefing(path_stats, api_key=req.api_key)
        
        # Cache Route in SQLite
        route_name = f"{req.start_name} ➔ {req.end_name}" + (" (Round Trip)" if req.is_round_trip else "")
        save_route(route_name, start_pt, end_pt, path_stats, route_data['geojson'], briefing)
        
        return {
            "status": "success",
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server pathfinding error: {str(e)}")

@app.get("/api/watermark")
async def get_system_watermark():
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
