/**
 * Martian Route & EVA Planner - Map Engine
 * Manages Leaflet map with authentic NASA Mars Trek WMTS basemap tiles,
 * draggable markers, slope-banded colored polylines, PoNR walkback radius,
 * and terrain hazard layers.
 */

let mapInstance = null;
let startMarker = null;
let endMarker = null;
let inspectMarker = null;
let previewTrajectoryLine = null;
let walkbackRadiusCircle = null;

let routeLayersGroup = null;
let hazardMarkersGroup = null;
let landmarksGroup = null;

let isMapPickActive = false;
let mapPickTarget = 'start'; // 'start' or 'end'
let onPointChangedCallback = null;

// NASA Mars Trek WMTS Tile Endpoints
const MARS_VIKING_TILES = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';
const MARS_MOLA_TILES = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg';

// Jezero Crater Center & Bounds
const JEZERO_CENTER = [18.4447, 77.4508];
const JEZERO_BOUNDS = [
  [18.25, 77.25], // South-West
  [18.60, 77.65]  // North-East
];

export function initMap(onPointChanged) {
  onPointChangedCallback = onPointChanged;

  const mapContainer = document.getElementById('map');
  if (!mapContainer || mapInstance) return;

  // Initialize Leaflet Map centered on Jezero Crater
  mapInstance = L.map('map', {
    center: JEZERO_CENTER,
    zoom: 12,
    minZoom: 9,
    maxZoom: 16,
    maxBounds: JEZERO_BOUNDS,
    maxBoundsViscosity: 0.8,
    zoomControl: false // Custom placement
  });

  // Re-add Zoom control at top-left
  L.control.zoom({ position: 'top-left' }).addTo(mapInstance);

  // 1. Primary NASA Mars Trek Viking MDIM2.1 Color Basemap
  const vikingLayer = L.tileLayer(MARS_VIKING_TILES, {
    attribution: 'NASA/JPL-Caltech/USGS Mars Trek',
    maxZoom: 16,
    tileSize: 256
  }).addTo(mapInstance);

  // 2. Secondary NASA MOLA Shaded Relief Layer (toggled via controls)
  const molaLayer = L.tileLayer(MARS_MOLA_TILES, {
    attribution: 'NASA/MOLA Science Team',
    maxZoom: 16,
    opacity: 0.6
  });

  // Initialize Layer Groups
  routeLayersGroup = L.layerGroup().addTo(mapInstance);
  hazardMarkersGroup = L.layerGroup().addTo(mapInstance);
  landmarksGroup = L.layerGroup().addTo(mapInstance);

  // Handle Map Clicks for Point Placement Mode
  mapInstance.on('click', (e) => {
    const lat = parseFloat(e.latlng.lat.toFixed(4));
    const lon = parseFloat(e.latlng.lng.toFixed(4));

    if (isMapPickActive) {
      if (mapPickTarget === 'start') {
        setStartMarker(lat, lon);
        mapPickTarget = 'end';
        updatePickStatus("Click on map to place DESTINATION waypoint");
      } else {
        setEndMarker(lat, lon);
        isMapPickActive = false;
        mapPickTarget = 'start';
        updatePickStatus(null);
      }

      if (onPointChangedCallback) {
        onPointChangedCallback(getCoordinates(), !isMapPickActive);
      }
    }
  });

  // Listen to inspect point events from Chart.js
  window.addEventListener('inspectRoutePoint', (e) => {
    const { coordinate } = e.detail;
    if (coordinate) {
      showInspectMarker(coordinate[0], coordinate[1]);
    }
  });

  // Invalidate size on container layout changes
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 200);
}

export function resizeMap() {
  if (mapInstance) {
    mapInstance.invalidateSize();
  }
}

export function activateMapPickMode() {
  isMapPickActive = true;
  mapPickTarget = 'start';
  updatePickStatus("Click on map to place START waypoint");
}

function updatePickStatus(message) {
  const badge = document.getElementById('mapPickStatusBadge');
  if (!badge) return;

  if (message) {
    badge.textContent = message;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/**
 * Creates or updates draggable Start Marker
 */
export function setStartMarker(lat, lon, label = "Start Location") {
  if (startMarker) {
    startMarker.setLatLng([lat, lon]);
  } else {
    const startIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative group">
          <div class="w-8 h-8 rounded-full bg-emerald-500 text-white font-extrabold flex items-center justify-center text-xs shadow-lg shadow-emerald-500/50 border-2 border-white cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
            S
          </div>
          <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ${label}
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    startMarker = L.marker([lat, lon], { icon: startIcon, draggable: true }).addTo(mapInstance);

    startMarker.on('drag', () => {
      const pos = startMarker.getLatLng();
      drawPreviewTrajectory();
      if (onPointChangedCallback) {
        onPointChangedCallback({
          startLat: parseFloat(pos.lat.toFixed(4)),
          startLon: parseFloat(pos.lng.toFixed(4)),
          endLat: getCoordinates().endLat,
          endLon: getCoordinates().endLon
        }, false);
      }
    });

    startMarker.on('dragend', () => {
      const pos = startMarker.getLatLng();
      if (onPointChangedCallback) {
        onPointChangedCallback({
          startLat: parseFloat(pos.lat.toFixed(4)),
          startLon: parseFloat(pos.lng.toFixed(4)),
          endLat: getCoordinates().endLat,
          endLon: getCoordinates().endLon
        }, true);
      }
    });
  }

  drawPreviewTrajectory();
}

/**
 * Creates or updates draggable Destination Marker
 */
export function setEndMarker(lat, lon, label = "Destination") {
  if (endMarker) {
    endMarker.setLatLng([lat, lon]);
  } else {
    const endIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative group">
          <div class="w-8 h-8 rounded-full bg-red-600 text-white font-extrabold flex items-center justify-center text-xs shadow-lg shadow-red-600/50 border-2 border-white cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
            D
          </div>
          <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ${label}
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    endMarker = L.marker([lat, lon], { icon: endIcon, draggable: true }).addTo(mapInstance);

    endMarker.on('drag', () => {
      const pos = endMarker.getLatLng();
      drawPreviewTrajectory();
      if (onPointChangedCallback) {
        onPointChangedCallback({
          startLat: getCoordinates().startLat,
          startLon: getCoordinates().startLon,
          endLat: parseFloat(pos.lat.toFixed(4)),
          endLon: parseFloat(pos.lng.toFixed(4))
        }, false);
      }
    });

    endMarker.on('dragend', () => {
      const pos = endMarker.getLatLng();
      if (onPointChangedCallback) {
        onPointChangedCallback({
          startLat: getCoordinates().startLat,
          startLon: getCoordinates().startLon,
          endLat: parseFloat(pos.lat.toFixed(4)),
          endLon: parseFloat(pos.lng.toFixed(4))
        }, true);
      }
    });
  }

  drawPreviewTrajectory();
}

export function getCoordinates() {
  const sPos = startMarker ? startMarker.getLatLng() : { lat: 18.4447, lng: 77.4508 };
  const ePos = endMarker ? endMarker.getLatLng() : { lat: 18.4550, lng: 77.4180 };
  return {
    startLat: parseFloat(sPos.lat.toFixed(4)),
    startLon: parseFloat(sPos.lng.toFixed(4)),
    endLat: parseFloat(ePos.lat.toFixed(4)),
    endLon: parseFloat(ePos.lng.toFixed(4))
  };
}

/**
 * Draws lightweight direct geodesic dashed line while dragging
 */
function drawPreviewTrajectory() {
  if (!startMarker || !endMarker || !mapInstance) return;

  const sPos = startMarker.getLatLng();
  const ePos = endMarker.getLatLng();

  if (previewTrajectoryLine) {
    previewTrajectoryLine.setLatLngs([sPos, ePos]);
  } else {
    previewTrajectoryLine = L.polyline([sPos, ePos], {
      color: '#60A5FA',
      weight: 2,
      dashArray: '6, 6',
      opacity: 0.7
    }).addTo(mapInstance);
  }
}

/**
 * Renders calculated EVA traverse with slope-danger color-banding
 */
export function renderCalculatedRoute(routeData, stats) {
  if (!mapInstance || !routeData || !routeData.coordinates) return;

  // Clear previous route layers
  routeLayersGroup.clearLayers();
  hazardMarkersGroup.clearLayers();

  if (previewTrajectoryLine) {
    mapInstance.removeLayer(previewTrajectoryLine);
    previewTrajectoryLine = null;
  }

  const coordinates = routeData.coordinates;
  const slopes = routeData.slopes || [];
  const elevations = routeData.elevations || [];

  // 1. Draw Multi-Segment Colored Polyline with Progressive Animation
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const totalSegments = coordinates.length - 1;

  function createSegment(i) {
    const c1 = coordinates[i];
    const c2 = coordinates[i+1];
    const slope = slopes[i] || 0;

    // Strict isolated hazard palette: Safe <8° (#16A34A), Caution 8-15° (#F59E0B), Danger >15° (#DC2626)
    const segmentColor = slope > 15.0
      ? '#DC2626'
      : slope > 8.0
      ? '#F59E0B'
      : '#16A34A';

    const segment = L.polyline([[c1[0], c1[1]], [c2[0], c2[1]]], {
      color: segmentColor,
      weight: 4.5,
      opacity: 0.95,
      smoothFactor: 1.0
    });

    segment.bindPopup(`
      <div class="text-xs font-mono p-1">
        <div class="font-bold text-gray-900 mb-1">Traverse Segment #${i+1}</div>
        <div>Slope: <span class="font-bold" style="color: ${segmentColor}">${slope.toFixed(1)}°</span></div>
        <div>Elevation: ${elevations[i] ? elevations[i].toFixed(1) : '—'} m</div>
      </div>
    `);

    routeLayersGroup.addLayer(segment);
  }

  if (prefersReducedMotion || totalSegments < 10) {
    for (let i = 0; i < totalSegments; i++) {
      createSegment(i);
    }
  } else {
    // Progressive draw-in animation
    let currentIdx = 0;
    const batchSize = Math.max(2, Math.floor(totalSegments / 25));
    function stepDraw() {
      const endBatch = Math.min(totalSegments, currentIdx + batchSize);
      for (let i = currentIdx; i < endBatch; i++) {
        createSegment(i);
      }
      currentIdx = endBatch;
      if (currentIdx < totalSegments) {
        requestAnimationFrame(stepDraw);
      }
    }
    requestAnimationFrame(stepDraw);
  }

  // 2. Mark High Slope Hazard Barriers
  slopes.forEach((s, idx) => {
    if (s > 12.0 && idx % 3 === 0) { // Sample every 3 points to avoid clutter
      const pt = coordinates[idx];
      const hazardMarker = L.circleMarker([pt[0], pt[1]], {
        radius: 4.5,
        color: '#DC2626',
        fillColor: '#FEE2E2',
        fillOpacity: 0.9,
        weight: 1.5
      }).bindPopup(`
        <div class="text-xs font-mono p-1">
          <div class="font-bold text-red-600 flex items-center gap-1">
            ⚠️ SLOPE BARRIER: ${s.toFixed(1)}°
          </div>
          <div class="text-gray-600 mt-1">Exceeds nominal xEMU walking threshold.</div>
        </div>
      `);
      hazardMarkersGroup.addLayer(hazardMarker);
    }
  });

  // 3. Render Walkback Radius (Point of No Return safety circle)
  if (walkbackRadiusCircle) {
    mapInstance.removeLayer(walkbackRadiusCircle);
    walkbackRadiusCircle = null;
  }

  const sPos = startMarker.getLatLng();
  const maxSafeDistanceM = (stats.distance_m || 2000) * 1.25;
  walkbackRadiusCircle = L.circle(sPos, {
    radius: maxSafeDistanceM,
    color: '#3B82F6',
    dashArray: '4, 8',
    weight: 1.5,
    fillColor: '#3B82F6',
    fillOpacity: 0.04
  }).bindPopup(`<b>Suit Walkback Safety Margin</b><br>Max Return Radius: ${(maxSafeDistanceM/1000).toFixed(2)} km`).addTo(mapInstance);

  // 4. Fit bounds to full route
  if (coordinates.length > 0) {
    const polylineBounds = L.latLngBounds(coordinates);
    mapInstance.fitBounds(polylineBounds, { padding: [40, 40] });
  }
}

/**
 * Highlights a specific coordinate on the map when hovering chart points
 */
function showInspectMarker(lat, lon) {
  if (!mapInstance) return;

  if (inspectMarker) {
    inspectMarker.setLatLng([lat, lon]);
  } else {
    const inspectIcon = L.divIcon({
      className: 'inspect-pin',
      html: `<div class="w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-md animate-ping"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    inspectMarker = L.marker([lat, lon], { icon: inspectIcon }).addTo(mapInstance);
  }
}

/**
 * Layer visibility toggles
 */
export function toggleLayer(layerName, isVisible) {
  if (!mapInstance) return;

  if (layerName === 'route' && routeLayersGroup) {
    if (isVisible) mapInstance.addLayer(routeLayersGroup);
    else mapInstance.removeLayer(routeLayersGroup);
  } else if (layerName === 'hazards' && hazardMarkersGroup) {
    if (isVisible) mapInstance.addLayer(hazardMarkersGroup);
    else mapInstance.removeLayer(hazardMarkersGroup);
  } else if (layerName === 'walkback' && walkbackRadiusCircle) {
    if (isVisible) mapInstance.addLayer(walkbackRadiusCircle);
    else mapInstance.removeLayer(walkbackRadiusCircle);
  }
}
