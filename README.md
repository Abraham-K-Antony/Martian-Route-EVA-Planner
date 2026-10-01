# 🔴 Interplanetary Survival Guide: Martian Route & EVA Planner

🌐 **Live Web Application:** [https://martian-route-eva-planner.onrender.com/](https://martian-route-eva-planner.onrender.com/)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-brightgreen?style=for-the-badge&logo=render)](https://martian-route-eva-planner.onrender.com/)
[![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-green.svg)](https://fastapi.tiangolo.com/)
[![Gemini API](https://img.shields.io/badge/Google%20Gemini-SDK-orange.svg)](https://ai.google.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen.svg)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-Copyright%20(c)%202026%20Abraham%20K%20Antony-red.svg)](#-author--copyright)

A physically grounded geospatial graph engine and AI flight director for planning Extravehicular Activity (EVA) astronaut surface missions in **Jezero Crater, Mars** ($18.4447^\circ\text{N}, 77.4508^\circ\text{E}$). The system computes metabolic energy cost, travel duration, 3D communication line-of-sight (LoS), solar glare/shadow hazards, and suit PLSS consumable limits over Mars Digital Elevation Models (DEMs).

---

## 👨‍🚀 Author & Copyright

**Lead Systems Architect & Developer:** **Abraham K Antony**  
**Repository:** [github.com/Abraham-K-Antony/Martian-Route-EVA-Planner](https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner)  
**Copyright:** **Copyright © 2026 Abraham K Antony. All Rights Reserved.**

---

## 🌌 Key Capabilities & Architecture

- **⚡ Minetti Physical Metabolic Cost Model ($J/\text{m}$):** Replaced non-physical formulas with human metabolic walking expenditure scaled for **Mars gravity** ($g_{Mars} = 3.71 \text{ m/s}^2$) and **xEMU space suit movement restriction** ($1.35\times$).
- **⏱️ Slope-Dependent Walking Speed:** Tobler/Minetti slope deceleration equation $v(i) = v_{flat} \cdot e^{-3.5|i+0.05|}$ with a $0.15\text{ m/s}$ minimum speed floor on steep inclines.
- **🌍 IAU Mars Radius Cell Resolution:** DEM cell spacing computed using IAU Mars mean radius ($R_{Mars} = 3,389,500 \text{ m}$) for exact meter-scale resolution ($38.4\text{m/px}$).
- **📡 3D Multi-Station RF Comms Mesh:** Scans Line-of-Sight (LoS) ray casting across multiple active base stations (*Perseverance Rover*, *Ingenuity Airfield*, *Jezero Rim Tower*) and flags radio dead zones.
- **☀️ Solar Geometry & Aspect Angle:** Computes 2D downhill aspect angle $\phi_{aspect} \in [0^\circ, 360^\circ]$ and local Mars solar time (Azimuth $225^\circ$, Elevation $45^\circ$) to flag direct sun-facing glare and deep shadow freezing hazards.
- **🎛️ 5 Multi-Route Strategies:**
  1. ⚡ **`lowest_energy`**: Minimizes total metabolic Joules ($J$) & kilocalories ($\text{kcal}$).
  2. ⏱️ **`fastest`**: Minimizes total traversal duration (hours/minutes).
  3. 🛡️ **`safest`**: Applies exponential penalty to slopes above $8^\circ$.
  4. 📡 **`comms_safe`**: Prioritizes open ridges with 3D Line-of-Sight RF coverage to avoid dead zones.
  5. 📜 **`legacy`**: Comparison path using the original penalty formula.
- **🔄 Round-Trip & Point of No Return (PoNR):** Out-and-back EVA calculation with mandatory $50\%$ return consumable reserve buffer and Point of No Return waypoint index tracking.
- **🤖 NASA Flight Director Gemini AI Briefing:** Ultra-fast ($<2.0\text{s}$ timeout) AI hazard briefing with automatic fallback to structured offline telemetry.
- **🔒 Private Client API Key Isolation:** Gemini API keys are saved strictly in the browser's private `localStorage` (`mars_user_gemini_api_key`) and never logged or stored on the server.

---

## 📐 Mathematical Models & Equations

### 1. Minetti Metabolic Energy Expenditure ($J/\text{m}$)
$$C(i) = M_{total} \times \max\left(1.2, 280.5 i^5 - 58.7 i^4 - 76.8 i^3 + 26.8 i^2 + 19.6 i + 2.5\right) \times \left(\frac{g_{Mars}}{g_{Earth}}\right) \times \text{suit\_factor}$$
where $M_{total} = 220\text{ kg}$ (80 kg astronaut + 140 kg xEMU suit), $g_{Mars}/g_{Earth} = 0.378$, and $\text{suit\_factor} = 1.35$.

### 2. Slope-Dependent Walking Speed ($m/s$)
$$v(i) = v_{flat} \cdot e^{-3.5 |i + 0.05|}$$
where $i = \tan(\text{slope})$ and $v_{flat} = \text{base speed in m/s}$.

### 3. IAU Mars Cell Size Calculation ($m$)
$$dy = \Delta\text{lat} \cdot \frac{\pi}{180} \cdot 3389500, \quad dx = \Delta\text{lon} \cdot \frac{\pi}{180} \cdot 3389500 \cdot \cos(\text{lat}_{center})$$

### 4. Terrain Aspect Angle ($\phi_{aspect}$)
$$\phi_{aspect} = \arctan2\left(-\frac{\partial z}{\partial x}, -\frac{\partial z}{\partial y}\right) \pmod{360^\circ}$$

---

## 📂 Directory Structure

```text
Martian-Route-EVA-Planner/
├── core/
│   ├── eva_safety.py         # Metabolic O2, PLSS limits, solar aspect, 3D LoS mesh & PoNR
│   ├── pathfinder.py         # 5-mode A* pathfinding engine over Mars DEM
│   ├── terrain_processor.py  # Rasterio GeoTIFF DEM parser & IAU Mars cell resolution
│   ├── ai_briefing.py        # Gemini AI flight director prompt & fast 2.0s fallback caller
│   └── storage.py            # SQLite database store & Jezero crater mission presets
│
├── data/
│   ├── jezero_dem_downsampled.tif  # High-resolution Jezero Crater GeoTIFF DEM
│   └── waypoints.sqlite            # SQLite route history & waypoint database
│
├── static/
│   ├── js/app.js             # Client-side map, chart hover sync, and REST API controller
│   └── index.html            # NASA Mission Control dashboard with glassmorphism UI
│
├── tests/
│   ├── test_pathfinder.py    # Unit tests for A* pathfinding & Minetti cost equations
│   ├── test_eva_safety.py    # Unit tests for EVASafetyAnalyzer & LoS mesh
│   └── test_api.py           # Integration tests for FastAPI endpoints & HTTP 422 errors
│
├── main.py                   # FastAPI application server entry point
├── render.yaml               # Render cloud web service deployment manifest
├── Dockerfile                # Docker container build script
├── requirements.txt          # Python dependencies manifest
└── README.md                 # System documentation & technical guide
```

---

## ⚙️ Installation & Local Setup

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner.git
cd Martian-Route-EVA-Planner

# Create & activate Python 3.11 virtual environment
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1   # Windows PowerShell
# source venv/bin/activate    # Linux / macOS
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run FastAPI Application Server
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Open your browser at: **`http://localhost:8000`**

### 4. Run Automated Test Suite
```bash
python -m pytest -v tests/
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `GET /` | `GET` | Serves the main NASA Mission Control Web Interface. |
| `GET /api/presets` | `GET` | Returns 7 Jezero Crater Mission Presets (Landing Site, Delta, Rim, Bedrock). |
| `GET /api/routes/cached` | `GET` | Returns recent cached EVA routes from SQLite database. |
| `POST /api/route/calculate` | `POST` | Computes 5 multi-route options & generates Gemini AI Safety Briefing. |
| `GET /api/watermark` | `GET` | Developer Verification Endpoint confirming authentic authorship signature. |

### Sample Route Request (`POST /api/route/calculate`)
```json
{
  "start_lat": 18.4447,
  "start_lon": 77.4508,
  "end_lat": 18.4550,
  "end_lon": 77.4180,
  "penalty_k": 10.0,
  "max_slope_deg": 15.0,
  "preferred_slope_deg": 8.0,
  "walking_speed_kmh": 3.5,
  "is_round_trip": true,
  "start_name": "Perseverance Landing Site",
  "end_name": "Neretva Delta Edge"
}
```

---

## 📜 License & Citation

**Copyright © 2026 Abraham K Antony. All Rights Reserved.**  
Developed for interplanetary surface exploration, autonomous rover navigation, and astronaut Extravehicular Activity (EVA) safety.
