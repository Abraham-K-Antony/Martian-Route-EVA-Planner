/**
 * Martian Route & EVA Planner - Theme Engine
 * Manages light-first design system with dark-mode persistence and prefers-color-scheme support.
 */

const THEME_KEY = 'martian_eva_theme';

export function initTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const mobileToggleBtn = document.getElementById('mobileThemeToggleBtn');

  // Detect user preference or system default
  const savedTheme = localStorage.getItem(THEME_KEY);
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const activeTheme = savedTheme ? savedTheme : (systemPrefersDark ? 'dark' : 'light');
  applyTheme(activeTheme);

  // Attach event listeners
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
  if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener('click', toggleTheme);
  }

  // Listen to system color changes if not overridden
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  try {
    localStorage.setItem(THEME_KEY, newTheme);
  } catch (e) {
    console.warn("Unable to save theme in localStorage:", e);
  }
}

export function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
  }
  updateThemeIcons(isDark);
  
  // Dispatch custom event for map or chart redraws
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
}

function updateThemeIcons(isDark) {
  const sunIcons = document.querySelectorAll('.theme-icon-sun');
  const moonIcons = document.querySelectorAll('.theme-icon-moon');
  const themeLabels = document.querySelectorAll('.theme-label-text');

  sunIcons.forEach(el => el.classList.toggle('hidden', !isDark));
  moonIcons.forEach(el => el.classList.toggle('hidden', isDark));
  themeLabels.forEach(el => el.textContent = isDark ? 'Light Mode' : 'Dark Mode');
}
