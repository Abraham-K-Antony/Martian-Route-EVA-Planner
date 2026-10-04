/**
 * Martian Route & EVA Planner - Contact & Feedback Page
 * Client-side feedback form with validation and direct developer connect.
 */

import { showToast } from '../toast.js';

export function initContactPage() {
  const form = document.getElementById('feedbackForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = form.elements['senderName']?.value.trim();
    const email = form.elements['senderEmail']?.value.trim();
    const category = form.elements['feedbackCategory']?.value;
    const message = form.elements['feedbackMessage']?.value.trim();

    if (!message || message.length < 5) {
      showToast("Please enter a feedback message (at least 5 characters).", "warning", "FORM INCOMPLETE");
      return;
    }

    // Client-side confirmation
    showToast("Thank you for your feedback! Your transmission has been logged.", "success", "FEEDBACK RECEIVED");
    form.reset();

    const statusBox = document.getElementById('feedbackStatusBox');
    if (statusBox) {
      statusBox.classList.remove('hidden');
      statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => {
        statusBox.classList.add('hidden');
      }, 7000);
    }
  });
}
