/**
 * Martian Route & EVA Planner - API Client Module
 * Manages HTTP communication with FastAPI backend, AbortController cancellation,
 * and user-friendly error formatting.
 */

let activeCalculateController = null;

/**
 * Fetches landmark presets from /api/presets
 */
export async function getPresets() {
  const response = await fetch('/api/presets', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Failed to load mission presets (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data.presets || [];
}

/**
 * Fetches recent cached routes from /api/routes/cached
 */
export async function getCachedRoutes() {
  const response = await fetch('/api/routes/cached', {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Failed to load cached routes (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data.routes || [];
}

/**
 * Computes optimal Martian EVA route with AbortController cancellation
 */
export async function calculateRoute(payload) {
  // Cancel any prior in-flight calculation request
  if (activeCalculateController) {
    activeCalculateController.abort("New calculation initiated");
  }

  activeCalculateController = new AbortController();
  const signal = activeCalculateController.signal;

  try {
    const response = await fetch('/api/route/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = parseApiError(response.status, data);
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error("Calculation cancelled by a newer request.");
    }
    throw err;
  } finally {
    activeCalculateController = null;
  }
}

/**
 * Converts HTTP and backend exceptions into actionable mission feedback
 */
function parseApiError(statusCode, data) {
  const detail = data && data.detail ? data.detail : '';

  if (statusCode === 422) {
    if (detail.includes("DEM bounds") || detail.includes("outside")) {
      return `Selected coordinate is outside the Jezero Crater DEM grid. Please select a point within [18.25°–18.60°N, 77.25°–77.65°E].`;
    }
    if (detail.includes("impassable") || detail.includes("exceeds")) {
      return detail; // Contains exact slope degrees and impassable point explanation
    }
    return `Mission constraint validation error: ${detail}`;
  }

  if (statusCode === 429) {
    return "Mission planner rate limit reached. Please wait a moment before recalculating.";
  }

  if (statusCode >= 500) {
    if (detail.includes("No passable route")) {
      return "No passable path found between these waypoints within the current slope ceiling. Try increasing Max Slope or choosing intermediate waypoints.";
    }
    return `Server pathfinding error: ${detail || "Internal telemetry calculation error"}.`;
  }

  return detail || `Mission server returned error status ${statusCode}.`;
}
