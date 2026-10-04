/**
 * Martian Route & EVA Planner - Home Page Logic
 * Interactive counters, live route preview simulation, and quick CTAs.
 */

import { navigateTo } from '../router.js';
import { setSelectedStartPreset } from '../state.js';

export function initHomePage() {
  initMetricCounters();
  initQuickPresetTriggers();
}

/**
 * Animated number count-up for key mission metrics
 */
function initMetricCounters() {
  const counters = document.querySelectorAll('[data-counter-target]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  counters.forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const target = parseFloat(el.getAttribute('data-counter-target'));
  const decimals = parseInt(el.getAttribute('data-counter-decimals') || '0', 10);
  const suffix = el.getAttribute('data-counter-suffix') || '';
  const duration = 1200; // ms
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentVal = target * easeOut;

    el.textContent = currentVal.toFixed(decimals) + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = target.toFixed(decimals) + suffix;
    }
  }

  requestAnimationFrame(update);
}

/**
 * Connects quick featured route cards to planner with pre-selected presets
 */
function initQuickPresetTriggers() {
  document.querySelectorAll('[data-quick-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const presetData = {
        name: btn.getAttribute('data-preset-name'),
        lat: parseFloat(btn.getAttribute('data-preset-lat')),
        lon: parseFloat(btn.getAttribute('data-preset-lon'))
      };
      setSelectedStartPreset(presetData);
      navigateTo('/planner');
    });
  });
}
