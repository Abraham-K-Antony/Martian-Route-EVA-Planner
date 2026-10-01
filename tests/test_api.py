import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_watermark_endpoint():
    """Verify system author watermark endpoint and headers."""
    response = client.get("/api/watermark")
    assert response.status_code == 200
    data = response.json()
    assert data["author"] == "Abraham K Antony"
    assert "Martian-Route-EVA-Planner" in data["repository"]
    assert response.headers["x-developer-author"] == "Abraham K Antony"

def test_presets_endpoint():
    """Verify preset waypoints endpoint returns 7 Jezero mission waypoints."""
    response = client.get("/api/presets")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert len(data["presets"]) == 7

def test_cached_routes_endpoint():
    """Verify cached routes endpoint."""
    response = client.get("/api/routes/cached")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "routes" in data

def test_valid_route_calculation():
    """Verify valid POST /api/route/calculate execution."""
    payload = {
        "start_lat": 18.4447,
        "start_lon": 77.4508,
        "end_lat": 18.4550,
        "end_lon": 77.4180,
        "penalty_k": 10.0,
        "max_slope_deg": 15.0,
        "preferred_slope_deg": 8.0,
        "walking_speed_kmh": 3.5,
        "is_round_trip": False
    }
    response = client.post("/api/route/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "multi_routes" in data
    assert "briefing" in data
    assert "path_stats" in data

def test_out_of_bounds_422_error():
    """Verify HTTP 422 descriptive error handling for out-of-bounds DEM coordinates."""
    payload = {
        "start_lat": 0.0,
        "start_lon": 0.0,
        "end_lat": 18.4550,
        "end_lon": 77.4180
    }
    response = client.post("/api/route/calculate", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert "outside Jezero DEM bounds" in data["detail"]
