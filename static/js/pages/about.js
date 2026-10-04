/**
 * Martian Route & EVA Planner - About Page & Team Card Component
 * Easily add new team members by adding objects to the TEAM_MEMBERS array below.
 */

export const TEAM_MEMBERS = [
  {
    name: "Abraham K. Antony (Abru)",
    role: "AI & Robotics Engineer",
    location: "Kerala, India",
    focus: "Focus areas: robotics, embedded systems, AI-powered applications and automation.",
    github: "https://github.com/Abraham-K-Antony"
  }
];

export function initAboutPage() {
  const container = document.getElementById('teamContainer');
  if (!container) return;

  container.innerHTML = TEAM_MEMBERS.map(member => `
    <div class="bg-white dark:bg-[#131B2E] rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6">
      <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white text-2xl font-bold font-mono shadow-lg shrink-0">
        ${member.name.split(' ').map(n => n[0]).join('').slice(0, 3)}
      </div>
      <div class="space-y-2 text-center sm:text-left flex-1">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">${member.name}</h3>
        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <span class="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">${member.role}</span>
          <span class="text-xs text-gray-400">•</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">${member.location}</span>
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          ${member.focus}
        </p>
        <div class="pt-2 flex items-center justify-center sm:justify-start">
          <a href="${member.github}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-semibold transition-colors">
            <i class="fa-brands fa-github"></i> GitHub Profile
          </a>
        </div>
      </div>
    </div>
  `).join('');
}
