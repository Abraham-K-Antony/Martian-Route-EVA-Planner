# 🔴 Interplanetary Survival Guide: Martian Route & EVA Planner

🌐 **Live Website:** [https://martian-route-eva-planner.onrender.com/](https://martian-route-eva-planner.onrender.com/)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-brightgreen?style=for-the-badge&logo=render)](https://martian-route-eva-planner.onrender.com/)
[![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.141-green.svg)](https://fastapi.tiangolo.com/)
[![Gemini API](https://img.shields.io/badge/Google%20Gemini-3.8%20Flash-orange.svg)](https://ai.google.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen.svg)](https://leafletjs.com/)


A hybrid geospatial-graph-AI application for planning extravehicular activities (EVA) on Mars. Using Digital Elevation Models (DEMs) of **Jezero Crater**, the system computes lowest-cost traversal routes for astronauts using an $A^*$ graph search algorithm and generates NASA Flight Director safety briefings via the Google Gemini API.

---

## 🌌 Key Features

- **🗺️ Interactive Martian Map (Leaflet.js):** Centered at Jezero Crater ($18.4447^\circ\text{N}, 77.4508^\circ\text{E}$). Supports interactive **Click-to-Point** start and destination pin placement.
- **⛰️ Terrain Slope Analysis (`rasterio` + `numpy`):** Converts 2D DEM elevation arrays into precise spatial slope grids ($\theta^\circ$).
- **🚀 A* Graph Pathfinding Engine (`networkx`):** 8-neighbor grid graph algorithm calculating traversal costs using the formula:
  $$C = \Delta d + (k \cdot e^{\theta})$$
  *Slopes $>15^\circ$ (configurable) are treated as impassable hazards and automatically routed around.*
- **🤖 NASA Mission Director AI Briefing (Google Gemini API):** Dynamic generation of xEMU suit consumable budgets ($O_2$ liters, PLSS battery kWh, cooling water), hazard analyses, and operational Go/No-Go checkpoints.
- **📊 Real-time Profile Visualizations (Chart.js):** Interactive elevation and slope incline profile charts along the traversal route.
- **📜 Route & Waypoint Storage (SQLite):** Caching computed GeoJSON paths, telemetry metrics, and AI briefings in `data/waypoints.sqlite`.

---

## 🛠️ System Architecture

| Layer | Technology Stack | Function |
| --- | --- | --- |
| **Frontend** | HTML5 + TailwindCSS + Leaflet.js + Chart.js | Single-page NASA Mission Control interface with interactive satellite map and telemetry charts. |
| **Backend API** | FastAPI + Uvicorn | RESTful API serving path calculation, DEM processing, and AI briefing generation. |
| **Terrain Ingestion** | `rasterio` + `numpy` | Ingests Jezero Crater DEM GeoTIFF, calculates 2D surface slope arrays. |
| **Pathfinding Engine** | `networkx` / Priority Queue A* | Graph generation and cost-optimizing route calculation. |
| **AI Advisory** | Google Gemini API (`google-genai` SDK) | Synthesizes route metrics into a NASA Mission Flight Director Briefing. |
| **Storage** | SQLite + GeoJSON | Caches generated paths, waypoints, and briefing documents. |

---

## 📂 Directory Structure

```text
d:/Nasa Space Apps/
│
├── data/
│   ├── jezero_dem_downsampled.tif   # Mars Digital Elevation Model GeoTIFF
│   └── waypoints.sqlite             # SQLite cache database for routes & presets
│
├── core/
│   ├── terrain_processor.py         # DEM raster ingestion & slope grid computation
│   ├── pathfinder.py                # Graph construction & A* pathfinding engine
│   ├── ai_briefing.py               # Gemini API integration & NASA Flight Director prompt
│   └── storage.py                   # SQLite storage & route history interface
│
├── static/
│   ├── css/
│   │   └── style.css                # Custom glassmorphism tactical CSS
│   ├── js/
│   │   └── app.js                   # Client-side map, chart, and REST API logic
│   └── index.html                   # Main single-page web dashboard
│
├── main.py                          # FastAPI backend application entry point
├── app.py                           # Legacy Streamlit entry point
├── requirements.txt                 # Dependencies manifest
├── .env                             # Environment configuration (GEMINI_API_KEY)
└── README.md                        # Project documentation
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- **Python 3.11+** installed on your system.
- **Google Gemini API Key** (Get one at [Google AI Studio](https://aistudio.google.com/)).

### 2. Environment Setup

Clone or open the project directory, then create a virtual environment:

```bash
# Create virtual environment
py -3.11 -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure API Key

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

---

## 🚀 Running the Application

Start the **FastAPI + Uvicorn** server:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser and navigate to:
👉 **`http://localhost:8000`**

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `GET /` | `GET` | Serves the main NASA Mission Control web UI. |
| `GET /api/presets` | `GET` | Returns predefined Jezero Crater waypoints (Landing site, Delta, Rim). |
| `GET /api/routes/cached` | `GET` | Returns recent cached EVA routes from SQLite database. |
| `POST /api/route/calculate` | `POST` | Calculates optimal A* route and generates Gemini AI briefing. |

### Example Request (`POST /api/route/calculate`)

```json
{
  "start_lat": 18.4447,
  "start_lon": 77.4508,
  "end_lat": 18.4550,
  "end_lon": 77.4180,
  "penalty_k": 10.0,
  "max_slope_deg": 15.0,
  "walking_speed_kmh": 3.5
}
```

---

## 📐 Cost Function & Pathfinding Logic

The traversal cost $C$ between adjacent grid nodes $u$ and $v$ is computed as:

$$C = \Delta d + (k \cdot e^{\theta})$$

where:
- $\Delta d$ is the physical step distance between grid cell centers in meters ($1.0 \times \text{cell\_size}$ for cardinal steps, $\sqrt{2} \times \text{cell\_size}$ for diagonal steps).
- $k$ is the slope penalty multiplier (user configurable via slider).
- $\theta$ is the surface slope angle in degrees.
- If $\theta > \text{max\_slope}$ ($15^\circ$ default), the cost is set to $\infty$ (impassable cliff/wall).

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
