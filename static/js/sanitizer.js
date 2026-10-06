/**
 * Martian Route & EVA Planner - DOMPurify Sanitizer Integration
 * Uses industry-standard DOMPurify for strict XSS prevention.
 */

export function sanitizeHtml(rawHtml) {
  if (!rawHtml) return '';
  if (typeof window.DOMPurify !== 'undefined' && window.DOMPurify.sanitize) {
    return window.DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'mark'
      ],
      ALLOWED_ATTR: ['class', 'id', 'align'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg']
    });
  }
  
  // Safe textContent fallback if DOMPurify is loading
  const temp = document.createElement('div');
  temp.textContent = rawHtml;
  return temp.innerHTML;
}

export function parseAndSanitizeMarkdown(markdownText) {
  if (!markdownText) return '';
  let rawHtml = markdownText;
  if (typeof window.marked !== 'undefined' && window.marked.parse) {
    try {
      rawHtml = window.marked.parse(markdownText);
    } catch (e) {
      console.warn("Markdown parsing error:", e);
    }
  }
  return sanitizeHtml(rawHtml);
}
