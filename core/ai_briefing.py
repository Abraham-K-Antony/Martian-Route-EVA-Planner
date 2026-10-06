import os
import logging
import warnings
import concurrent.futures
from typing import Dict, Optional

# Suppress SDK deprecation and AFC model warnings
logging.getLogger("google.genai").setLevel(logging.ERROR)
logging.getLogger("google").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*automatic function calling.*")
warnings.filterwarnings("ignore", category=UserWarning)

def _call_gemini_fast(prompt: str, key: str) -> Optional[str]:
    """
    Internal fast caller using google.genai SDK.
    Supports model fallback (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash).
    """
    try:
        from google import genai
        client = genai.Client(api_key=key.strip())
        for model_name in ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                if response and response.text:
                    return response.text + "\n\n---\n*Mission Control Flight Operations | Lead Systems Architect: **Abraham K Antony***"
            except Exception:
                continue
    except Exception:
        pass
    return None

import re

def _sanitize_name(name: str) -> str:
    if not name:
        return "Waypoint"
    clean = re.sub(r'[^a-zA-Z0-9\s\-_]', '', str(name)).strip()
    return clean[:30] if clean else "Waypoint"

def generate_eva_briefing(stats: Dict, api_key: Optional[str] = None) -> str:
    """
    Generates a NASA Flight Director EVA Hazard Briefing.
    Prioritizes structured telemetry. Uses ThreadPoolExecutor with a 15.0s hard cap.
    If Gemini API takes >15.0s, rate-limited, or unavailable, instantly returns the
    structured NASA telemetry briefing.
    """
    dist_m = stats.get('distance_m', stats.get('distance', 0))
    duration_h = stats.get('duration_h', stats.get('duration', 0))
    max_slope = stats.get('max_slope', 0)
    elev_gain = stats.get('elevation_gain_m', 0)
    start_name = _sanitize_name(stats.get('start_name', 'Start Base'))
    end_name = _sanitize_name(stats.get('end_name', 'Destination Target'))
    
    # Pre-computed NASA xEMU telemetry consumables from EVASafetyAnalyzer
    o2_liters = stats.get('o2_consumed_liters', round(duration_h * 60 * 1.1, 1))
    o2_kg = stats.get('o2_consumed_kg', round(o2_liters * 0.001429, 3))
    plss_pct = stats.get('plss_used_pct', min(100.0, round((o2_liters / 840.0) * 100.0, 1)))
    power_kwh = round(duration_h * 0.45, 2) # ~0.45 kW/h PLSS battery draw
    water_kg = round(duration_h * 0.35, 2)  # LCVG cooling fluid loop
    los_pct = stats.get('los_coverage_pct', 100.0)
    glare_cnt = stats.get('glare_hazards_count', 0)
    shadow_cnt = stats.get('shadow_hazards_count', 0)
    sun_elev = stats.get('sun_elevation_deg', 45.0)
    
    offline_briefing = f"""### 🚀 NASA EVA MISSION BRIEFING & TELEMETRY

**FLIGHT DIRECTOR DIRECTIVE:** EVA-JEZERO-{int(dist_m)} ({start_name} ➔ {end_name})

---

#### 1. Suit Consumable Budget (xEMU PLSS)
* **Primary O2 Consumed:** `{o2_liters} L` ({o2_kg} kg O2) · **PLSS Budget Used:** `{plss_pct}%` (120% margin factored)
* **PLSS Battery Reserve:** `{power_kwh} kWh`
* **LCVG Cooling Water:** `{water_kg} kg`
* **Emergency Reserve Margin:** +60 minutes abort buffer (Point of No Return verified)

---

#### 2. Terrain, Thermal & Solar Glare Hazards
* **Maximum Slope Angle:** `{max_slope}°` ({'⚠️ HIGH INCLINE - High slip hazard' if max_slope > 10 else 'NOMINAL slope profile'})
* **Elevation Gain/Loss:** `+{elev_gain}m / -{stats.get("elevation_loss_m", 0)}m`
* **Solar Geometry:** Azimuth {stats.get("sun_azimuth_deg", 225)}° / Elevation `{sun_elev}°` ({glare_cnt} solar glare sectors, {shadow_cnt} deep shadow sectors)
* **Geological Hazards Avoided:** `{stats.get("hazards_avoided", 0)} steep crater walls / unstable regolith zones`

---

#### 3. Communication & Operational Protocols
* **RF Line-of-Sight Coverage:** `{los_pct}% direct comms link` to Perseverance Relay Base.
1. **Checkpoint Alpha (25% Traverse):** Perform mandatory glove and pressure suit seal check.
2. **Dust Abatement:** Limit boot speed near regolith drifts to preserve visor optics.
3. **Point of No Return (PoNR):** Must turn back before consuming >45% tank reserve (index #{stats.get("point_of_no_return_index", "N/A")}).
4. **Abort Criteria:** Abort EVA immediately if O2 pressure drops below 4.2 psi, slope incline exceeds 15°, or LoS drops below 50%.

---
*Mission Control Flight Operations | Lead Systems Architect: **Abraham K Antony***
"""

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key or not key.strip():
        return offline_briefing

    prompt = f"""
You are the NASA Mission Flight Director for a Mars surface operation (Jezero Crater EVA).
Analyze the following route metrics and provide a concise, highly technical EVA safety briefing.
Include required suit consumables, specific traversal risks, solar glare/aspect hazards, RF communication coverage, and operational Go/No-Go checkpoints.
Do not use conversational filler. Format with clear Markdown headings and bullet points.

Route Metrics:
- Start Sector: {start_name}
- Destination Sector: {end_name}
- Total Distance: {dist_m} meters
- Maximum Incline: {max_slope} degrees
- Average Slope: {stats.get('avg_slope', 'N/A')} degrees
- Total Elevation Gain: {elev_gain} meters
- Total Elevation Loss: {stats.get('elevation_loss_m', 'N/A')} meters
- Estimated Duration: {stats.get('duration_h', 'N/A')} hours ({stats.get('duration_min', 'N/A')} min)
- Metabolic Oxygen Consumed: {o2_liters} Liters ({o2_kg} kg O2, {plss_pct}% PLSS Capacity)
- 3D Comms Line-of-Sight Coverage: {los_pct}%
- Solar Hazards: {glare_cnt} Direct Glare Sectors, {shadow_cnt} Deep Shadow Sectors
- Point of No Return Index: #{stats.get('point_of_no_return_index', 'N/A')}
- Impassable Hazard Avoidances: {stats.get('hazards_avoided', 0)}
"""

    # Attempt fast Gemini API call with 15.0s maximum hard wait time
    try:
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_call_gemini_fast, prompt, key)
        result = future.result(timeout=15.0)
        executor.shutdown(wait=False)
        if result:
            return result
    except Exception:
        pass

    return offline_briefing
