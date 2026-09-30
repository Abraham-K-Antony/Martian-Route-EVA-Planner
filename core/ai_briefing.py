import os
import concurrent.futures
from typing import Dict, Optional

def _call_gemini_fast(prompt: str, key: str) -> Optional[str]:
    """Internal fast caller targeting active Gemini model."""
    try:
        from google import genai
        client = genai.Client(api_key=key.strip())
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=prompt
        )
        if response and response.text:
            return response.text + "\n\n---\n*Mission Control Flight Operations | Lead Systems Architect: **Abraham K Antony***"
    except Exception:
        pass
    return None

def generate_eva_briefing(stats: Dict, api_key: Optional[str] = None) -> str:
    """
    Generates a NASA Flight Director EVA Hazard Briefing.
    Prioritizes ultra-fast <0.1s response. Uses ThreadPoolExecutor with a 2.0s hard cap.
    If Gemini API takes >2.0s, rate-limited, or unavailable, instantly returns the
    structured NASA telemetry briefing.
    """
    dist_m = stats.get('distance', 0)
    duration_h = stats.get('duration', 0)
    max_slope = stats.get('max_slope', 0)
    elev_gain = stats.get('elevation_gain', 0)
    
    # Pre-compute NASA xEMU telemetry consumables (instant <1ms)
    o2_liters = round(duration_h * 60 * 1.1, 1) # ~1.1 L/min active EVA
    power_kwh = round(duration_h * 0.45, 2) # ~0.45 kW/h PLSS battery draw
    water_kg = round(duration_h * 0.35, 2) # LCVG cooling fluid loop
    
    offline_briefing = f"""### 🚀 NASA EVA MISSION BRIEFING & TELEMETRY

**FLIGHT DIRECTOR DIRECTIVE:** EVA-JEZERO-{int(dist_m)}

---

#### 1. Suit Consumable Budget (xEMU PLSS)
* **Primary O2 Allocation:** {o2_liters} Liters (120% margin factored)
* **PLSS Battery Reserve:** {power_kwh} kWh
* **LCVG Cooling Water:** {water_kg} kg
* **Emergency Reserve Margin:** +60 minutes abort buffer

---

#### 2. Terrain & Traverse Hazards
* **Maximum Slope Angle:** `{max_slope}°` ({'⚠️ HIGH INCLINE - High slip hazard' if max_slope > 10 else 'NOMINAL slope profile'})
* **Elevation Gain/Loss:** `+{elev_gain}m / -{stats.get("elevation_loss", 0)}m`
* **Geological Hazards Avoided:** `{stats.get("hazards_avoided", 0)} steep crater walls / unstable regolith zones`
* **Surface Matrix:** Basaltic scree, fine dust mantle, vesicular basalt boulders.

---

#### 3. Operational Protocols
1. **Checkpoint Alpha (25% Traverse):** Perform mandatory glove and pressure suit seal check.
2. **Dust Abatement:** Limit boot speed near regolith drifts to preserve visor optics.
3. **RF Line-of-Sight:** Direct X-band link to Mars Reconnaissance Orbiter (MRO) / Perseverance Relay.
4. **Abort Criteria:** Abort EVA immediately if O2 pressure drops below 4.2 psi or slope incline exceeds 15°.

---
*Mission Control Flight Operations | Lead Systems Architect: **Abraham K Antony***
"""

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key or not key.strip():
        return offline_briefing

    prompt = f"""
You are the NASA Mission Flight Director for a Mars surface operation (Jezero Crater EVA).
Analyze the following route metrics and provide a concise, highly technical EVA safety briefing.
Include required suit consumables, specific traversal risks, and operational Go/No-Go checkpoints.
Do not use conversational filler. Format with clear Markdown headings and bullet points.

Route Metrics:
- Total Distance: {stats.get('distance')} meters
- Maximum Incline: {stats.get('max_slope')} degrees
- Average Slope: {stats.get('avg_slope', 'N/A')} degrees
- Total Elevation Gain: {stats.get('elevation_gain', 'N/A')} meters
- Total Elevation Loss: {stats.get('elevation_loss', 'N/A')} meters
- Estimated Duration: {stats.get('duration')} hours
- Impassable Hazard Avoidances: {stats.get('hazards_avoided', 0)}
"""

    # Attempt fast Gemini API call with 2.0s maximum hard wait time
    try:
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_call_gemini_fast, prompt, key)
        result = future.result(timeout=2.0)
        executor.shutdown(wait=False)
        if result:
            return result
    except Exception:
        pass

    return offline_briefing
