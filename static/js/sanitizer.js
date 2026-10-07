/**
 * Martian Route & EVA Planner - HTML & Markdown Sanitizer
 * Strips dangerous HTML tags, attributes, and scripts to prevent XSS vulnerabilities.
 */

export function sanitizeHtml(rawHtml) {
  if (!rawHtml) return '';

  const temp = document.createElement('template');
  temp.innerHTML = rawHtml;
  const content = temp.content;

  // List of allowed tags for rich mission briefings
  const allowedTags = new Set([
    'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'mark'
  ]);

  // Recursively sanitize DOM nodes
  function cleanNode(node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();

        // Remove disallowed elements completely
        if (!allowedTags.has(tagName)) {
          // Replace tag with text content safely
          const text = document.createTextNode(child.textContent);
          node.replaceChild(text, child);
          continue;
        }

        // Clean attributes: remove on* event handlers, javascript: hrefs, style tags
        const attrs = Array.from(child.attributes);
        for (const attr of attrs) {
          const attrName = attr.name.toLowerCase();
          const attrVal = attr.value.trim().toLowerCase();

          if (
            attrName.startsWith('on') ||
            attrName === 'style' ||
            attrVal.startsWith('javascript:') ||
            attrVal.startsWith('data:') ||
            attrVal.startsWith('vbscript:')
          ) {
            child.removeAttribute(attr.name);
          }
        }

        cleanNode(child);
      }
    }
  }

  cleanNode(content);
  const container = document.createElement('div');
  container.appendChild(content);
  return container.innerHTML;
}

export function parseAndSanitizeMarkdown(markdownText) {
  if (!markdownText) return '';
  if (typeof window.marked !== 'undefined' && window.marked.parse) {
    try {
      const rawHtml = window.marked.parse(markdownText);
      return sanitizeHtml(rawHtml);
    } catch (e) {
      console.warn("Markdown parsing error, using plain text fallback:", e);
    }
  }

  // Fallback simple line-break formatter if marked is not yet loaded
  const escaped = markdownText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p class="whitespace-pre-line leading-relaxed">${escaped}</p>`;
}
