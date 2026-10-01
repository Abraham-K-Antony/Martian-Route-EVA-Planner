import pytest
import math
import numpy as np
from core.terrain_processor import DEMProcessor, MARS_RADIUS_M
from core.pathfinder import MartianPathfinder

def test_mars_radius_resolution():
    """Verify DEM resolution calculation uses IAU Mars Radius (3,389,500 m)."""
    dem = DEMProcessor()
    assert dem.dy_m > 30.0 and dem.dy_m < 50.0
    assert dem.dx_m > 30.0 and dem.dx_m < 50.0
    assert abs(MARS_RADIUS_M - 3389500.0) < 1.0

def test_minetti_metabolic_cost():
    """Verify Minetti metabolic walking cost scales with slope and Mars gravity."""
    pf = MartianPathfinder()
    
    # Flat terrain cost
    flat_cost = pf.calculate_metabolic_cost_per_m(slope_deg=0.0, grade=0.0)
    assert flat_cost >= 150.0
    
    # Steep uphill cost
    uphill_cost = pf.calculate_metabolic_cost_per_m(slope_deg=12.0, grade=math.tan(math.radians(12.0)))
    assert uphill_cost > flat_cost

def test_slope_dependent_speed():
    """Verify walking speed decreases on steep slopes."""
    pf = MartianPathfinder()
    
    flat_speed = pf.calculate_slope_dependent_speed(grade=0.0, base_speed_kmh=3.5)
    uphill_speed = pf.calculate_slope_dependent_speed(grade=0.20, base_speed_kmh=3.5)
    
    assert flat_speed > uphill_speed
    assert uphill_speed >= 0.15  # Min speed floor

def test_multi_route_generation():
    """Verify calculate_all_routes returns 5 multi-route modes."""
    pf = MartianPathfinder()
    start_pt = (18.4447, 77.4508)
    end_pt = (18.4550, 77.4180)
    
    res = pf.calculate_all_routes(start_pt, end_pt, max_slope_deg=15.0, is_round_trip=False)
    
    assert "recommended" in res
    assert "routes" in res
    routes = res["routes"]
    
    for mode in ["lowest_energy", "fastest", "safest", "comms_safe", "legacy"]:
        assert mode in routes
        assert "stats" in routes[mode]
        stats = routes[mode]["stats"]
        assert stats["distance_m"] > 0.0
        assert stats["duration_sec"] > 0.0
        assert stats["max_slope"] <= 15.0
