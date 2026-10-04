/**
 * Martian Route & EVA Planner - Mission Sites Page
 * Interactive landmark catalog for Jezero Crater with direct 'Plan from here' actions.
 */

import { navigateTo } from '../router.js';
import { setSelectedStartPreset } from '../state.js';
import { showToast } from '../toast.js';

const FALLBACK_PRESETS = [
  {
    id: 1,
    label: "Perseverance Landing Site (Octavia E. Butler)",
    category: "Landing Site",
    lat: 18.4447,
    lon: 77.4508,
    elevation: -2570.0,
    description: "Mars 2020 touchdown point on the smooth basaltic floor of Jezero Crater. Ideal base station location with multi-relay RF line-of-sight."
  },
  {
    id: 2,
    label: "Neretva Vallis Delta Edge",
    category: "Scientific Interest",
    lat: 18.4550,
    lon: 77.4180,
    elevation: -2520.0,
    description: "Ancient river delta deposit rich in phyllosilicates and smectite clays with exceptional biosignature preservation potential."
  },
  {
    id: 3,
    label: "Belva Crater Ejecta",
    category: "Sampling Target",
    lat: 18.4280,
    lon: 77.4650,
    elevation: -2590.0,
    description: "Large 1 km impact crater exposing deep bedrock strata, impact breccia, and boulder fields requiring strict slope avoidance."
  },
  {
    id: 4,
    label: "Margin Unit (Carbonate Bedrock)",
    category: "Geological Target",
    lat: 18.4620,
    lon: 77.4010,
    elevation: -2490.0,
    description: "Olivine and magnesium carbonate-rich outcrop along the inner crater rim formed in ancient alkaline lacustrine shoreline waters."
  },
  {
    id: 5,
    label: "Bright Angel (Cheyava Falls Specimen)",
    category: "Astrobiology Target",
    lat: 18.4710,
    lon: 77.4120,
    elevation: -2480.0,
    description: "Distinctive light-toned rock outcrop with 'leopard spot' mineral rings indicative of ancient redox reactions and potential organics."
  },
  {
    id: 6,
    label: "Western Crater Rim Overlook",
    category: "Geological Hazard",
    lat: 18.4720,
    lon: 77.3850,
    elevation: -2200.0,
    description: "Steep 15°–25° crater wall transition boundary. Features high-elevation vantage points but requires strict metabolic slope planning."
  },
  {
    id: 7,
    label: "Kodiak Mesa Promontory",
    category: "Stratigraphic Outcrop",
    lat: 18.4150,
    lon: 77.4320,
    elevation: -2540.0,
    description: "Isolated erosional remnant exhibiting classic delta bottom-set and top-set bedding architecture, proving ancient river lake cycles."
  }
];

export async function initMissionSitesPage() {
  const container = document.getElementById('missionSitesContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center p-12">
      <div class="flex items-center gap-3 text-sm text-gray-500 font-mono">
        <i class="fa-solid fa-spinner fa-spin text-blue-600"></i>
        <span>Loading Jezero Crater Waypoints...</span>
      </div>
    </div>
  `;

  let presets = FALLBACK_PRESETS;
  try {
    const res = await fetch('/api/presets', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.presets && data.presets.length > 0) {
        presets = data.presets;
      }
    }
  } catch (err) {
    console.warn("Using fallback Jezero presets:", err.message);
  }

  renderMissionSites(presets, container);
}

function renderMissionSites(presets, container) {
  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${presets.map(site => createSiteCardMarkup(site)).join('')}
    </div>
  `;

  // Attach "Plan from here" handlers
  container.querySelectorAll('[data-plan-site]').forEach(btn => {
    btn.addEventListener('click', () => {
      const siteId = btn.getAttribute('data-plan-site');
      const site = presets.find(s => s.id == siteId || s.label === siteId);
      if (site) {
        setSelectedStartPreset({
          name: site.label,
          lat: site.lat,
          lon: site.lon
        });
        showToast(`Selected "${site.label}" as EVA Start Point`, "success", "WAYPOINT LOADED");
        navigateTo('/planner');
      }
    });
  });
}

function createSiteCardMarkup(site) {
  const categoryBadgeClass = site.category.includes('Hazard')
    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50'
    : site.category.includes('Astrobiology') || site.category.includes('Scientific')
    ? 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50'
    : site.category.includes('Landing')
    ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50';

  return `
    <div class="bg-white dark:bg-[#131B2E] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col justify-between card-hover shadow-sm">
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-2">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono border ${categoryBadgeClass}">
            ${site.category}
          </span>
          <span class="text-xs font-mono text-gray-400 dark:text-gray-500">#${site.id}</span>
        </div>

        <div>
          <h3 class="text-lg font-bold text-gray-900 dark:text-white leading-snug">${site.label}</h3>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
            ${site.description}
          </p>
        </div>

        <!-- Coordinates & Elevation Pill Box -->
        <div class="grid grid-cols-2 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-[#19243C] border border-gray-100 dark:border-gray-800 text-[11px] font-mono">
          <div>
            <span class="text-gray-400 block text-[10px]">COORDINATES</span>
            <span class="font-semibold text-gray-800 dark:text-gray-200">${site.lat.toFixed(4)}°N, ${site.lon.toFixed(4)}°E</span>
          </div>
          <div>
            <span class="text-gray-400 block text-[10px]">ELEVATION</span>
            <span class="font-semibold text-blue-600 dark:text-blue-400">${site.elevation !== undefined ? site.elevation.toFixed(1) + ' m' : '—'}</span>
          </div>
        </div>
      </div>

      <div class="pt-5 mt-4 border-t border-gray-100 dark:border-gray-800">
        <button type="button" data-plan-site="${site.id}" class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gray-900 hover:bg-black text-white dark:bg-blue-600 dark:hover:bg-blue-700 shadow-sm active:scale-95 transition-all">
          <i class="fa-solid fa-person-walking text-sm"></i>
          <span>Plan from here</span>
        </button>
      </div>
    </div>
  `;
}
