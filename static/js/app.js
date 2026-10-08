/**
 * Martian Route & EVA Planner - Main Application Entry Point
 * Architecture: ES Modules, Light-First Design System, Responsive SPA Shell
 * Author: Abraham K Antony
 */

import { initTheme } from './theme.js';
import { initRouter } from './router.js';
import { initHomePage } from './pages/home.js';
import { initMissionSitesPage } from './pages/mission-sites.js';
import { initAboutPage } from './pages/about.js';
import { initContactPage } from './pages/contact.js';
import { initMap, resizeMap } from './map.js';
import { initElevationChart } from './chart.js';
import { initPlannerWorkflow, executeRouteCalculation } from './stepper.js';

console.log(
  "%c Martian Route & EVA Planner %c v2.1 Modular Engine by Abraham K Antony ",
  "background: #2563EB; color: #FFFFFF; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
  "background: #131B2E; color: #60A5FA; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;"
);

let isPlannerInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Design System & Theme Persistence
  initTheme();

  // 2. Register Page Navigated Event Listener FIRST
  window.addEventListener('pageNavigated', (e) => {
    const { path, viewId } = e.detail;
    handlePageViewActivation(path, viewId);
  });

  // 3. Initialize Clean SPA Router (triggers resolveRoute & pageNavigated)
  initRouter();

  // 4. Initialize Smooth Fade-Up on Scroll
  initScrollReveal();

  // 5. Check Mission Server Health & Warm Up Free-Tier Backend
  checkServerHealth();
});

function initScrollReveal() {
  const elements = document.querySelectorAll('.reveal-on-scroll');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  elements.forEach(el => observer.observe(el));
}

function handlePageViewActivation(path, viewId) {
  if (path === '/planner' || viewId === 'view-planner') {
    activatePlannerView();
  } else if (path === '/mission-sites' || viewId === 'view-mission-sites') {
    initMissionSitesPage();
  } else if (path === '/about' || viewId === 'view-about') {
    initAboutPage();
  } else if (path === '/contact' || viewId === 'view-contact') {
    initContactPage();
  } else {
    initHomePage();
  }
  setTimeout(initScrollReveal, 100);
}

/**
 * Activates the interactive planner workspace, Leaflet map, and Chart.js profile
 */
async function activatePlannerView() {
  if (!isPlannerInitialized) {
    // Initialize Leaflet Map with callback on marker drag
    initMap((coords, shouldRecalculate) => {
      const sLatEl = document.getElementById('coordStartLat');
      const sLonEl = document.getElementById('coordStartLon');
      const eLatEl = document.getElementById('coordEndLat');
      const eLonEl = document.getElementById('coordEndLon');

      if (sLatEl) sLatEl.value = coords.startLat.toFixed(4);
      if (sLonEl) sLonEl.value = coords.startLon.toFixed(4);
      if (eLatEl) eLatEl.value = coords.endLat.toFixed(4);
      if (eLonEl) eLonEl.value = coords.endLon.toFixed(4);

      if (shouldRecalculate) {
        executeRouteCalculation();
      }
    });

    // Initialize Elevation & Slope Profile Chart
    initElevationChart();

    // Initialize 3-Step Guided Workflow Engine
    await initPlannerWorkflow();

    isPlannerInitialized = true;
  }

  // Redraw map with correct container dimensions
  setTimeout(resizeMap, 150);
}

/**
 * Pings backend server to warm up free-tier cold starts and update HUD badge
 */
async function checkServerHealth() {
  const badge = document.getElementById('serverStatusBadge');
  if (!badge) return;

  try {
    const res = await fetch('/api/presets', { method: 'GET', signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      badge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>ONLINE</span>
      `;
      badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50";
      badge.title = "Mission Server Online & Ready";
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
      <span>WAKING UP SERVER...</span>
    `;
    badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50";
    badge.title = "Waking up cloud mission server from cold standby...";

    // Retry once after 3 seconds
    setTimeout(checkServerHealth, 3500);
  }
}
