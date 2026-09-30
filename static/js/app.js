/**
 * Martian Route & EVA Planner v2.0
 * Copyright (c) 2026 Abraham K Antony. All Rights Reserved.
 * Lead Systems Architect: Abraham K Antony
 * Repository: https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner
 */
console.log(
    "%c Martian Route & EVA Planner %c Developed by Abraham K Antony (https://github.com/Abraham-K-Antony) ",
    "background: #ff4500; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
    "background: #121624; color: #00f0ff; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;"
);

let map, startMarker, endMarker, routePolyline, hoverMarker;
let waypointsLayerGroup, hazardOverlayLayerGroup;
let elevationChart = null;
let isMapPickMode = false;
let mapPickState = 'start'; // 'start' or 'end'
let currentBriefingText = "";
let currentRouteCoords = [];

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initChart();
    loadPresets();
    loadCachedRoutes();

    // Event listeners for inputs
    document.getElementById('penaltyK').addEventListener('input', (e) => {
        document.getElementById('kVal').textContent = parseFloat(e.target.value).toFixed(1);
    });
    
    document.getElementById('maxSlope').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(1);
        document.getElementById('slopeVal').textContent = `${val}°`;
        document.getElementById('limitSlopeText').textContent = `${val}°`;
    });

    document.getElementById('startPreset').addEventListener('change', onPresetChange);
    document.getElementById('endPreset').addEventListener('change', onPresetChange);
    document.getElementById('computeBtn').addEventListener('click', computeRoute);
    document.getElementById('mapPickBtn').addEventListener('click', toggleMapPickMode);
    document.getElementById('exportBriefingBtn').addEventListener('click', exportBriefing);
});

// Glassmorphic Toast Notification System
function showToast(message, type = 'info', title = 'MISSION CONTROL') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg shadow-2xl backdrop-blur-md border transition-all duration-300 transform translate-x-10 opacity-0 bg-mars-card/95 text-xs text-gray-200`;

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
    // Centered at Jezero Crater (18.4447 N, 77.4508 E)
    map = L.map('map', {
        center: [18.4447, 77.4508],
        zoom: 12
    });

    // Dark Satellite imagery tileset for Mars regolith aesthetic
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Imagery / NASA Jezero Crater Elevation Data',
        maxZoom: 16
    }).addTo(map);

    waypointsLayerGroup = L.layerGroup().addTo(map);
    hazardOverlayLayerGroup = L.layerGroup().addTo(map);

    // Initial Markers
    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLon = parseFloat(document.getElementById('startLon').value);
    const endLat = parseFloat(document.getElementById('endLat').value);
    const endLon = parseFloat(document.getElementById('endLon').value);

    updateMapMarkers(startLat, startLon, endLat, endLon);

    // Map Click Listener for pin placement
    map.on('click', (e) => {
        const lat = parseFloat(e.latlng.lat.toFixed(4));
        const lon = parseFloat(e.latlng.lng.toFixed(4));

        if (mapPickState === 'start') {
            document.getElementById('startLat').value = lat;
            document.getElementById('startLon').value = lon;
            mapPickState = 'end';
            showToast(`Start point set to (${lat}, ${lon}). Click next point on map to set Destination.`, 'info', 'START WAYPOINT SET');
        } else {
            document.getElementById('endLat').value = lat;
            document.getElementById('endLon').value = lon;
            mapPickState = 'start';
            isMapPickMode = false;
            document.getElementById('mapPickBtn').classList.remove('text-yellow-400');
            showToast(`Destination set to (${lat}, ${lon}). Click CALCULATE ROUTE to begin.`, 'success', 'DESTINATION SET');
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

// Custom Marker Badges (🟢 START 'S' & 🔴 DESTINATION 'D')
function updateMapMarkers(sLat, sLon, eLat, eLon) {
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);

    // Green Marker (🟢 START 'S')
    const startIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: #22c55e; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; color: white; box-shadow: 0 0 12px rgba(34,197,94,0.8);">S</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    startMarker = L.marker([sLat, sLon], { icon: startIcon }).addTo(map)
        .bindPopup("<b>🟢 START LOCATION</b><br>Perseverance Landing Site");

    // Red Marker (🔴 DESTINATION 'D')
    const endIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color: #ef4444; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; color: white; box-shadow: 0 0 12px rgba(239,68,68,0.8);">D</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    endMarker = L.marker([eLat, eLon], { icon: endIcon }).addTo(map)
        .bindPopup("<b>🔴 DESTINATION</b><br>Neretva Vallis Delta Edge");
}

// Toggle Map Layers
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

// 2. Strategy Mode Selector
function setRouteMode(mode) {
    const btnSafest = document.getElementById('modeSafest');
    const btnBalanced = document.getElementById('modeBalanced');
    const btnFastest = document.getElementById('modeFastest');

    [btnSafest, btnBalanced, btnFastest].forEach(b => {
        b.className = 'p-1.5 rounded border border-mars-border bg-mars-dark hover:bg-mars-border text-gray-300 transition';
    });

    if (mode === 'safest') {
        btnSafest.className = 'p-1.5 rounded border border-green-500 bg-green-500/20 text-white font-bold transition';
        document.getElementById('penaltyK').value = 25;
        document.getElementById('maxSlope').value = 12;
    } else if (mode === 'fastest') {
        btnFastest.className = 'p-1.5 rounded border border-mars-accent bg-mars-accent/20 text-white font-bold transition';
        document.getElementById('penaltyK').value = 2;
        document.getElementById('maxSlope').value = 18;
    } else {
        btnBalanced.className = 'p-1.5 rounded border border-mars-neon bg-mars-neon/20 text-white font-bold transition';
        document.getElementById('penaltyK').value = 10;
        document.getElementById('maxSlope').value = 15;
    }

    document.getElementById('kVal').textContent = parseFloat(document.getElementById('penaltyK').value).toFixed(1);
    const slopeVal = parseFloat(document.getElementById('maxSlope').value).toFixed(1);
    document.getElementById('slopeVal').textContent = `${slopeVal}°`;
    document.getElementById('limitSlopeText').textContent = `${slopeVal}°`;
}

// 3. Load Presets
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

// 4. Compute Route with Dynamic Calculation State Readout
async function computeRoute() {
    const btn = document.getElementById('computeBtn');
    const subtext = document.getElementById('btnSubtext');
    btn.disabled = true;

    // Dynamic Step Progression Animation
    subtext.textContent = 'Ingesting Jezero DEM Elevation Array...';
    btn.innerHTML = `<span class="flex items-center gap-2 text-sm"><i class="fa-solid fa-spinner fa-spin"></i> ANALYZING TERRAIN...</span><span class="text-[10px] opacity-80 font-normal mt-0.5">${subtext.textContent}</span>`;

    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLon = parseFloat(document.getElementById('startLon').value);
    const endLat = parseFloat(document.getElementById('endLat').value);
    const endLon = parseFloat(document.getElementById('endLon').value);
    const penaltyK = parseFloat(document.getElementById('penaltyK').value);
    const maxSlope = parseFloat(document.getElementById('maxSlope').value);
    const walkingSpeed = parseFloat(document.getElementById('walkingSpeed').value);
    const apiKey = document.getElementById('apiKeyInput').value;

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
                walking_speed_kmh: walkingSpeed,
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

        renderRoute(data.route_data, data.path_stats, data.briefing);
        loadCachedRoutes();
        showToast("Optimal EVA route & NASA Gemini briefing calculated!", "success", "ROUTE COMPUTED");
    } catch (err) {
        showToast(`Network connection error: ${err.message}`, 'error', 'TELEMETRY FAILURE');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="flex items-center gap-2 text-sm"><i class="fa-solid fa-rocket"></i> CALCULATE EVA ROUTE</span><span class="text-[10px] opacity-80 font-normal mt-0.5">A* Pathfinding & AI Safety Synthesis</span>`;
    }
}

// 5. Render Route & Synchronize Map & Chart
function renderRoute(routeData, stats, briefingText) {
    if (routePolyline) map.removeLayer(routePolyline);
    waypointsLayerGroup.clearLayers();
    hazardOverlayLayerGroup.clearLayers();

    currentRouteCoords = routeData.coordinates; // [[lat, lon], ...]

    // Polyline
    routePolyline = L.polyline(currentRouteCoords, {
        color: '#ff4500',
        weight: 4.5,
        opacity: 0.95,
        smoothFactor: 1
    }).addTo(map);

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    // Render Intermediate Segment Waypoints (W1, W2, W3...)
    const totalPts = currentRouteCoords.length;
    if (totalPts > 6) {
        const step = Math.floor(totalPts / 5);
        for (let i = 1; i <= 4; i++) {
            const idx = i * step;
            if (idx < totalPts) {
                const pt = currentRouteCoords[idx];
                const wpMarker = L.circleMarker([pt[0], pt[1]], {
                    color: '#00f0ff',
                    fillColor: '#121624',
                    fillOpacity: 1,
                    radius: 5,
                    weight: 2
                }).bindPopup(`<b>WAYPOINT ${i}</b><br>Elev: ${routeData.elevations[idx].toFixed(1)}m | Slope: ${routeData.slopes[idx].toFixed(1)}°`);
                waypointsLayerGroup.addLayer(wpMarker);
            }
        }
    }

    // Render High Slope Hazard Overlay Markers on Steep Points
    routeData.slopes.forEach((s, idx) => {
        if (s > 10.0) {
            const pt = currentRouteCoords[idx];
            const hazardPoint = L.circleMarker([pt[0], pt[1]], {
                color: '#eab308',
                fillColor: '#eab308',
                fillOpacity: 0.6,
                radius: 4,
                weight: 1
            }).bindPopup(`<b>⚠️ SLOPE HAZARD: ${s.toFixed(1)}°</b>`);
            hazardOverlayLayerGroup.addLayer(hazardPoint);
        }
    });

    // Update Telemetry Metrics
    const distKm = (stats.distance / 1000.0).toFixed(2);
    const durationMin = Math.round(stats.duration * 60);

    document.getElementById('metricDistance').textContent = `${distKm} km`;
    document.getElementById('metricSlope').textContent = `${stats.max_slope}°`;
    document.getElementById('metricDuration').textContent = `${durationMin} min`;
    document.getElementById('metricHazards').textContent = `${stats.hazards_avoided} mitigations`;

    // Life Support Budget Calculations
    const durationH = stats.duration;
    const o2Liters = (durationH * 60 * 1.1).toFixed(1);
    const powerKwh = (durationH * 0.45).toFixed(2);
    const waterKg = (durationH * 0.35).toFixed(2);

    document.getElementById('o2Value').textContent = `${o2Liters} L`;
    document.getElementById('powerValue').textContent = `${powerKwh} kWh`;
    document.getElementById('waterValue').textContent = `${waterKg} kg`;

    // O2 Progress Bar (assuming max suit capacity 450L)
    const o2Pct = Math.min(100, Math.round((o2Liters / 450) * 100));
    document.getElementById('o2Bar').style.width = `${o2Pct}%`;

    // Safety Status Badge
    const statusCard = document.getElementById('safetyStatusCard');
    const statusBadge = document.getElementById('statusBadge');

    if (stats.max_slope <= parseFloat(document.getElementById('maxSlope').value)) {
        statusCard.className = 'glass-panel p-3 rounded-lg border border-green-500/40 bg-green-500/10 flex items-center justify-between';
        statusBadge.innerHTML = `<i class="fa-solid fa-circle-check text-green-400"></i> ROUTE STATUS: GO`;
    } else {
        statusCard.className = 'glass-panel p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 flex items-center justify-between';
        statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-yellow-400"></i> ROUTE STATUS: CAUTION`;
    }

    // Render Elevation Chart
    updateChart(routeData.elevations, routeData.slopes);

    // Render Briefing Markdown
    currentBriefingText = briefingText;
    document.getElementById('briefingContent').innerHTML = marked.parse(briefingText);
}

// 6. Chart.js Initialization & Map Synchronization
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
                    borderColor: '#00f0ff',
                    backgroundColor: 'rgba(0, 240, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Slope (°)',
                    data: [],
                    borderColor: '#ff4500',
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
                    const pt = currentRouteCoords[idx];
                    if (pt) {
                        highlightPointOnMap(pt[0], pt[1]);
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#ff4500', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#e2e8f0', font: { size: 10 } } }
            }
        }
    });
}

function highlightPointOnMap(lat, lon) {
    if (hoverMarker) map.removeLayer(hoverMarker);
    hoverMarker = L.circleMarker([lat, lon], {
        color: '#ff6b35',
        fillColor: '#ff6b35',
        fillOpacity: 1,
        radius: 7,
        weight: 3
    }).addTo(map);
}

function updateChart(elevations, slopes) {
    if (!elevationChart) return;
    elevationChart.data.labels = elevations.map((_, i) => i);
    elevationChart.data.datasets[0].data = elevations;
    elevationChart.data.datasets[1].data = slopes;
    elevationChart.update();
}

// 7. Load & Display Cached Routes History
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
                const km = (r.distance / 1000).toFixed(2);
                const min = Math.round(r.duration * 60);
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-gray-200">${r.name}</div>
                        <div class="text-[10px] text-gray-400">${km} km | ${r.max_slope}° | ${min} min</div>
                    </div>
                    <i class="fa-solid fa-chevron-right text-gray-500 text-xs"></i>
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
                        hazards_avoided: 0
                    }, r.briefing);
                };
                list.appendChild(item);
            });
        }
    } catch (e) {}
}

// 8. Settings Modal Toggle
function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.toggle('hidden');
}

// 9. Export Briefing Markdown
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
