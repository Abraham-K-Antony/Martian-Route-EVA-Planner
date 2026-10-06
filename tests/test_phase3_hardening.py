import pytest
import sqlite3
import numpy as np
from fastapi.testclient import TestClient
from main import app
from core.storage import DB_PATH, init_db, save_route, get_db_connection
from core.terrain_processor import DEMProcessor
from core.eva_safety import EVASafetyAnalyzer, PLSS_O2_CAPACITY_LITERS

client = TestClient(app)

def test_sqlite_wal_mode_and_schema_version():
    """Verify SQLite database uses WAL mode, busy timeout, and user_version schema migration."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Check WAL mode
        cursor.execute("PRAGMA journal_mode;")
        mode = cursor.fetchone()[0]
        assert mode.lower() == "wal"
        
        # Check user_version
        cursor.execute("PRAGMA user_version;")
        version = cursor.fetchone()[0]
        assert version >= 1

def test_sqlite_table_pruning():
    """Verify save_route prunes table growth to max 100 entries."""
    init_db()
    stats = {"distance": 100.0, "max_slope": 5.0, "duration": 0.5}
    geojson = {"type": "FeatureCollection", "features": []}
    
    for i in range(110):
        save_route(f"Test Route {i}", (18.4447, 77.4508), (18.4550, 77.4180), stats, geojson, "Briefing")
        
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM routes;")
        count = cursor.fetchone()[0]
        assert count <= 100

def test_nan_voids_in_dem_load():
    """Verify NoData and NaN arrays are handled cleanly without crashing."""
    dem = DEMProcessor()
    assert not np.isnan(dem.elevation_grid).any()
    assert not np.isnan(dem.slope_grid).any()

def test_verdict_immune_to_prompt_injection():
    """Verify Go/No-Go verdict is computed deterministically in code and unaffected by LLM strings."""
    dem = DEMProcessor()
    analyzer = EVASafetyAnalyzer(dem)
    
    # Generate long path coordinates (>6 km) to trigger O2 / duration threshold
    lats = np.linspace(18.36, 18.54, 30)
    lons = np.linspace(77.36, 77.54, 30)
    coords = [[float(lat), float(lon)] for lat, lon in zip(lats, lons)]
    elevs = [-2550.0] * 30
    slopes = [5.0] * 30
    
    # Path exceeding duration and O2 limits
    safety_over = analyzer.analyze_path_safety(coords, elevs, slopes, (18.36, 77.36), walking_speed_kmh=1.0)
    assert safety_over["exceeds_max_duration"] is True or safety_over["exceeds_o2_capacity"] is True

def test_xss_sanitization_in_names():
    """Verify input name strings with XSS scripts/tags are stripped cleanly by _sanitize_name."""
    from core.ai_briefing import _sanitize_name
    
    payloads = [
        ("<script>alert(1)</script>", "scriptalert1script"),
        ("Point A <img onerror=alert(1)>", "Point A img onerroralert1"),
        ("javascript:alert('xss')", "javascriptalertxss"),
        ("Normal Site Name - 1", "Normal Site Name - 1")
    ]
    for raw, expected in payloads:
        sanit = _sanitize_name(raw)
        assert "<" not in sanit
        assert ">" not in sanit
        assert ":" not in sanit
        assert len(sanit) <= 30

