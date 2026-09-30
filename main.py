import os
import dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Tuple, Dict, List, Optional

# Load environment variables
dotenv.load_dotenv()

from core.pathfinder import calculate_route
from core.ai_briefing import generate_eva_briefing
from core.storage import save_route, get_cached_routes, get_preset_waypoints

app = FastAPI(
    title="Martian Route & EVA Planner API",
    description="Hybrid Geospatial Graph-AI Engine for Mars Surface Extravehicular Activity",
    version="2.0.0"
)

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
    start_lat: float = Field(..., example=18.4447)
    start_lon: float = Field(..., example=77.4508)
    end_lat: float = Field(..., example=18.4550)
    end_lon: float = Field(..., example=77.4180)
    penalty_k: float = Field(10.0, example=10.0)
    max_slope_deg: float = Field(15.0, example=15.0)
    walking_speed_kmh: float = Field(3.5, example=3.5)
    api_key: Optional[str] = None
    start_name: Optional[str] = "Custom Point A"
    end_name: Optional[str] = "Custom Point B"

@app.get("/")
async def read_index():
    """Serves the main NASA Mission Control single-page web app."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found in static folder.")
    return FileResponse(index_path)

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
    Calculates A* optimal EVA route over Mars DEM grid 
    and generates Gemini AI Mission Flight Director briefing.
    """
    try:
        start_pt = (req.start_lat, req.start_lon)
        end_pt = (req.end_lat, req.end_lon)
        
        # 1. Compute A* Path & Metrics
        route_data, path_stats = calculate_route(
            start_pt,
            end_pt,
            penalty_k=req.penalty_k,
            max_slope_deg=req.max_slope_deg,
            walking_speed_kmh=req.walking_speed_kmh
        )
        
        # 2. Generate Gemini AI Safety Briefing
        briefing = generate_eva_briefing(path_stats, api_key=req.api_key)
        
        # 3. Cache Route in SQLite
        route_name = f"{req.start_name} ➔ {req.end_name}"
        save_route(route_name, start_pt, end_pt, path_stats, route_data['geojson'], briefing)
        
        return {
            "status": "success",
            "route_data": route_data,
            "path_stats": path_stats,
            "briefing": briefing
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server pathfinding error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
