import pytest
from fastapi.testclient import TestClient
from main import app
from core.pathfinder import MartianPathfinder
from core.terrain_processor import DEMProcessor
from core.ai_briefing import _sanitize_name

client = TestClient(app)

def test_minetti_grade_clamping():
    """Verify Minetti metabolic cost clamps grade to [-0.45, 0.45] validity bounds."""
    pf = MartianPathfinder()
    # Extreme positive incline grade (100% / 45 deg)
    cost_clamped_high = pf.calculate_metabolic_cost_per_m(slope_deg=45.0, grade=1.0)
    cost_at_max = pf.calculate_metabolic_cost_per_m(slope_deg=24.2, grade=0.45)
    assert abs(cost_clamped_high - cost_at_max) < 1e-3

    # Extreme negative decline grade (-100% / -45 deg)
    cost_clamped_low = pf.calculate_metabolic_cost_per_m(slope_deg=-45.0, grade=-1.0)
    cost_at_min = pf.calculate_metabolic_cost_per_m(slope_deg=-24.2, grade=-0.45)
    assert abs(cost_clamped_low - cost_at_min) < 1e-3

def test_synthetic_dem_flag():
    """Verify DEMProcessor has is_synthetic flag."""
    dem = DEMProcessor()
    assert hasattr(dem, "is_synthetic")

def test_prompt_injection_sanitization():
    """Verify free-text names are sanitized to prevent prompt injection."""
    malicious = "Base Alpha'; DROP TABLE routes; -- <script>alert(1)</script>"
    clean = _sanitize_name(malicious)
    assert ";" not in clean
    assert "<script>" not in clean
    assert "Base Alpha" in clean
    assert len(clean) <= 30

def test_dedicated_briefing_endpoint():
    """Verify POST /api/briefing endpoint returns structured telemetry briefing."""
    payload = {
        "distance_m": 1250.0,
        "duration_h": 0.5,
        "max_slope": 12.0,
        "elevation_gain_m": 15.0,
        "elevation_loss_m": 5.0,
        "o2_consumed_liters": 45.0,
        "o2_consumed_kg": 0.064,
        "plss_used_pct": 5.4,
        "los_coverage_pct": 100.0,
        "start_name": "Perseverance Landing Site",
        "end_name": "Neretva Vallis Delta"
    }
    response = client.post("/api/briefing", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "briefing" in data
    assert "NASA EVA MISSION BRIEFING" in data["briefing"]
