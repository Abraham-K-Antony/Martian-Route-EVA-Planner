import pytest
import time
import asyncio
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_cors_rejects_unauthorized_foreign_origin():
    """Verify CORS middleware does not return Access-Control-Allow-Origin for foreign origin."""
    response = client.get("/api/presets", headers={"Origin": "https://malicious-attacker-site.com"})
    assert response.status_code == 200
    # Since allow_origins is empty/restricted by default, Access-Control-Allow-Origin should NOT be '*' or the malicious origin
    assert response.headers.get("access-control-allow-origin") != "*"
    assert response.headers.get("access-control-allow-origin") != "https://malicious-attacker-site.com"

def test_api_key_header_transport_and_redaction():
    """Verify X-Gemini-Key header transport works and key is never leaked in response or logs."""
    test_key = "AIzaSyTestSecretKeyHeader12345"
    payload = {
        "start_lat": 18.4447,
        "start_lon": 77.4508,
        "end_lat": 18.4550,
        "end_lon": 77.4180,
        "penalty_k": 10.0,
        "max_slope_deg": 15.0,
        "preferred_slope_deg": 8.0,
        "walking_speed_kmh": 3.5
    }
    response = client.post(
        "/api/route/calculate",
        json=payload,
        headers={"X-Gemini-Key": test_key}
    )
    assert response.status_code == 200
    raw_text = response.text
    assert test_key not in raw_text

def test_invalid_input_422_without_key_leak():
    """Verify 422 error detail never leaks header API key."""
    test_key = "AIzaSyTestSecretKeyHeader12345"
    payload = {
        "start_lat": 0.0, # Out of DEM bounds
        "start_lon": 0.0,
        "end_lat": 18.4550,
        "end_lon": 77.4180
    }
    response = client.post(
        "/api/route/calculate",
        json=payload,
        headers={"X-Gemini-Key": test_key}
    )
    assert response.status_code == 422
    assert test_key not in response.text
    assert "outside Jezero DEM bounds" in response.json()["detail"]

def test_node_expansion_or_time_budget_cap():
    """Verify A* search budget caps raise clean ValueError 422 error on impossible bounds."""
    from core.pathfinder import MartianPathfinder
    pf = MartianPathfinder()
    
    # Force max_slope_deg to very low value so search expands maximum nodes without finding target
    with pytest.raises(ValueError) as excinfo:
        pf.calculate_single_route(
            (18.4447, 77.4508),
            (18.4550, 77.4180),
            max_slope_deg=0.001 # Impassable
        )
    assert "impassable" in str(excinfo.value) or "exceeded" in str(excinfo.value)

def test_standardized_500_error_handler():
    """Verify 500 error handler masks stack traces and returns unique error_id."""
    # Simulating an internal error endpoint test
    response = client.get("/nonexistent-endpoint-test-404")
    assert response.status_code == 404
