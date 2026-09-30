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

let map, startMarker, endMarker, routePolyline;
let elevationChart = null;
let isMapPickMode = false;
let mapPickState = 'start'; // 'start' or 'end'
let currentBriefingText = "";

document.addEventListener('DOMContentLoaded', () => {

    initMap();
    initChart();
    loadPresets();
    loadCachedRoutes();

    // Event listeners
    document.getElementById('penaltyK').addEventListener('input', (e) => {
        document.getElementById('kVal').textContent = parseFloat(e.target.value).toFixed(1);
    });
    
    document.getElementById('maxSlope').addEventListener('input', (e) => {
        document.getElementById('slopeVal').textContent = `${parseFloat(e.target.value).toFixed(1)}°`;
    });

    document.getElementById('startPreset').addEventListener('change', onPresetChange);
    document.getElementById('endPreset').addEventListener('change', onPresetChange);
    document.getElementById('computeBtn').addEventListener('click', computeRoute);
    document.getElementById('mapPickBtn').addEventListener('click', toggleMapPickMode);
    document.getElementById('exportBriefingBtn').addEventListener('click', exportBriefing);
});

// 1. Initialize Leaflet Map
function initMap() {
    // Centered at Jezero Crater (18.4447 N, 77.4508 E)
    map = L.map('map', {
        center: [18.4447, 77.4508],
        zoom: 12
    });

    // Esri World Imagery Basemap (Satellite tiles)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Imagery / NASA Mars Exploration Data',
        maxZoom: 16
    }).addTo(map);

    // Initial Markers
    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLon = parseFloat(document.getElementById('startLon').value);
    const endLat = parseFloat(document.getElementById('endLat').value);
    const endLon = parseFloat(document.getElementById('endLon').value);

    updateMapMarkers(startLat, startLon, endLat, endLon);

    // Map Click Listener for interactive point placement
    map.on('click', (e) => {
        const lat = parseFloat(e.latlng.lat.toFixed(4));
        const lon = parseFloat(e.latlng.lng.toFixed(4));

        if (mapPickState === 'start') {
            document.getElementById('startLat').value = lat;
            document.getElementById('startLon').value = lon;
            mapPickState = 'end';
            alert(`Start point set to (${lat}, ${lon}). Click next point on map to set Destination.`);
        } else {
            document.getElementById('endLat').value = lat;
            document.getElementById('endLon').value = lon;
            mapPickState = 'start';
            isMapPickMode = false;
            document.getElementById('mapPickBtn').classList.remove('text-yellow-400');
        }
        updateMapMarkersFromInputs();
    });
}

function toggleMapPickMode() {
    isMapPickMode = true;
    mapPickState = 'start';
    document.getElementById('mapPickBtn').classList.add('text-yellow-400');
    alert("Click anywhere on the map to set the START location, then click again to set DESTINATION.");
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

    // Green pin for Start
    startMarker = L.circleMarker([sLat, sLon], {
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.9,
        radius: 8
    }).addTo(map).bindPopup("<b>START POINT</b>");

    // Red pin for End
    endMarker = L.circleMarker([eLat, eLon], {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        radius: 8
    }).addTo(map).bindPopup("<b>DESTINATION</b>");
}

// 2. Load Preset Locations
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

            presets.forEach((p, idx) => {
                const opt1 = new Option(p.label, JSON.stringify(p));
                const opt2 = new Option(p.label, JSON.stringify(p));
                startSelect.add(opt1);
                endSelect.add(opt2);
            });

            // Set default selections
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

// 3. Compute A* Optimal Route via REST API
async function computeRoute() {
    const btn = document.getElementById('computeBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> COMPUTING ORBITAL TELEMETRY...`;

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
    const startName = startSel.options[startSel.selectedIndex]?.text || "Start";
    const endName = endSel.options[endSel.selectedIndex]?.text || "End";

    updateMapMarkers(startLat, startLon, endLat, endLon);

    try {
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
            alert(`Error: ${data.detail || 'Failed to compute route'}`);
            return;
        }

        renderRoute(data.route_data, data.path_stats, data.briefing);
        loadCachedRoutes();
    } catch (err) {
        alert(`Network connection error: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-rocket"></i> COMPUTE OPTIMAL EVA ROUTE`;
    }
}

// 4. Render Route, Metrics & Profile Chart
function renderRoute(routeData, stats, briefingText) {
    // Render Map Polyline
    if (routePolyline) map.removeLayer(routePolyline);

    const coords = routeData.coordinates; // [[lat, lon], ...]
    routePolyline = L.polyline(coords, {
        color: '#ff4500',
        weight: 4,
        opacity: 0.95,
        smoothFactor: 1
    }).addTo(map);

    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

    // Update Telemetry Metrics
    document.getElementById('metricDistance').textContent = `${stats.distance} m`;
    document.getElementById('metricSlope').textContent = `${stats.max_slope}°`;
    document.getElementById('metricDuration').textContent = `${stats.duration} hrs`;
    document.getElementById('metricHazards').textContent = `${stats.hazards_avoided}`;

    // Render Elevation Chart
    updateChart(routeData.elevations, routeData.slopes);

    // Render Briefing Markdown
    currentBriefingText = briefingText;
    document.getElementById('briefingContent').innerHTML = marked.parse(briefingText);
}

// 5. Chart.js Elevation & Slope Profile
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
            scales: {
                x: {
                    display: false
                },
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
                legend: {
                    labels: { color: '#e2e8f0', font: { size: 10 } }
                }
            }
        }
    });
}

function updateChart(elevations, slopes) {
    if (!elevationChart) return;
    elevationChart.data.labels = elevations.map((_, i) => i);
    elevationChart.data.datasets[0].data = elevations;
    elevationChart.data.datasets[1].data = slopes;
    elevationChart.update();
}

// 6. Load & Display Cached Routes History
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
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-gray-200">${r.name}</div>
                        <div class="text-[10px] text-gray-400">${r.distance}m | ${r.max_slope}° | ${r.duration}h</div>
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

// 7. Export Briefing Markdown File
function exportBriefing() {
    if (!currentBriefingText) {
        alert("No briefing to export. Compute a route first.");
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
