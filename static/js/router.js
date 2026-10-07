/**
 * Martian Route & EVA Planner - SPA Router
 * Provides clean URL navigation with HTML5 History API & hash fallback.
 */

const ROUTES = {
  '/': { title: 'Martian Route & EVA Planner — Jezero Crater Traversal Engine', viewId: 'view-home' },
  '/home': { title: 'Martian Route & EVA Planner — Jezero Crater Traversal Engine', viewId: 'view-home' },
  '/planner': { title: 'EVA Mission Planner — Jezero Crater | Martian Route', viewId: 'view-planner' },
  '/route-analysis': { title: 'Route Analysis & Heuristics | Martian Route', viewId: 'view-route-analysis' },
  '/how-it-works': { title: 'How It Works — Terrain Models & Cost Functions | Martian Route', viewId: 'view-how-it-works' },
  '/mission-sites': { title: 'Mission Sites & Waypoints — Jezero Crater | Martian Route', viewId: 'view-mission-sites' },
  '/about': { title: 'About the Project & Team | Martian Route & EVA Planner', viewId: 'view-about' },
  '/contact': { title: 'Contact & Feedback | Martian Route & EVA Planner', viewId: 'view-contact' }
};

export function initRouter() {
  // Handle link clicks with [data-nav]
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-nav]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (href && (href.startsWith('/') || href.startsWith('#'))) {
      e.preventDefault();
      navigateTo(href);
    }
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    resolveRoute();
  });

  // Handle mobile menu close button / drawer backdrop
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenuCloseBtn = document.getElementById('mobileMenuCloseBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const mobileBackdrop = document.getElementById('mobileBackdrop');

  if (mobileMenuBtn && mobileDrawer && mobileBackdrop) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileDrawer.classList.remove('translate-x-full');
      mobileBackdrop.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    });

    const closeMobileMenu = () => {
      mobileDrawer.classList.add('translate-x-full');
      mobileBackdrop.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    };

    if (mobileMenuCloseBtn) mobileMenuCloseBtn.addEventListener('click', closeMobileMenu);
    mobileBackdrop.addEventListener('click', closeMobileMenu);

    // Also close mobile drawer when any mobile nav link is clicked
    document.querySelectorAll('#mobileDrawer a[data-nav]').forEach(el => {
      el.addEventListener('click', closeMobileMenu);
    });
  }

  // Initial route resolution
  resolveRoute();
}

export function navigateTo(path) {
  // Clean hash if present
  let cleanPath = path;
  if (cleanPath.startsWith('#/')) {
    cleanPath = cleanPath.slice(1);
  } else if (cleanPath.startsWith('#')) {
    cleanPath = '/' + cleanPath.slice(1);
  }

  if (!ROUTES[cleanPath]) {
    cleanPath = '/';
  }

  if (window.location.pathname !== cleanPath) {
    window.history.pushState(null, '', cleanPath);
  }

  resolveRoute(cleanPath);
}

export function resolveRoute(explicitPath = null) {
  let path = explicitPath || window.location.pathname;
  
  // Check hash fallback (e.g. #/planner or #planner)
  if (window.location.hash && window.location.hash.length > 1) {
    const hashRoute = window.location.hash.replace(/^#\/?/, '/');
    if (ROUTES[hashRoute]) {
      path = hashRoute;
    }
  }

  if (!ROUTES[path]) {
    path = '/';
  }

  const routeConfig = ROUTES[path];

  // Update Page Title
  document.title = routeConfig.title;

  // Toggle View Containers
  const allViews = document.querySelectorAll('.page-view');
  allViews.forEach(view => {
    if (view.id === routeConfig.viewId) {
      view.classList.remove('hidden');
      view.classList.add('animate-fade-in');
    } else {
      view.classList.add('hidden');
      view.classList.remove('animate-fade-in');
    }
  });

  // Update Active Link State in Navbar & Mobile Drawer
  document.querySelectorAll('a[data-nav]').forEach(link => {
    const href = link.getAttribute('href');
    const isMatch = href === path || (path === '/' && (href === '/' || href === '/home'));
    
    if (link.classList.contains('nav-desktop-link')) {
      if (isMatch) {
        link.className = 'nav-desktop-link text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 transition-colors';
      } else {
        link.className = 'nav-desktop-link text-xs font-medium px-3 py-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800/60 transition-colors';
      }
    } else if (link.classList.contains('nav-mobile-link')) {
      if (isMatch) {
        link.className = 'nav-mobile-link flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-semibold text-sm transition-colors';
      } else {
        link.className = 'nav-mobile-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 font-medium text-sm transition-colors';
      }
    }
  });

  // Scroll to top on page navigation
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Dispatch custom route event for views to listen to
  window.dispatchEvent(new CustomEvent('pageNavigated', { detail: { path, viewId: routeConfig.viewId } }));
}
