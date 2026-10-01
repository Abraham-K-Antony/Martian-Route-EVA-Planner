/**
 * Martian Route & EVA Planner v2.0
 * Copyright (c) 2026 Abraham K Antony. All Rights Reserved.
 * Lead Systems Architect: Abraham K Antony
 * Repository: https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner
 */
console.log(
    "%c Martian Route & EVA Planner %c Developed by Abraham K Antony (https://github.com/Abraham-K-Antony) ",
    "background: #ff5a1f; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
    "background: #0d1320; color: #22d3ee; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;"
);

let map, startMarker, endMarker, positionMarker, routePolyline;
let waypointsLayerGroup, hazardOverlayLayerGroup;
let elevationChart = null;
let isMapPickMode = false;
let mapPickState = 'start';
let currentBriefingText = "";
let currentRouteCoords = [];
let currentElevations = [];
let currentSlopes = [];

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initChart();
    loadPresets();
    loadCachedRoutes();
    loadUserApiKey();
    initThemePalette();

    // Initial mobile tab check
    if (window.innerWidth < 1024) {
        switchMobileTab('map');
    }

    document.getElementById('penaltyK').addEventListener('input', (e) => {
        document.getElementById('kVal').textContent = parseFloat(e.target.value).toFixed(1);
    });
    
    document.getElementById('maxSlope').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(1);
        document.getElementById('slopeVal').textContent = `${val}°`;
        const limitText = document.getElementById('limitSlopeText');
        if (limitText) limitText.textContent = `${val}°`;
    });

    const prefSlopeEl = document.getElementById('prefSlope');
    if (prefSlopeEl) {
        prefSlopeEl.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value).toFixed(1);
            const badge = document.getElementById('prefSlopeVal');
            if (badge) badge.textContent = `${val}°`;
        });
    }

    document.getElementById('startPreset').addEventListener('change', onPresetChange);
    document.getElementById('endPreset').addEventListener('change', onPresetChange);
    document.getElementById('computeBtn').addEventListener('click', computeRoute);
    document.getElementById('mapPickBtn').addEventListener('click', toggleMapPickMode);
    document.getElementById('exportBriefingBtn').addEventListener('click', exportBriefing);
});

// Modal Dialog Controls
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Secure Client-Side API Key Management (Stored strictly in browser localStorage)
function loadUserApiKey() {
    const savedKey = localStorage.getItem('mars_user_gemini_api_key');
    const inputModal = document.getElementById('userApiKeyInput');
    const badge = document.getElementById('apiKeyStatusBadge');
    
    if (savedKey) {
        if (inputModal) inputModal.value = savedKey;
        if (badge) {
            badge.innerHTML = `<i class="fa-solid fa-lock text-green-400"></i> API Key Active (Client Encrypted)`;
            badge.className = "text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/30 flex items-center gap-1 font-mono text-[11px]";
        }
    } else {
        if (badge) {
            badge.innerHTML = `<i class="fa-solid fa-shield-halved text-yellow-400"></i> Default Server Telemetry`;
            badge.className = "text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/30 flex items-center gap-1 font-mono text-[11px]";
        }
    }
}

function saveUserApiKey() {
    const inputModal = document.getElementById('userApiKeyInput');
    const key = inputModal ? inputModal.value.trim() : '';

    if (!key) {
        showToast("Please enter a valid Gemini API Key", "warning", "API KEY REQUIRED");
        return;
    }

    localStorage.setItem('mars_user_gemini_api_key', key);
    loadUserApiKey();
    closeModal('apiKeyModal');
    showToast("Gemini API key saved securely in your browser's private localStorage!", "success", "SECURE API KEY SAVED");
}

function clearUserApiKey() {
    localStorage.removeItem('mars_user_gemini_api_key');
    const inputModal = document.getElementById('userApiKeyInput');
    if (inputModal) inputModal.value = '';
    loadUserApiKey();
    closeModal('apiKeyModal');
}

// Color Scheme Palette Switcher (Following Hostinger Web Design Best Practices: 60-30-10 Rule)
let currentThemeColor = '#ff5a1f';

function changeThemePalette(theme) {
    localStorage.setItem('mars_color_theme', theme);
    const sel = document.getElementById('themeSelector');
    if (sel) sel.value = theme;

    if (theme === 'cyan') {
        currentThemeColor = '#00f0ff';
        showToast("Switched to Orbital Cyan Color Scheme", "info", "THEME PALETTE UPDATED");
    } else if (theme === 'emerald') {
        currentThemeColor = '#22c55e';
        showToast("Switched to Bio-Suit Emerald Color Scheme", "success", "THEME PALETTE UPDATED");
    } else if (theme === 'mono') {
        currentThemeColor = '#f8fafc';
        showToast("Switched to Deep Space Monochromatic Color Scheme", "info", "THEME PALETTE UPDATED");
    } else {
        currentThemeColor = '#ff5a1f';
        showToast("Switched to Mars Rust-Orange (60-30-10) Color Scheme", "info", "THEME PALETTE UPDATED");
    }

    if (routePolyline) {
        routePolyline.setStyle({ color: currentThemeColor });
    }
}

function initThemePalette() {
    const savedTheme = localStorage.getItem('mars_color_theme') || 'mars';
    changeThemePalette(savedTheme);
}

// Top Menu Navigation Tabs
function switchViewTab(tab) {
    const navBtn = document.getElementById('navMapBtn');
    if (navBtn) navBtn.className = "nav-btn active px-3 py-1.5 rounded flex items-center gap-1.5 font-bold";
    if (window.innerWidth < 1024) {
        switchMobileTab(tab);
    }
}

// Mobile Navigation Tab Switcher (< 1024px)
function switchMobileTab(tab) {
    const panelControls = document.getElementById('panelControls');
    const panelMap = document.getElementById('panelMap');
    const panelBriefing = document.getElementById('panelBriefing');

    const btnControls = document.getElementById('mobileTabControls');
    const btnMap = document.getElementById('mobileTabMap');
    const btnBriefing = document.getElementById('mobileTabBriefing');

    if (window.innerWidth < 1024) {
        [panelControls, panelMap, panelBriefing].forEach(p => {
            if (p) p.classList.add('hidden');
        });
        [btnControls, btnMap, btnBriefing].forEach(b => {
            if (b) b.className = 'flex-1 py-2.5 text-center font-bold text-gray-400 border-b-2 border-transparent flex items-center justify-center gap-1';
        });

        if (tab === 'controls') {
            if (panelControls) panelControls.classList.remove('hidden');
            if (btnControls) btnControls.className = 'flex-1 py-2.5 text-center font-bold text-mars-accent border-b-2 border-mars-accent flex items-center justify-center gap-1';
        } else if (tab === 'map') {
            if (panelMap) panelMap.classList.remove('hidden');
            if (btnMap) btnMap.className = 'flex-1 py-2.5 text-center font-bold text-mars-neon border-b-2 border-mars-neon flex items-center justify-center gap-1';
            setTimeout(() => {
                if (map) map.invalidateSize();
            }, 100);
        } else if (tab === 'briefing') {
            if (panelBriefing) panelBriefing.classList.remove('hidden');
            if (btnBriefing) btnBriefing.className = 'flex-1 py-2.5 text-center font-bold text-green-400 border-b-2 border-green-400 flex items-center justify-center gap-1';
        }
    }
}

window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        const panelControls = document.getElementById('panelControls');
        const panelMap = document.getElementById('panelMap');
        const panelBriefing = document.getElementById('panelBriefing');
        [panelControls, panelMap, panelBriefing].forEach(p => {
            if (p) p.classList.remove('hidden');
        });
        if (map) map.invalidateSize();
    } else {
        switchMobileTab('map');
    }
});

// Toast Notification System
function showToast(message, type = 'info', title = 'MISSION CONTROL') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg shadow-2xl backdrop-blur-md border transition-all duration-300 transform translate-x-10 opacity-0 bg-mars-panel/95 text-xs text-gray-200`;

    let iconClass = 'fa-info-circle text-mars-neon';
    let borderColor = 'border-mars-neon/40';

    if (type === 'success') {
        iconClass = 'fa-circle-check text-green-400';
        borderColor = 'border-green-500/40';
    } else if (type === 'warning') {
        iconClass = 'fa-triangle-exclamation text-yellow-400';
        borderColor = 'border-yellow-500/40';
    } else if (type === 'error') {
        iconClass = 'fa-circle-xmark text-red-400';
        borderColor = 'border-red-500/40';
    }

    toast.classList.add(borderColor);

    toast.innerHTML = `
        <div class="mt-0.5 text-base">
            <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="flex-1">
            <div class="font-bold text-gray-100 font-mono text-[11px] uppercase tracking-wider mb-0.5">${title}</div>
            <div class="text-gray-300 leading-snug">${message}</div>
        </div>
        <button onclick="this.parentElement.remove()" class="text-gray-500 hover:text-white transition ml-1 text-sm">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-10');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// 1. Initialize Leaflet Map
function initMap() {
    map = L.map('map', {
        center: [18.4447, 77.4508],
        zoom: 12
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Imagery / NASA Mars DEM Data',
        maxZoom: 16
    }).addTo(map);

    waypointsLayerGroup = L.layerGroup().addTo(map);
    hazardOverlayLayerGroup = L.layerGroup().addTo(map);

    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLon = parseFloat(document.getElementById('startLon').value);
    const endLat = parseFloat(document.getElementById('endLat').value);
    const endLon = parseFloat(document.getElementById('endLon').value);

    updateMapMarkers(startLat, startLon, endLat, endLon);

    map.on('click', (e) => {
        const lat = parseFloat(e.latlng.lat.toFixed(4));
        const lon = parseFloat(e.latlng.lng.toFixed(4));

        if (mapPickState === 'start') {
            document.getElementById('startLat').value = lat;
            document.getElementById('startLon').value = lon;
            mapPickState = 'end';
            showToast(`Start point set to (${lat}, ${lon}). Click next point on map for Destination.`, 'info', 'START WAYPOINT SET');
        } else {
            document.getElementById('endLat').value = lat;
            document.getElementById('endLon').value = lon;
            mapPickState = 'start';
            isMapPickMode = false;
            document.getElementById('mapPickBtn').classList.remove('text-yellow-400');
            showToast(`Destination set to (${lat}, ${lon}). Click 04 COMPUTE ROUTE to begin.`, 'success', 'DESTINATION SET');
        }
        updateMapMarkersFromInputs();
    });
}

function toggleMapPickMode() {
    isMapPickMode = true;
    mapPickState = 'start';
    document.getElementById('mapPickBtn').classList.add('text-yellow-400');
    showToast("Click anywhere on map to set START location, then click again for DESTINATION.", "info", "MAP SELECTION ACTIVE");
}

function updateMapMarkersFromInputs() {
    const sLat = parseFloat(document.getElementById('startLat').value);
    const sLon = parseFloat(document.getElementById('startLon').value);
    const eLat = parseFloat(document.getElementById('endLat').value);
    const eLon = parseFloat(document.getElementById('endLon').value);
    updateMapMarkers(sLat, sLon, eLat, eLon);
}

function updateMapMarkers(sLat, sLon, eLat, eLon) {
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);

    const startIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: #22c55e; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; color: white; box-shadow: 0 0 12px rgba(34,197,94,0.8);">S</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    startMarker = L.marker([sLat, sLon], { icon: startIcon }).addTo(map)
        .bindPopup("<b>🟢 START LOCATION</b><br>Perseverance Landing Site");

    const endIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: #ef4444; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; color: white; box-shadow: 0 0 12px rgba(239,68,68,0.8);">D</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    endMarker = L.marker([eLat, eLon], { icon: endIcon }).addTo(map)
        .bindPopup("<b>🔴 DESTINATION</b><br>Neretva Vallis Delta Edge");
}

function toggleMapLayers() {
    const showRoute = document.getElementById('layerRoute').checked;
    const showSlope = document.getElementById('layerSlope').checked;
    const showWaypoints = document.getElementById('layerWaypoints').checked;

    if (routePolyline) {
        if (showRoute) map.addLayer(routePolyline);
        else map.removeLayer(routePolyline);
    }
    if (waypointsLayerGroup) {
        if (showWaypoints) map.addLayer(waypointsLayerGroup);
        else map.removeLayer(waypointsLayerGroup);
    }
    if (hazardOverlayLayerGroup) {
        if (showSlope) map.addLayer(hazardOverlayLayerGroup);
        else map.removeLayer(hazardOverlayLayerGroup);
    }
}

let currentSelectedMode = 'lowest_energy';
let cachedMultiRoutes = null;
let cachedBriefing = "";

// 2. Route Strategy Modes
function setRouteMode(mode) {
    currentSelectedMode = mode;

    const btnEnergy = document.getElementById('modeEnergy');
    const btnFastest = document.getElementById('modeFastest');
    const btnSafest = document.getElementById('modeSafest');
    const btnComms = document.getElementById('modeComms');
    const btnLegacy = document.getElementById('modeLegacy');
    const kContainer = document.getElementById('kPenaltyContainer');

    [btnEnergy, btnFastest, btnSafest, btnComms, btnLegacy].forEach(b => {
        if (b) b.className = 'p-1.5 rounded border border-mars-border bg-mars-dark hover:bg-mars-border text-gray-300 transition text-[10px]';
    });

    if (mode === 'lowest_energy' && btnEnergy) {
        btnEnergy.className = 'p-1.5 rounded border border-mars-accent bg-mars-accent/20 text-white font-bold transition text-[10px]';
        if (kContainer) kContainer.classList.add('hidden');
    } else if (mode === 'fastest' && btnFastest) {
        btnFastest.className = 'p-1.5 rounded border border-yellow-500 bg-yellow-500/20 text-white font-bold transition text-[10px]';
        if (kContainer) kContainer.classList.add('hidden');
    } else if (mode === 'safest' && btnSafest) {
        btnSafest.className = 'p-1.5 rounded border border-green-500 bg-green-500/20 text-white font-bold transition text-[10px]';
        if (kContainer) kContainer.classList.add('hidden');
    } else if (mode === 'comms_safe' && btnComms) {
        btnComms.className = 'p-1.5 rounded border border-cyan-400 bg-cyan-400/20 text-white font-bold transition text-[10px]';
        if (kContainer) kContainer.classList.add('hidden');
    } else if (mode === 'legacy' && btnLegacy) {
        btnLegacy.className = 'p-1.5 rounded border border-purple-500 bg-purple-500/20 text-white font-bold transition text-[10px]';
        if (kContainer) kContainer.classList.remove('hidden');
    }

    if (cachedMultiRoutes && cachedMultiRoutes[mode]) {
        const routeObj = cachedMultiRoutes[mode];
        renderRoute(routeObj, routeObj.stats, cachedBriefing);
        showToast(`Displayed route option: ${mode.toUpperCase().replace('_', ' ')}`, "info", "ROUTE VIEW CHANGED");
    }
}

// 3. Presets
async function loadPresets() {
    try {
        const res = await fetch('/api/presets');
        const data = await res.json();
        if (data.status === 'success') {
            const presets = data.presets;
            const startSelect = document.getElementById('startPreset');
            const endSelect = document.getElementById('endPreset');

            startSelect.innerHTML = '';
            endSelect.innerHTML = '';

            presets.forEach((p) => {
                const opt1 = new Option(p.label, JSON.stringify(p));
                const opt2 = new Option(p.label, JSON.stringify(p));
                startSelect.add(opt1);
                endSelect.add(opt2);
            });

            startSelect.selectedIndex = 0;
            endSelect.selectedIndex = 1;
            onPresetChange();
        }
    } catch (err) {
        console.error("Error loading presets:", err);
    }
}

function onPresetChange() {
    try {
        const startP = JSON.parse(document.getElementById('startPreset').value);
        const endP = JSON.parse(document.getElementById('endPreset').value);

        document.getElementById('startLat').value = startP.lat;
        document.getElementById('startLon').value = startP.lon;
        document.getElementById('endLat').value = endP.lat;
        document.getElementById('endLon').value = endP.lon;

        updateMapMarkers(startP.lat, startP.lon, endP.lat, endP.lon);
    } catch (e) {}
}

// 4. Compute Route
async function computeRoute() {
    const btn = document.getElementById('computeBtn');
    const subtext = document.getElementById('btnSubtext');
    btn.disabled = true;

    subtext.textContent = 'Ingesting Jezero DEM Elevation Array...';
    btn.innerHTML = `<span class="flex items-center gap-2 text-sm font-mono tracking-wider"><i class="fa-solid fa-spinner fa-spin"></i> 04 COMPUTING...</span><span class="text-[10px] opacity-80 font-normal mt-0.5">${subtext.textContent}</span>`;

    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLon = parseFloat(document.getElementById('startLon').value);
    const endLat = parseFloat(document.getElementById('endLat').value);
    const endLon = parseFloat(document.getElementById('endLon').value);
    const penaltyK = parseFloat(document.getElementById('penaltyK').value);
    const maxSlope = parseFloat(document.getElementById('maxSlope').value);
    const prefSlope = parseFloat(document.getElementById('prefSlope')?.value || 8.0);
    const isRoundTrip = document.getElementById('isRoundTrip')?.checked || false;
    const walkingSpeed = parseFloat(document.getElementById('walkingSpeed').value);
    
    // Retrieve client-side private API key from localStorage if set
    const apiKey = localStorage.getItem('mars_user_gemini_api_key') || '';

    const startSel = document.getElementById('startPreset');
    const endSel = document.getElementById('endPreset');
    const startName = startSel.options[startSel.selectedIndex]?.text || "Start Location";
    const endName = endSel.options[endSel.selectedIndex]?.text || "Destination";

    updateMapMarkers(startLat, startLon, endLat, endLon);

    try {
        await new Promise(r => setTimeout(r, 200));
        subtext.textContent = 'Generating 2D Slope Grid & Hazard Barriers...';

        const response = await fetch('/api/route/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: startLat,
                start_lon: startLon,
                end_lat: endLat,
                end_lon: endLon,
                penalty_k: penaltyK,
                max_slope_deg: maxSlope,
                preferred_slope_deg: prefSlope,
                walking_speed_kmh: walkingSpeed,
                is_round_trip: isRoundTrip,
                api_key: apiKey,
                start_name: startName,
                end_name: endName
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.detail || 'Failed to compute route', 'error', 'PATHFINDING FAILURE');
            return;
        }

        cachedMultiRoutes = data.multi_routes;
        cachedBriefing = data.briefing;
        const selectedRoute = data.multi_routes?.[currentSelectedMode] || data.route_data;
        renderRoute(selectedRoute, selectedRoute.stats || data.path_stats, data.briefing);
        loadCachedRoutes();
        showToast("Optimal EVA route & NASA Gemini briefing calculated!", "success", "ROUTE COMPUTED");
    } catch (err) {
        showToast(`Network connection error: ${err.message}`, 'error', 'TELEMETRY FAILURE');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="flex items-center gap-2 text-sm font-mono tracking-wider"><i class="fa-solid fa-rocket"></i> 04 COMPUTE EVA ROUTE</span><span class="text-[10px] opacity-80 font-normal mt-0.5">Terrain-aware A* + AI Safety Briefing</span>`;
    }
}

// 5. Render Route
function renderRoute(routeData, stats, briefingText) {
    if (routePolyline) map.removeLayer(routePolyline);
    waypointsLayerGroup.clearLayers();
    hazardOverlayLayerGroup.clearLayers();

    currentRouteCoords = routeData.coordinates;
    currentElevations = routeData.elevations;
    currentSlopes = routeData.slopes;

    routePolyline = L.polyline(currentRouteCoords, {
        color: '#ff5a1f',
        weight: 4.5,
        opacity: 0.95,
        smoothFactor: 1
    }).addTo(map);

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    const totalPts = currentRouteCoords.length;
    if (totalPts > 6) {
        const step = Math.floor(totalPts / 5);
        for (let i = 1; i <= 4; i++) {
            const idx = i * step;
            if (idx < totalPts) {
                const pt = currentRouteCoords[idx];
                const wpMarker = L.circleMarker([pt[0], pt[1]], {
                    color: '#22d3ee',
                    fillColor: '#0d1320',
                    fillOpacity: 1,
                    radius: 5,
                    weight: 2
                }).bindPopup(`<b>WAYPOINT 0${i}</b><br>Elev: ${currentElevations[idx].toFixed(1)}m | Slope: ${currentSlopes[idx].toFixed(1)}°`);
                waypointsLayerGroup.addLayer(wpMarker);
            }
        }
    }

    currentSlopes.forEach((s, idx) => {
        if (s > 10.0) {
            const pt = currentRouteCoords[idx];
            const hazardPoint = L.circleMarker([pt[0], pt[1]], {
                color: '#f5b82e',
                fillColor: '#f5b82e',
                fillOpacity: 0.6,
                radius: 4,
                weight: 1
            }).bindPopup(`<b>⚠️ SLOPE HAZARD: ${s.toFixed(1)}°</b>`);
            hazardOverlayLayerGroup.addLayer(hazardPoint);
        }
    });

    const distM = Math.round(stats.distance_m || stats.distance || 0);
    const durationMin = Math.round((stats.duration_sec ? stats.duration_sec / 60 : (stats.duration || 0) * 60));
    const durationH = stats.duration_h || (durationMin / 60.0);

    document.getElementById('metricDistance').textContent = `${distM} m`;
    document.getElementById('metricSlope').textContent = `${stats.max_slope}°`;
    document.getElementById('metricDuration').textContent = `${durationMin} min`;
    document.getElementById('metricDuration').setAttribute('title', `≈ ${durationH.toFixed(2)} hr`);
    
    const energyKcal = stats.energy_kcal || Math.round((stats.energy_j || 0) / 4184);
    const energyMj = ((stats.energy_j || 0) / 1e6).toFixed(2);
    const metricEnergyEl = document.getElementById('metricEnergy');
    if (metricEnergyEl) metricEnergyEl.textContent = `${energyKcal} kcal / ${energyMj} MJ`;

    const o2L = stats.o2_consumed_liters || round(durationMin * 1.1, 1);
    const o2Kg = stats.o2_consumed_kg || round(o2L * 0.001429, 3);
    const plssPct = stats.plss_used_pct || min(100, Math.round((o2L / 840.0) * 100));
    
    const metricO2El = document.getElementById('metricO2');
    if (metricO2El) metricO2El.textContent = `${o2L} L`;
    const metricPlssPctEl = document.getElementById('metricPlssPct');
    if (metricPlssPctEl) metricPlssPctEl.textContent = `${plssPct}% PLSS (${o2Kg}kg)`;

    const losPct = stats.los_coverage_pct !== undefined ? stats.los_coverage_pct : 100.0;
    const metricLoSEl = document.getElementById('metricLoS');
    if (metricLoSEl) metricLoSEl.textContent = `${losPct}%`;

    const glareCount = stats.glare_hazards_count || 0;
    const shadowCount = stats.shadow_hazards_count || 0;
    const metricSolarEl = document.getElementById('metricSolar');
    if (metricSolarEl) metricSolarEl.textContent = `${glareCount} Glare / ${shadowCount} Shadow`;

    const maxSlopeLimit = parseFloat(document.getElementById('maxSlope').value);
    const slopePct = Math.min(100, Math.round((stats.max_slope / maxSlopeLimit) * 100));
    document.getElementById('slopePct').textContent = `${slopePct}%`;
    document.getElementById('slopeBar').style.width = `${slopePct}%`;

    const statusCard = document.getElementById('safetyStatusCard');
    const statusBadge = document.getElementById('statusBadge');

    const isExceedingO2 = stats.exceeds_o2_capacity || (o2L > 840);
    const isExceedingDur = stats.exceeds_max_duration || (durationH > 8.0);

    if (stats.max_slope <= maxSlopeLimit && !isExceedingO2 && !isExceedingDur) {
        statusCard.className = 'glass-panel p-2.5 rounded-lg border border-green-500/40 bg-green-500/10 flex items-center justify-between';
        statusBadge.innerHTML = `<i class="fa-solid fa-circle-check text-green-400"></i> ROUTE STATUS: GO`;
    } else {
        statusCard.className = 'glass-panel p-2.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 flex items-center justify-between';
        let failReason = stats.max_slope > maxSlopeLimit ? 'SLOPE LIMIT EXCEEDED' : 'SUIT PLSS CONSUMABLE LIMIT EXCEEDED';
        statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-400"></i> ROUTE STATUS: CAUTION (${failReason})`;
    }

    const midIdx = Math.floor(totalPts / 2);
    if (midIdx < totalPts) {
        updateHudPosition(midIdx);
    }

    updateChart(currentElevations, currentSlopes);

    currentBriefingText = briefingText;
    document.getElementById('briefingContent').innerHTML = marked.parse(briefingText);
}

function updateHudPosition(idx) {
    if (!currentRouteCoords || currentRouteCoords.length === 0) return;
    
    const totalPts = currentRouteCoords.length;
    const pt = currentRouteCoords[idx];
    const elev = currentElevations[idx] || 0;
    const slope = currentSlopes[idx] || 0;
    const pct = Math.round(((idx + 1) / totalPts) * 100);

    // Compute cumulative distance up to idx
    let travM = 0.0;
    for (let i = 1; i <= idx; i++) {
        const p1 = currentRouteCoords[i-1];
        const p2 = currentRouteCoords[i];
        const dLat = (p2[0] - p1[0]) * 111320.0;
        const dLon = (p2[1] - p1[1]) * 111320.0 * Math.cos((p1[0] * Math.PI)/180.0);
        travM += Math.sqrt(dLat*dLat + dLon*dLon);
    }
    
    let totalDistM = travM;
    for (let i = idx + 1; i < totalPts; i++) {
        const p1 = currentRouteCoords[i-1];
        const p2 = currentRouteCoords[i];
        const dLat = (p2[0] - p1[0]) * 111320.0;
        const dLon = (p2[1] - p1[1]) * 111320.0 * Math.cos((p1[0] * Math.PI)/180.0);
        totalDistM += Math.sqrt(dLat*dLat + dLon*dLon);
    }

    travM = Math.round(travM);
    totalDistM = Math.round(totalDistM);
    const remM = Math.max(0, totalDistM - travM);

    document.getElementById('hudProgressText').textContent = `${travM} m / ${totalDistM} m (${pct}% Traversed)`;
    document.getElementById('hudProgressBar').style.width = `${pct}%`;

    document.getElementById('hudPos').textContent = `${pt[0].toFixed(4)}°N / ${pt[1].toFixed(4)}°E`;
    document.getElementById('hudDist').textContent = `${(travM / 1000).toFixed(2)} km / ${(remM / 1000).toFixed(2)} km`;
    
    let slopeDesc = 'Nominal';
    if (slope > 12) slopeDesc = 'Hazardous';
    else if (slope > 8) slopeDesc = 'Steep';
    else if (slope > 4) slopeDesc = 'Moderate';
    document.getElementById('hudSlope').textContent = `${slope.toFixed(1)}° (${slopeDesc})`;

    const hudRisk = document.getElementById('hudRisk');
    if (slope > 12) {
        hudRisk.textContent = '● BARRIER / EXTREME';
        hudRisk.className = 'text-red-400 font-bold block';
    } else if (slope > 8) {
        hudRisk.textContent = '● HIGH RISK';
        hudRisk.className = 'text-orange-400 font-bold block';
    } else if (slope > 4) {
        hudRisk.textContent = '● MODERATE RISK';
        hudRisk.className = 'text-yellow-400 font-bold block';
    } else {
        hudRisk.textContent = '● LOW RISK';
        hudRisk.className = 'text-green-400 font-bold block';
    }

    if (positionMarker) map.removeLayer(positionMarker);
    const posIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: #00f0ff; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; color: #000; box-shadow: 0 0 14px rgba(0,240,255,0.9);">P</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    positionMarker = L.marker([pt[0], pt[1]], { icon: posIcon }).addTo(map)
        .bindPopup(`<b>🌐 TRAVERSE LOCATION #${idx+1}</b><br>Lat: ${pt[0].toFixed(4)}° | Lon: ${pt[1].toFixed(4)}°<br>Elev: ${elev.toFixed(1)}m | Slope: ${slope.toFixed(1)}°`);
}

// 6. Chart.js
function initChart() {
    const ctx = document.getElementById('elevationChart').getContext('2d');
    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Elevation (m)',
                    data: [],
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Slope (°)',
                    data: [],
                    borderColor: '#ff5a1f',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onHover: (evt, activeEls) => {
                if (activeEls.length > 0 && currentRouteCoords.length > 0) {
                    const idx = activeEls[0].index;
                    updateHudPosition(idx);
                }
            },
            scales: {
                x: { 
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#8995a7', font: { size: 9 }, maxTicksLimit: 8 }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#8995a7', font: { size: 10 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#ff5a1f', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#e8edf5', font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        title: (items) => `Waypoint #${items[0].dataIndex + 1} (${items[0].label})`,
                        label: (ctx) => {
                            const val = ctx.raw;
                            return ctx.datasetIndex === 0 ? ` Elevation: ${val.toFixed(1)} m` : ` Slope: ${val.toFixed(1)}°`;
                        }
                    }
                }
            }
        }
    });
}

function updateChart(elevations, slopes) {
    if (!elevationChart) return;

    // Compute distance labels for X axis
    let cumDist = 0.0;
    const labels = elevations.map((_, i) => {
        if (i > 0 && currentRouteCoords.length > i) {
            const p1 = currentRouteCoords[i-1];
            const p2 = currentRouteCoords[i];
            const dLat = (p2[0] - p1[0]) * 111320.0;
            const dLon = (p2[1] - p1[1]) * 111320.0 * Math.cos((p1[0] * Math.PI)/180.0);
            cumDist += Math.sqrt(dLat*dLat + dLon*dLon);
        }
        return `${Math.round(cumDist)}m`;
    });

    elevationChart.data.labels = labels;
    elevationChart.data.datasets[0].data = elevations;
    elevationChart.data.datasets[1].data = slopes;
    elevationChart.update();
}

// 7. Cached Routes
async function loadCachedRoutes() {
    try {
        const res = await fetch('/api/routes/cached');
        const data = await res.json();
        if (data.status === 'success') {
            const list = document.getElementById('cachedRoutesList');
            list.innerHTML = '';
            
            if (data.routes.length === 0) {
                list.innerHTML = `<span class="text-gray-500 italic">No cached routes.</span>`;
                return;
            }

            data.routes.forEach(r => {
                const item = document.createElement('div');
                item.className = 'p-2 rounded bg-mars-dark hover:bg-mars-border cursor-pointer transition flex justify-between items-center border border-mars-border';
                const distM = Math.round(r.distance);
                const min = Math.round(r.duration * 60);
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-gray-200 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-mars-accent"></span> ${r.name}</div>
                        <div class="text-[10px] text-gray-400 mt-0.5">${distM} m · ${r.max_slope}° slope · ${min} min</div>
                    </div>
                    <button class="text-mars-neon hover:underline text-[11px] font-mono flex items-center gap-1">
                        <i class="fa-solid fa-rotate-right text-[9px]"></i> Load
                    </button>
                `;
                item.onclick = () => {
                    renderRoute({
                        coordinates: r.geojson.properties.coordinates,
                        elevations: r.geojson.properties.elevations,
                        slopes: r.geojson.properties.slopes
                    }, {
                        distance: r.distance,
                        max_slope: r.max_slope,
                        duration: r.duration,
                        hazards_avoided: r.hazards_avoided || 7
                    }, r.briefing);
                };
                list.appendChild(item);
            });
        }
    } catch (e) {}
}

function exportBriefing() {
    if (!currentBriefingText) {
        showToast("No briefing available to export. Please compute a route first.", "warning", "EXPORT BRIEFING");
        return;
    }

    const blob = new Blob([currentBriefingText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mars_eva_briefing.md';
    a.click();
    URL.revokeObjectURL(url);
}
