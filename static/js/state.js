/**
 * Martian Route & EVA Planner - State Management Module
 * Persists user constraints and mission configurations with try/catch guarded localStorage.
 */

const STORAGE_KEYS = {
  CONSTRAINTS: 'martian_eva_constraints',
  API_KEY: 'mars_user_gemini_api_key',
  LAST_ROUTE: 'martian_last_route_id',
  SELECTED_PRESET: 'martian_selected_start_preset',
  MISSION_POINTS: 'martian_mission_points',
  ACTIVE_STEP: 'martian_active_step'
};

const DEFAULT_CONSTRAINTS = {
  maxSlopeDeg: 15.0,
  preferredSlopeDeg: 8.0,
  penaltyK: 10.0,
  walkingSpeedKmh: 3.5,
  isRoundTrip: false,
  evaDurationLimitH: 8.0,
  routeMode: 'lowest_energy'
};

/**
 * Loads saved constraints from localStorage with safe fallback
 */
export function getSavedConstraints() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONSTRAINTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONSTRAINTS, ...parsed };
    }
  } catch (err) {
    console.warn("Error reading constraints from localStorage:", err);
  }
  return { ...DEFAULT_CONSTRAINTS };
}

/**
 * Saves user constraints into localStorage
 */
export function saveConstraints(constraints) {
  try {
    const current = getSavedConstraints();
    const updated = { ...current, ...constraints };
    localStorage.setItem(STORAGE_KEYS.CONSTRAINTS, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("Error saving constraints to localStorage:", err);
    return constraints;
  }
}

/**
 * Stores selected start and end waypoint points
 */
export function saveMissionPoints(points) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.MISSION_POINTS, JSON.stringify(points));
  } catch (err) {
    console.warn("Error saving mission points:", err);
  }
}

/**
 * Retrieves saved mission waypoint points
 */
export function getSavedMissionPoints() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.MISSION_POINTS);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Stores current active planner step (1, 2, or 3)
 */
export function saveActiveStep(step) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.ACTIVE_STEP, String(step));
  } catch (err) {
    console.warn("Error saving active step:", err);
  }
}

/**
 * Retrieves saved active step
 */
export function getSavedActiveStep() {
  try {
    const step = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_STEP);
    return step ? parseInt(step, 10) : 1;
  } catch (err) {
    return 1;
  }
}

/**
 * Stores a selected start preset for pre-populating the Planner
 */
export function setSelectedStartPreset(preset) {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_PRESET, JSON.stringify(preset));
  } catch (err) {
    console.warn("Error saving selected preset:", err);
  }
}

/**
 * Retrieves and consumes any queued preset for the Planner
 */
export function popSelectedStartPreset() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SELECTED_PRESET);
    if (raw) {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PRESET);
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Error reading selected preset:", err);
  }
  return null;
}

/**
 * Client-Side Secure API Key Management
 */
export function getStoredApiKey() {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setStoredApiKey(key) {
  try {
    if (key) {
      sessionStorage.setItem(STORAGE_KEYS.API_KEY, key.trim());
    } else {
      sessionStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  } catch (e) {
    console.warn("Error updating API key in sessionStorage:", e);
  }
}

