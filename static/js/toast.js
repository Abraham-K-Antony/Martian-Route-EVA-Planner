/**
 * Martian Route & EVA Planner - Toast Notification Engine
 * Displays accessible, accessible, timed notifications for operations and errors.
 */

export function showToast(message, type = 'info', title = 'MISSION CONTROL') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.className = `pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl backdrop-blur-md border transition-all duration-300 transform translate-y-3 opacity-0 text-xs ${
    type === 'success'
      ? 'bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-100 border-emerald-300 dark:border-emerald-700/60'
      : type === 'warning'
      ? 'bg-amber-50/95 dark:bg-amber-950/90 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700/60'
      : type === 'error'
      ? 'bg-red-50/95 dark:bg-red-950/90 text-red-900 dark:text-red-100 border-red-300 dark:border-red-700/60'
      : 'bg-white/95 dark:bg-gray-800/95 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700'
  }`;

  const iconMarkup = type === 'success'
    ? '<i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400 text-sm mt-0.5"></i>'
    : type === 'warning'
    ? '<i class="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5"></i>'
    : type === 'error'
    ? '<i class="fa-solid fa-circle-xmark text-red-600 dark:text-red-400 text-sm mt-0.5"></i>'
    : '<i class="fa-solid fa-circle-info text-blue-600 dark:text-blue-400 text-sm mt-0.5"></i>';

  toast.innerHTML = `
    <div>${iconMarkup}</div>
    <div class="flex-1">
      <div class="font-bold font-mono tracking-wider text-[10px] uppercase opacity-80 mb-0.5">${title}</div>
      <div class="leading-relaxed">${message}</div>
    </div>
    <button type="button" class="text-gray-400 hover:text-gray-700 dark:hover:text-white p-0.5" aria-label="Dismiss">
      <i class="fa-solid fa-xmark text-xs"></i>
    </button>
  `;

  toast.querySelector('button').addEventListener('click', () => {
    dismissToast(toast);
  });

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-3', 'opacity-0');
  });

  // Auto-dismiss after 4.5 seconds
  setTimeout(() => {
    dismissToast(toast);
  }, 4500);
}

function dismissToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.add('opacity-0', 'translate-y-2');
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 300);
}
