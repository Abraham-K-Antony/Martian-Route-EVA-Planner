/**
 * Martian Route & EVA Planner - 3-Step Guided Workflow Engine
 * Manages Step 1 (Choose Points), Step 2 (Constraints), Step 3 (Results & Telemetry),
 * route calculation execution, multi-route comparison tabs, and route caching.
 */

import { getPresets, getCachedRoutes, calculateRoute } from './api.js';
import { getSavedConstraints, saveConstraints, popSelectedStartPreset, getStoredApiKey, setStoredApiKey } from './state.js';
import { showToast } from './toast.js';
import { setStartMarker, setEndMarker, getCoordinates, renderCalculatedRoute, activateMapPickMode, toggleLayer, resizeMap } from './map.js';
import { updateElevationChartData } from './chart.js';
import { parseAndSanitizeMarkdown } from './sanitizer.js';

let activeStep = 1;
let currentMultiRoutes = null;
let currentActiveMode = 'lowest_energy';
let currentStats = null;
let currentBriefing = '';
let currentRouteData = null;
let cachedPresetsList = [];

export async function initPlannerWorkflow() {
  setupStepperNavigation();
  setupConstraintInputs();
  setupExportButtons();
  setupLayerToggles();
  setupApiKeyModal();
  setupMobileBottomSheet();

  // Load presets & initialize start/end markers
  await loadAndBindPresets();

  // Load cached routes from SQLite
  await loadRecentRoutesList();

  // Check if a preset was queued from the Mission Sites page ("Plan from here")
  const queuedPreset = popSelectedStartPreset();
  if (queuedPreset) {
    applyQueuedStartPreset(queuedPreset);
  }
}

/**
 * 3-Step Navigation Tabs
 */
function setupStepperNavigation() {
  const stepButtons = document.querySelectorAll('[data-step-btn]');
  stepButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetStep = parseInt(btn.getAttribute('data-step-btn'), 10);
      goToStep(targetStep);
    });
  });

  const nextToStep2Btn = document.getElementById('nextToStep2Btn');
  if (nextToStep2Btn) nextToStep2Btn.addEventListener('click', () => goToStep(2));

  const backToStep1Btn = document.getElementById('backToStep1Btn');
  if (backToStep1Btn) backToStep1Btn.addEventListener('click', () => goToStep(1));

  const backToStep2Btn = document.getElementById('backToStep2Btn');
  if (backToStep2Btn) backToStep2Btn.addEventListener('click', () => goToStep(2));

  const calculateRouteBtn = document.getElementById('calculateRouteBtn');
  if (calculateRouteBtn) calculateRouteBtn.addEventListener('click', executeRouteCalculation);

  const mapPickBtn = document.getElementById('mapPickModeBtn');
  if (mapPickBtn) mapPickBtn.addEventListener('click', activateMapPickMode);
}

export function goToStep(stepNumber) {
  activeStep = stepNumber;

  // Toggle step panels
  document.querySelectorAll('.planner-step-panel').forEach(panel => {
    const pStep = parseInt(panel.getAttribute('data-step-panel'), 10);
    if (pStep === stepNumber) {
      panel.classList.remove('hidden');
      panel.classList.add('animate-fade-in');
    } else {
      panel.classList.add('hidden');
      panel.classList.remove('animate-fade-in');
    }
  });

  // Update Stepper Pill Badges
  document.querySelectorAll('[data-step-btn]').forEach(btn => {
    const bStep = parseInt(btn.getAttribute('data-step-btn'), 10);
    const circle = btn.querySelector('.step-circle');
    const label = btn.querySelector('.step-label');

    if (bStep === stepNumber) {
      btn.className = "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-all";
      if (circle) circle.className = "step-circle w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]";
      if (label) label.className = "step-label font-bold";
    } else if (bStep < stepNumber) {
      btn.className = "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all";
      if (circle) circle.className = "step-circle w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]";
      if (label) label.className = "step-label hidden sm:inline";
    } else {
      btn.className = "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all";
      if (circle) circle.className = "step-circle w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center text-[10px]";
      if (label) label.className = "step-label hidden sm:inline text-gray-400";
    }
  });

  // Ensure map redraws when switching into step 3 or mobile bottom sheet
  resizeMap();
}

/**
 * Loads landmark presets into dropdowns
 */
async function loadAndBindPresets() {
  try {
    cachedPresetsList = await getPresets();
  } catch (err) {
    console.warn("Using fallback presets:", err);
  }

  const startSelect = document.getElementById('startPresetSelect');
  const endSelect = document.getElementById('endPresetSelect');

  if (!startSelect || !endSelect || !cachedPresetsList.length) return;

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  cachedPresetsList.forEach(p => {
    const opt1 = new Option(`${p.label} (${p.elevation ? p.elevation + 'm' : ''})`, JSON.stringify(p));
    const opt2 = new Option(`${p.label} (${p.elevation ? p.elevation + 'm' : ''})`, JSON.stringify(p));
    startSelect.add(opt1);
    endSelect.add(opt2);
  });

  startSelect.selectedIndex = 0;
  endSelect.selectedIndex = 1;

  startSelect.addEventListener('change', onPresetDropdownChanged);
  endSelect.addEventListener('change', onPresetDropdownChanged);

  // Set initial map markers
  onPresetDropdownChanged();
}

function onPresetDropdownChanged() {
  try {
    const startSelect = document.getElementById('startPresetSelect');
    const endSelect = document.getElementById('endPresetSelect');

    const startP = JSON.parse(startSelect.value);
    const endP = JSON.parse(endSelect.value);

    // Update coordinate fields
    updateCoordinateInputs(startP.lat, startP.lon, endP.lat, endP.lon);

    // Update map markers
    setStartMarker(startP.lat, startP.lon, startP.label);
    setEndMarker(endP.lat, endP.lon, endP.label);
  } catch (e) {
    console.warn("Preset parse error:", e);
  }
}

function applyQueuedStartPreset(preset) {
  const startSelect = document.getElementById('startPresetSelect');
  if (startSelect) {
    for (let i = 0; i < startSelect.options.length; i++) {
      const optVal = JSON.parse(startSelect.options[i].value);
      if (optVal.label === preset.name || (Math.abs(optVal.lat - preset.lat) < 0.001)) {
        startSelect.selectedIndex = i;
        onPresetDropdownChanged();
        break;
      }
    }
  }
}

/**
 * Constraint Sliders & Inputs
 */
function setupConstraintInputs() {
  const saved = getSavedConstraints();

  const maxSlopeEl = document.getElementById('maxSlopeSlider');
  const maxSlopeVal = document.getElementById('maxSlopeValueDisplay');
  if (maxSlopeEl && maxSlopeVal) {
    maxSlopeEl.value = saved.maxSlopeDeg;
    maxSlopeVal.textContent = `${saved.maxSlopeDeg}°`;
    maxSlopeEl.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      maxSlopeVal.textContent = `${v.toFixed(1)}°`;
      saveConstraints({ maxSlopeDeg: v });
    });
  }

  const prefSlopeEl = document.getElementById('prefSlopeSlider');
  const prefSlopeVal = document.getElementById('prefSlopeValueDisplay');
  if (prefSlopeEl && prefSlopeVal) {
    prefSlopeEl.value = saved.preferredSlopeDeg;
    prefSlopeVal.textContent = `${saved.preferredSlopeDeg}°`;
    prefSlopeEl.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      prefSlopeVal.textContent = `${v.toFixed(1)}°`;
      saveConstraints({ preferredSlopeDeg: v });
    });
  }

  const walkingSpeedEl = document.getElementById('walkingSpeedInput');
  if (walkingSpeedEl) {
    walkingSpeedEl.value = saved.walkingSpeedKmh;
    walkingSpeedEl.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      saveConstraints({ walkingSpeedKmh: v });
    });
  }

  const penaltyKEl = document.getElementById('penaltyKSlider');
  const penaltyKVal = document.getElementById('penaltyKValueDisplay');
  if (penaltyKEl && penaltyKVal) {
    penaltyKEl.value = saved.penaltyK;
    penaltyKVal.textContent = saved.penaltyK.toFixed(1);
    penaltyKEl.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      penaltyKVal.textContent = v.toFixed(1);
      saveConstraints({ penaltyK: v });
    });
  }

  const isRoundTripEl = document.getElementById('roundTripCheckbox');
  if (isRoundTripEl) {
    isRoundTripEl.checked = saved.isRoundTrip;
    isRoundTripEl.addEventListener('change', (e) => {
      saveConstraints({ isRoundTrip: e.target.checked });
    });
  }

  // Strategy Mode buttons
  document.querySelectorAll('[data-strategy-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-strategy-mode');
      setActiveStrategyMode(mode);
    });
  });
}

function setActiveStrategyMode(mode) {
  currentActiveMode = mode;
  saveConstraints({ routeMode: mode });

  document.querySelectorAll('[data-strategy-mode]').forEach(btn => {
    const bMode = btn.getAttribute('data-strategy-mode');
    if (bMode === mode) {
      btn.className = "p-2 rounded-xl border border-blue-500 bg-blue-50/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold text-center text-xs transition-all";
    } else {
      btn.className = "p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0B0F17] hover:bg-gray-50 text-gray-700 dark:text-gray-300 text-center text-xs transition-all";
    }
  });

  // If routes are already computed, switch visualization immediately
  if (currentMultiRoutes && currentMultiRoutes[mode]) {
    const routeObj = currentMultiRoutes[mode];
    if (routeObj.geojson) {
      renderRouteResults(routeObj, routeObj.stats, currentBriefing);
      showToast(`Switched to ${mode.replace('_', ' ').toUpperCase()} route option`, "info", "ROUTE OPTION");
    }
  }
}

/**
 * Primary Route Calculation Action
 */
export async function executeRouteCalculation() {
  const calcBtn = document.getElementById('calculateRouteBtn');
  const errorContainer = document.getElementById('plannerErrorBanner');
  if (errorContainer) errorContainer.classList.add('hidden');

  const coords = getCoordinates();
  const constraints = getSavedConstraints();
  const apiKey = getStoredApiKey();

  const startSelect = document.getElementById('startPresetSelect');
  const endSelect = document.getElementById('endPresetSelect');
  const startName = startSelect ? startSelect.options[startSelect.selectedIndex]?.text : "Custom Waypoint A";
  const endName = endSelect ? endSelect.options[endSelect.selectedIndex]?.text : "Custom Waypoint B";

  // UI Loading State
  calcBtn.disabled = true;
  calcBtn.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin text-sm"></i>
    <span>Computing Minetti A* Traversal...</span>
  `;

  try {
    const result = await calculateRoute({
      start_lat: coords.startLat,
      start_lon: coords.startLon,
      end_lat: coords.endLat,
      end_lon: coords.endLon,
      penalty_k: constraints.penaltyK,
      max_slope_deg: constraints.maxSlopeDeg,
      preferred_slope_deg: constraints.preferredSlopeDeg,
      walking_speed_kmh: constraints.walkingSpeedKmh,
      is_round_trip: constraints.isRoundTrip,
      api_key: apiKey || null,
      start_name: startName,
      end_name: endName
    });

    currentMultiRoutes = result.multi_routes;
    currentBriefing = result.briefing || '';
    const recMode = result.recommended_mode || 'lowest_energy';
    setActiveStrategyMode(recMode);

    const activeRoute = currentMultiRoutes[recMode] || result.route_data;
    renderRouteResults(activeRoute, activeRoute.stats || result.path_stats, result.briefing);

    // Refresh Recent Routes list
    loadRecentRoutesList();

    // Advance to Step 3 (Results)
    goToStep(3);

    showToast("Optimal EVA route & NASA Gemini briefing calculated!", "success", "CALCULATION COMPLETE");
  } catch (err) {
    console.error("Calculation failure:", err);
    if (errorContainer) {
      errorContainer.innerHTML = `
        <div class="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200 flex items-start justify-between gap-3">
          <div class="flex items-start gap-2.5">
            <i class="fa-solid fa-triangle-exclamation text-red-500 text-sm mt-0.5"></i>
            <div>
              <span class="font-bold font-mono uppercase block text-[10px]">Calculation Error</span>
              <p class="leading-relaxed mt-0.5">${err.message}</p>
            </div>
          </div>
          <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-1">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
      errorContainer.classList.remove('hidden');
    }
    showToast(err.message, "error", "PATHFINDING FAILED");
  } finally {
    calcBtn.disabled = false;
    calcBtn.innerHTML = `
      <i class="fa-solid fa-rocket text-sm"></i>
      <span>Compute Optimal Route</span>
    `;
  }
}

/**
 * Renders Results (Map, Telemetry Bento, Elevation Chart, Briefing)
 */
function renderRouteResults(routeObj, stats, briefing) {
  currentRouteData = routeObj;
  currentStats = stats;

  // 1. Draw route on Leaflet Map
  renderCalculatedRoute(routeObj, stats);

  // 2. Update Elevation Profile Chart
  updateElevationChartData(routeObj.coordinates, routeObj.elevations, routeObj.slopes);

  // 3. Populate Telemetry Metrics Cards
  const distM = Math.round(stats.distance_m || 0);
  const durMin = Math.round(stats.duration_min || (stats.duration_sec ? stats.duration_sec / 60 : 0));
  const durH = stats.duration_h || (durMin / 60).toFixed(2);
  const energyKcal = Math.round(stats.energy_kcal || 0);
  const energyMj = ((stats.energy_j || 0) / 1e6).toFixed(2);
  const energyKwh = ((stats.energy_j || 0) / 3.6e6).toFixed(2);

  document.getElementById('metricDistanceVal').textContent = `${distM.toLocaleString()} m`;
  document.getElementById('metricDistanceSub').textContent = `Traversal length (${(distM/1000).toFixed(2)} km)`;

  document.getElementById('metricDurationVal').textContent = `${durMin} min`;
  document.getElementById('metricDurationSub').textContent = `≈ ${durH} h at ${stats.walking_speed_kmh || 3.5} km/h`;

  document.getElementById('metricEnergyVal').textContent = `${energyKcal.toLocaleString()} kcal`;
  document.getElementById('metricEnergySub').textContent = `${energyMj} MJ (${energyKwh} kWh)`;

  const maxSlope = stats.max_slope || 0;
  const maxSlopeLimit = getSavedConstraints().maxSlopeDeg;
  const slopePct = Math.min(100, Math.round((maxSlope / maxSlopeLimit) * 100));
  document.getElementById('metricSlopeVal').textContent = `${maxSlope.toFixed(1)}°`;
  document.getElementById('metricSlopeSub').textContent = `Limit: ${maxSlopeLimit}° (${slopePct}% margin)`;
  document.getElementById('metricSlopeBar').style.width = `${slopePct}%`;

  const o2L = (stats.o2_consumed_liters || 0).toFixed(1);
  const plssPct = (stats.plss_used_pct || 0).toFixed(1);
  const o2Kg = (stats.o2_consumed_kg || 0).toFixed(3);
  document.getElementById('metricO2Val').textContent = `${o2L} L`;
  document.getElementById('metricO2Sub').textContent = `${plssPct}% PLSS Tank (${o2Kg} kg)`;

  const losPct = (stats.los_coverage_pct !== undefined ? stats.los_coverage_pct : 100).toFixed(0);
  document.getElementById('metricLoSVal').textContent = `${losPct}%`;
  document.getElementById('metricLoSSub').textContent = `3D Mesh Ray-Cast Coverage`;

  // 4. Flight Director Go / No-Go Banner
  const statusBadge = document.getElementById('missionGoStatusBadge');
  const isExceeded = stats.exceeds_o2_capacity || stats.exceeds_max_duration || (maxSlope > maxSlopeLimit);

  if (isExceeded) {
    statusBadge.className = "p-4 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-xs flex items-center justify-between";
    statusBadge.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold">⚠️</div>
        <div>
          <span class="font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider font-mono text-[11px] block">Flight Director Status: CAUTION</span>
          <span class="text-amber-700 dark:text-amber-300">Route exceeds safety slope or PLSS consumable bounds.</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-200 text-amber-900">CAUTION</span>
    `;
  } else {
    statusBadge.className = "p-4 rounded-2xl border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs flex items-center justify-between";
    statusBadge.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
        <div>
          <span class="font-bold text-emerald-900 dark:text-emerald-100 uppercase tracking-wider font-mono text-[11px] block">Flight Director Status: GO</span>
          <span class="text-emerald-700 dark:text-emerald-300">All physiological constraints within nominal EVA margin.</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-200 text-emerald-900">GO FOR EVA</span>
    `;
  }

  // 5. Sanitized AI Mission Briefing
  const briefingContainer = document.getElementById('aiBriefingContainer');
  if (briefingContainer) {
    briefingContainer.innerHTML = parseAndSanitizeMarkdown(briefing || "No mission briefing provided.");
  }
}

/**
 * Recent Cached Routes from SQLite
 */
async function loadRecentRoutesList() {
  const container = document.getElementById('recentRoutesList');
  if (!container) return;

  try {
    const routes = await getCachedRoutes();
    if (!routes || !routes.length) {
      container.innerHTML = `<p class="text-xs text-gray-400 italic p-2">No past EVA routes cached yet.</p>`;
      return;
    }

    container.innerHTML = routes.map(r => `
      <div data-load-cached-id="${r.id}" class="p-3 rounded-xl bg-gray-50 dark:bg-[#0B0F17] hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-gray-100 dark:border-gray-800 cursor-pointer transition-colors flex items-center justify-between gap-3 group">
        <div>
          <div class="font-bold text-xs text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            ${r.name}
          </div>
          <div class="text-[10px] text-gray-500 font-mono mt-0.5">
            ${Math.round(r.distance)} m • ${r.max_slope}° max slope • ${(r.duration * 60).toFixed(0)} min
          </div>
        </div>
        <button type="button" class="text-xs text-blue-600 dark:text-blue-400 font-mono font-semibold flex items-center gap-1">
          <span>Reload</span>
          <i class="fa-solid fa-arrow-rotate-right text-[10px]"></i>
        </button>
      </div>
    `).join('');

    // Attach click listeners to reload any cached route
    container.querySelectorAll('[data-load-cached-id]').forEach(card => {
      card.addEventListener('click', () => {
        const routeId = parseInt(card.getAttribute('data-load-cached-id'), 10);
        const selected = routes.find(r => r.id === routeId);
        if (selected && selected.geojson && selected.geojson.properties) {
          const props = selected.geojson.properties;
          renderRouteResults({
            coordinates: props.coordinates,
            elevations: props.elevations,
            slopes: props.slopes,
            geojson: selected.geojson
          }, {
            distance_m: selected.distance,
            max_slope: selected.max_slope,
            duration_h: selected.duration,
            duration_min: selected.duration * 60,
            energy_kcal: Math.round((selected.distance * 150) / 4184)
          }, selected.briefing);

          goToStep(3);
          showToast(`Reloaded cached route: ${selected.name}`, "info", "ROUTE RESTORED");
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-gray-400 italic p-2">Unable to load recent routes.</p>`;
  }
}

/**
 * Coordinate Inputs Synchronization
 */
function updateCoordinateInputs(startLat, startLon, endLat, endLon) {
  const sLatEl = document.getElementById('coordStartLat');
  const sLonEl = document.getElementById('coordStartLon');
  const eLatEl = document.getElementById('coordEndLat');
  const eLonEl = document.getElementById('coordEndLon');

  if (sLatEl) sLatEl.value = startLat.toFixed(4);
  if (sLonEl) sLonEl.value = startLon.toFixed(4);
  if (eLatEl) eLatEl.value = endLat.toFixed(4);
  if (eLonEl) eLonEl.value = endLon.toFixed(4);
}

/**
 * Layer Controls in Step 1
 */
function setupLayerToggles() {
  const routeToggle = document.getElementById('toggleLayerRoute');
  const hazardToggle = document.getElementById('toggleLayerHazards');
  const walkbackToggle = document.getElementById('toggleLayerWalkback');

  if (routeToggle) routeToggle.addEventListener('change', (e) => toggleLayer('route', e.target.checked));
  if (hazardToggle) hazardToggle.addEventListener('change', (e) => toggleLayer('hazards', e.target.checked));
  if (walkbackToggle) walkbackToggle.addEventListener('change', (e) => toggleLayer('walkback', e.target.checked));
}

/**
 * Export Tools (GeoJSON, Markdown, CSV)
 */
function setupExportButtons() {
  const exportGeoJsonBtn = document.getElementById('exportGeoJsonBtn');
  const exportBriefingBtn = document.getElementById('exportBriefingBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  if (exportGeoJsonBtn) {
    exportGeoJsonBtn.addEventListener('click', () => {
      if (!currentRouteData || !currentRouteData.coordinates) {
        showToast("No calculated route available to export.", "warning", "EXPORT WARNING");
        return;
      }

      const geojson = {
        type: "FeatureCollection",
        properties: {
          system: "Martian Route & EVA Planner v2.0",
          author: "Abraham K Antony",
          dem_resolution: "38.4m",
          stats: currentStats
        },
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: currentRouteData.coordinates.map(pt => [pt[1], pt[0]])
            },
            properties: {
              elevations: currentRouteData.elevations,
              slopes: currentRouteData.slopes
            }
          }
        ]
      };

      downloadFile(JSON.stringify(geojson, null, 2), 'jezero_eva_route.geojson', 'application/json');
      showToast("GeoJSON route file downloaded successfully!", "success", "EXPORT SUCCESS");
    });
  }

  if (exportBriefingBtn) {
    exportBriefingBtn.addEventListener('click', () => {
      if (!currentBriefing) {
        showToast("No flight briefing available to export.", "warning", "EXPORT WARNING");
        return;
      }
      downloadFile(currentBriefing, 'nasa_eva_flight_briefing.md', 'text/markdown');
      showToast("Flight Director Briefing exported as Markdown (.md)", "success", "EXPORT SUCCESS");
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (!currentRouteData || !currentRouteData.coordinates) {
        showToast("No calculated route available to export.", "warning", "EXPORT WARNING");
        return;
      }

      let csv = 'PointIndex,Latitude,Longitude,Elevation_m,Slope_deg\n';
      currentRouteData.coordinates.forEach((pt, i) => {
        const elev = currentRouteData.elevations ? currentRouteData.elevations[i] : '';
        const slope = currentRouteData.slopes ? currentRouteData.slopes[i] : '';
        csv += `${i + 1},${pt[0].toFixed(5)},${pt[1].toFixed(5)},${elev},${slope}\n`;
      });

      downloadFile(csv, 'jezero_eva_telemetry.csv', 'text/csv');
      showToast("Telemetry table exported as CSV file!", "success", "EXPORT SUCCESS");
    });
  }
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Mobile Bottom Sheet Drag & Snap Handling
 */
function setupMobileBottomSheet() {
  const sheet = document.getElementById('plannerSidebar');
  const handle = document.getElementById('mobileSheetHandle');
  if (!sheet || !handle) return;

  let startY = 0;
  let currentY = 0;

  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY > 0) {
      sheet.style.transform = `translateY(${deltaY}px)`;
    }
  }, { passive: true });

  handle.addEventListener('touchend', (e) => {
    const deltaY = currentY - startY;
    sheet.style.transform = '';
    if (deltaY > 60) {
      sheet.classList.add('translate-y-[calc(100%-3.5rem)]');
    } else if (deltaY < -40) {
      sheet.classList.remove('translate-y-[calc(100%-3.5rem)]');
    }
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 310);
  });

  handle.addEventListener('click', () => {
    sheet.classList.toggle('translate-y-[calc(100%-3.5rem)]');
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 310);
  });
}

/**
 * Client-Side API Key Modal Settings
 */
function setupApiKeyModal() {
  const openBtn = document.getElementById('openApiKeyModalBtn');
  const closeBtn = document.getElementById('closeApiKeyModalBtn');
  const saveBtn = document.getElementById('saveApiKeyModalBtn');
  const modal = document.getElementById('apiKeySettingsModal');
  const input = document.getElementById('userGeminiApiKeyInput');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      if (input) input.value = getStoredApiKey();
      modal.classList.remove('hidden');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }

  if (saveBtn && modal && input) {
    saveBtn.addEventListener('click', () => {
      setStoredApiKey(input.value);
      modal.classList.add('hidden');
      showToast("Gemini API Key saved securely in browser localStorage", "success", "KEY SAVED");
    });
  }
}
