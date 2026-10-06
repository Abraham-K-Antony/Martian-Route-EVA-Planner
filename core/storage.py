import sqlite3
import json
import os
from typing import Dict, List, Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "waypoints.sqlite")

def get_db_connection():
    """Returns a SQLite connection configured with WAL mode, 10s timeout, and busy handler."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn

def init_db():
    """Ensure data directory exists, initialize SQLite schema, set PRAGMA user_version."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Schema Migration Versioning
        cursor.execute("PRAGMA user_version;")
        current_version = cursor.fetchone()[0]
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                start_lat REAL NOT NULL,
                start_lon REAL NOT NULL,
                end_lat REAL NOT NULL,
                end_lon REAL NOT NULL,
                distance_m REAL NOT NULL,
                max_slope REAL NOT NULL,
                duration_h REAL NOT NULL,
                geojson_data TEXT NOT NULL,
                ai_briefing TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS waypoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                category TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                elevation_m REAL,
                description TEXT
            )
        """)
        
        if current_version < 1:
            cursor.execute("PRAGMA user_version = 1;")
        
        # Populate default Jezero Crater mission points if empty
        cursor.execute("SELECT COUNT(*) FROM waypoints")
        if cursor.fetchone()[0] == 0:
            default_pts = [
                ("Perseverance Landing Site (Octavia E. Butler)", "Landing Site", 18.4447, 77.4508, -2570.0, "Mars 2020 touchdown point in Jezero Crater floor."),
                ("Neretva Vallis Delta Edge", "Scientific Interest", 18.4550, 77.4180, -2520.0, "Ancient river delta deposit rich in clay minerals."),
                ("Belva Crater Ejecta", "Sampling Target", 18.4280, 77.4650, -2590.0, "Impact crater exposing exposed bedrock strata."),
                ("Margin Unit (Carbonate Bedrock)", "Geological Target", 18.4620, 77.4010, -2490.0, "Carbonate and olivine-bearing outcrop along crater rim."),
                ("Bright Angel (Cheyava Falls Specimen)", "Astrobiology Target", 18.4710, 77.4120, -2480.0, "Cheyava Falls outcrop with potential organic signatures."),
                ("Western Crater Rim Overlook", "Geological Hazard", 18.4720, 77.3850, -2200.0, "Steep crater wall transition zone (~15-25 deg incline)."),
                ("Kodiak Mesa Promontory", "Stratigraphic Outcrop", 18.4150, 77.4320, -2540.0, "Isolated mesa remnant exhibiting delta top-set beds.")
            ]
            cursor.executemany("""
                INSERT INTO waypoints (label, category, lat, lon, elevation_m, description)
                VALUES (?, ?, ?, ?, ?, ?)
            """, default_pts)
        conn.commit()

def save_route(name: str, start: Tuple[float, float], end: Tuple[float, float], 
               stats: Dict, geojson: Dict, briefing: str) -> int:
    """Cache a calculated EVA route and briefing into SQLite with automatic pruning."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO routes (name, start_lat, start_lon, end_lat, end_lon, 
                                distance_m, max_slope, duration_h, geojson_data, ai_briefing)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            name, start[0], start[1], end[0], end[1],
            stats.get("distance", stats.get("distance_m", 0.0)),
            stats.get("max_slope", 0.0),
            stats.get("duration", stats.get("duration_h", 0.0)),
            json.dumps(geojson),
            briefing
        ))
        
        # Table Growth Pruning: keep at most 100 recent cached routes
        cursor.execute("""
            DELETE FROM routes 
            WHERE id NOT IN (SELECT id FROM routes ORDER BY created_at DESC LIMIT 100)
        """)
        conn.commit()
        return cursor.lastrowid

def get_cached_routes(limit: int = 10) -> List[Dict]:
    """Retrieve recent cached EVA routes."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, start_lat, start_lon, end_lat, end_lon, 
                   distance_m, max_slope, duration_h, geojson_data, ai_briefing, created_at
            FROM routes
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        routes = []
        for r in rows:
            routes.append({
                "id": r[0],
                "name": r[1],
                "start": (r[2], r[3]),
                "end": (r[4], r[5]),
                "distance": r[6],
                "max_slope": r[7],
                "duration": r[8],
                "geojson": json.loads(r[9]),
                "briefing": r[10],
                "created_at": r[11]
            })
        return routes

def get_preset_waypoints() -> List[Dict]:
    """Get predefined Jezero Crater waypoints."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, label, category, lat, lon, elevation_m, description FROM waypoints")
        rows = cursor.fetchall()
        return [
            {
                "id": r[0], "label": r[1], "category": r[2],
                "lat": r[3], "lon": r[4], "elevation": r[5], "description": r[6]
            }
            for r in rows
        ]
