/**
 * Markdown rendering module for chat widget
 * Uses marked.js for markdown parsing and highlight.js for code syntax highlighting
 */

import { marked } from 'marked';
import hljs from 'highlight.js';

/**
 * Initialize markdown renderer with syntax highlighting
 */
function initializeMarked(): void {
  // Configure marked options
  marked.setOptions({
    breaks: true,  // Convert \n to <br>
    gfm: true,     // GitHub Flavored Markdown
    highlight: function(code: string, lang: string): string {
      // Syntax highlighting for code blocks
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          console.warn('Highlight.js error for language', lang, e);
          return code;
        }
      }
      // Fallback: no highlighting
      return code;
    }
  });
}

// Initialize on module load
initializeMarked();

/**
 * Render markdown content to HTML with proper escaping
 * Falls back to escaped text if markdown parsing fails
 */
export function renderMarkdown(content: string): string {
  try {
    const html = marked.parse(content) as string;
    // Sanitize the HTML to prevent XSS while allowing safe markdown formatting
    return sanitizeHtml(html);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Fallback to escaped HTML
    return escapeHtml(content);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitize HTML to allow safe markdown tags but prevent XSS
 * This is a basic approach that whitelists common markdown tags
 */
function sanitizeHtml(html: string): string {
  // Create a temporary container to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove potentially dangerous elements/attributes
  const dangerousElements = temp.querySelectorAll('script, iframe, object, embed');
  dangerousElements.forEach(el => el.remove());

  // Remove event handlers from all elements
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove all event listener attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });

    // Remove javascript: protocol from href and src
    ['href', 'src'].forEach(attr => {
      const value = el.getAttribute(attr);
      if (value && value.toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr);
      }
    });
  });

  return temp.innerHTML;
}
