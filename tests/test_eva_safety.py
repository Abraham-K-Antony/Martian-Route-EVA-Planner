import pytest
from core.terrain_processor import DEMProcessor
from core.eva_safety import EVASafetyAnalyzer, PLSS_O2_CAPACITY_LITERS, PLSS_MAX_DURATION_HOURS

def test_mars_sun_position():
    """Verify Mars Sun position calculations for Jezero Crater."""
    sun_elev, sun_az = EVASafetyAnalyzer.get_mars_sun_position(lat_deg=18.4447, lon_deg=77.4508, local_solar_time_h=14.0)
    assert sun_elev > 0.0  # Sun is above horizon at 2 PM
    assert 0.0 <= sun_az <= 360.0

def test_eva_safety_telemetry():
    """Verify oxygen consumption rate, PLSS tank limits, LoS coverage, and PoNR."""
    dem = DEMProcessor()
    analyzer = EVASafetyAnalyzer(dem)
    
    # Sample path coordinates
    coords = [
        [18.4447, 77.4508],
        [18.4480, 77.4450],
        [18.4550, 77.4180]
    ]
    elevs = [-2570.0, -2550.0, -2520.0]
    slopes = [2.0, 5.0, 8.0]
    
    safety = analyzer.analyze_path_safety(coords, elevs, slopes, base_station_latlon=(18.4447, 77.4508))
    
    assert safety["o2_consumed_liters"] > 0.0
    assert safety["o2_consumed_kg"] > 0.0
    assert 0.0 <= safety["plss_used_pct"] <= 100.0
    assert safety["plss_capacity_liters"] == PLSS_O2_CAPACITY_LITERS
    assert safety["max_duration_h"] == PLSS_MAX_DURATION_HOURS
    assert "los_coverage_pct" in safety
    assert "point_of_no_return_index" in safety
    assert len(safety["aspect_angles"]) == len(coords)
    assert len(safety["sun_hazard_flags"]) == len(coords)

def test_multi_relay_los():
    """Verify multi-station comms relay mesh scanning."""
    dem = DEMProcessor()
    analyzer = EVASafetyAnalyzer(dem)
    
    elev = dem.get_elevation(18.4447, 77.4508)
    has_conn, relay_name = analyzer.check_multi_relay_los(18.4447, 77.4508, elev)
    assert has_conn is True
    assert "Rover" in relay_name or "Airfield" in relay_name or "Tower" in relay_name
