import os
import streamlit as st
import folium
from streamlit_folium import folium_static
import numpy as np
import dotenv

# Load environment variables
dotenv.load_dotenv()

from core.pathfinder import calculate_route
from core.ai_briefing import generate_eva_briefing
from core.storage import save_route, get_cached_routes, get_preset_waypoints

st.set_page_config(
    layout="wide", 
    page_title="Interplanetary Survival Guide: Mars EVA Planner",
    page_icon="🔴"
)

# Custom CSS styling for NASA tactical theme
st.markdown("""
<style>
    .main {
        background-color: #0b0d17;
        color: #e0e6ed;
    }
    .stMetric {
        background-color: #15192b;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #2d3748;
    }
    .briefing-box {
        background-color: #1a202c;
        border-left: 4px solid #e53e3e;
        padding: 15px;
        border-radius: 6px;
    }
</style>
""", unsafe_allow_html=True)

st.title("🔴 Interplanetary Survival Guide: Martian Route & EVA Planner")
st.caption("Jezero Crater Tactical Surface Navigation & Autonomous Hazard Mitigation Engine")

# Sidebar Configuration
with st.sidebar:
    st.header("🛰️ Mission Telemetry & Config")
    
    # Gemini API Key configuration
    api_key_input = st.text_input(
        "Google Gemini API Key", 
        value=os.environ.get("GEMINI_API_KEY", ""),
        type="password",
        help="Used to generate NASA Flight Director AI briefing"
    )
    if api_key_input:
        os.environ["GEMINI_API_KEY"] = api_key_input

    st.subheader("⚙️ Pathfinding Parameters")
    penalty_k = st.slider("Slope Penalty Constant (k)", min_value=1.0, max_value=30.0, value=10.0, step=1.0,
                          help="Higher k heavily penalizes steep inclines to force route around crater walls.")
    max_slope_deg = st.slider("Max Allowable Incline (°)", min_value=5.0, max_value=25.0, value=15.0, step=1.0,
                              help="Slopes exceeding this threshold are marked impassable (infinite cost).")
    walking_speed = st.number_input("Astronaut EVA Speed (km/h)", value=3.5, min_value=1.0, max_value=10.0, step=0.5)

    st.markdown("---")
    st.subheader("📍 Waypoint Presets")
    presets = get_preset_waypoints()
    preset_names = [p["label"] for p in presets]
    
    selected_start_preset = st.selectbox("Start Location", options=preset_names, index=0)
    selected_end_preset = st.selectbox("Destination", options=preset_names, index=1)
    
    start_pt = next(p for p in presets if p["label"] == selected_start_preset)
    end_pt = next(p for p in presets if p["label"] == selected_end_preset)

    st.markdown("---")
    st.subheader("📜 Saved EVA Routes")
    cached = get_cached_routes(limit=5)
    if cached:
        for r in cached:
            if st.button(f"Load: {r['name']} ({r['distance']}m)", key=f"cache_{r['id']}"):
                st.session_state['route_data'] = {
                    'coordinates': r['geojson']['properties']['coordinates'],
                    'elevations': r['geojson']['properties']['elevations'],
                    'slopes': r['geojson']['properties']['slopes'],
                    'geojson': r['geojson']
                }
                st.session_state['path_stats'] = {
                    "distance": r["distance"],
                    "max_slope": r["max_slope"],
                    "duration": r["duration"],
                    "avg_slope": round(float(np.mean(r['geojson']['properties']['slopes'])), 1),
                    "elevation_gain": 0.0,
                    "elevation_loss": 0.0,
                    "hazards_avoided": 0
                }
                st.session_state['briefing'] = r['briefing']

# Main Interface Layout
col1, col2 = st.columns([2.5, 1.2])

with col1:
    st.subheader("🗺️ Jezero Crater Tactical Surface Map")
    
    # Coordinates input controls
    c_lat1, c_lon1, c_lat2, c_lon2 = st.columns(4)
    with c_lat1:
        start_lat = st.number_input("Start Lat", value=float(start_pt["lat"]), format="%.4f")
    with c_lon1:
        start_lon = st.number_input("Start Lon", value=float(start_pt["lon"]), format="%.4f")
    with c_lat2:
        end_lat = st.number_input("End Lat", value=float(end_pt["lat"]), format="%.4f")
    with c_lon2:
        end_lon = st.number_input("End Lon", value=float(end_pt["lon"]), format="%.4f")

    if st.button("🚀 Compute Optimal EVA Route", type="primary", use_container_width=True):
        with st.spinner("Processing Mars DEM raster & computing lowest-cost A* graph route..."):
            try:
                route_data, path_stats = calculate_route(
                    (start_lat, start_lon), 
                    (end_lat, end_lon),
                    penalty_k=penalty_k,
                    max_slope_deg=max_slope_deg,
                    walking_speed_kmh=walking_speed
                )
                
                # Generate AI Briefing
                briefing = generate_eva_briefing(path_stats, api_key=api_key_input)
                
                # Save to session state
                st.session_state['route_data'] = route_data
                st.session_state['path_stats'] = path_stats
                st.session_state['briefing'] = briefing
                
                # Cache route in SQLite
                route_name = f"{selected_start_preset} ➔ {selected_end_preset}"
                save_route(route_name, (start_lat, start_lon), (end_lat, end_lon), path_stats, route_data['geojson'], briefing)
                st.success("Optimal route computed & cached successfully!")
            except Exception as e:
                st.error(f"Route calculation error: {str(e)}")

    # Initialize Folium map centered on Jezero Crater
    map_center = [18.4447, 77.4508]
    m = folium.Map(
        location=map_center, 
        zoom_start=12, 
        tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr="Esri World Imagery / NASA Mars Data"
    )
    
    # Plot preset waypoints
    for wp in presets:
        folium.Marker(
            location=[wp["lat"], wp["lon"]],
            popup=f"<b>{wp['label']}</b><br>{wp['description']}",
            tooltip=wp['label'],
            icon=folium.Icon(color="blue" if wp["label"] == selected_start_preset else "orange", icon="info-sign")
        ).add_to(m)

    # Plot Start and End pins
    folium.Marker(
        location=[start_lat, start_lon],
        popup="EVA Start Point",
        tooltip="START",
        icon=folium.Icon(color="green", icon="play")
    ).add_to(m)

    folium.Marker(
        location=[end_lat, end_lon],
        popup="EVA Destination Point",
        tooltip="END",
        icon=folium.Icon(color="red", icon="flag")
    ).add_to(m)

    # Plot calculated route path if available
    if 'route_data' in st.session_state:
        coords = st.session_state['route_data']['coordinates']
        folium.PolyLine(
            coords, 
            color="#FF4500", 
            weight=4, 
            opacity=0.9,
            tooltip="Calculated A* EVA Route"
        ).add_to(m)

    folium_static(m, width=820, height=480)

    # Render Telemetry Metrics & Profile Charts
    if 'path_stats' in st.session_state:
        stats = st.session_state['path_stats']
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Total Distance", f"{stats['distance']} m")
        m2.metric("Max Incline", f"{stats['max_slope']}°")
        m3.metric("Est Duration", f"{stats['duration']} hrs")
        m4.metric("Hazards Avoided", f"{stats['hazards_avoided']}")

        st.subheader("📊 Route Elevation & Slope Profile")
        elevs = st.session_state['route_data']['elevations']
        slopes = st.session_state['route_data']['slopes']
        
        tab1, tab2 = st.tabs(["Elevation Profile (m)", "Slope Angle Profile (°)"])
        with tab1:
            st.line_chart(elevs)
        with tab2:
            st.line_chart(slopes)

with col2:
    st.subheader("📋 Mission Director Briefing")
    if 'briefing' in st.session_state:
        st.markdown(st.session_state['briefing'])
        
        st.markdown("---")
        # Download buttons for briefing
        st.download_button(
            label="📥 Download EVA Briefing (.md)",
            data=st.session_state['briefing'],
            file_name="mars_eva_briefing.md",
            mime="text/markdown"
        )
    else:
        st.info("👈 Select parameters and click 'Compute Optimal EVA Route' to generate path telemetry and NASA AI safety briefing.")
        
        st.markdown("""
        ### 🚀 System Capabilities:
        - **Mars DEM Raster Processing:** High-resolution topological slope analysis.
        - **A* Traversal Optimization:** Path cost function $C = \\Delta d + (k \\cdot e^{\\theta})$.
        - **Geological Hazard Shielding:** Automatic rerouting around crater walls $>15^\\circ$.
        - **Gemini AI Integration:** Dynamic NASA Flight Director suit consumable budget & contingency protocol.
        """)
