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
import { initPlannerWorkflow, executeRouteCalculation, updateCoordinateInputs } from './stepper.js';

console.log(
  "%c Martian Route & EVA Planner %c v2.1 Modular Engine by Abraham K Antony ",
  "background: #2563EB; color: #FFFFFF; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
  "background: #131B2E; color: #60A5FA; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;"
);

let isPlannerInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Design System & Theme Persistence
  initTheme();

  // 2. Initialize Clean SPA Router
  initRouter();

  // 3. Register Page Navigated Event Listener
  window.addEventListener('pageNavigated', (e) => {
    const { path, viewId } = e.detail;
    handlePageViewActivation(path, viewId);
  });

  // 4. Initial Page Activation based on current URL
  handlePageViewActivation(window.location.pathname, 'view-home');

  // 5. Initialize Smooth Fade-Up on Scroll
  initScrollReveal();

  // 6. Check Mission Server Health & Warm Up Free-Tier Backend
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
  if (path === '/' || path === '/home' || viewId === 'view-home') {
    initHomePage();
  } else if (path === '/planner' || viewId === 'view-planner') {
    activatePlannerView();
  } else if (path === '/mission-sites' || viewId === 'view-mission-sites') {
    initMissionSitesPage();
  } else if (path === '/about' || viewId === 'view-about') {
    initAboutPage();
  } else if (path === '/contact' || viewId === 'view-contact') {
    initContactPage();
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
      updateCoordinateInputs(coords.startLat, coords.startLon, coords.endLat, coords.endLon);

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
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="font-bold tracking-wider text-emerald-400">NOMINAL [99.8%]</span>
      `;
      badge.className = "hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 backdrop-blur-md shadow-sm";
      badge.title = "Mission Server Online & Ready";
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
      <span class="font-bold tracking-wider text-amber-300">WAKING UP SERVER...</span>
    `;
    badge.className = "hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 backdrop-blur-md shadow-sm";
    badge.title = "Waking up cloud mission server from cold standby...";

    // Retry once after 3.5 seconds
    setTimeout(checkServerHealth, 3500);
  }
}
