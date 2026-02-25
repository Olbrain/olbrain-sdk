/**
 * HTML templates for the chat widget
 */

import { renderMarkdown } from './markdown';

export interface TemplateConfig {
  title: string;
  greeting: string;
  placeholder: string;
  theme: 'light' | 'dark' | 'auto';
}

/**
 * Main widget container template
 */
export function widgetContainerTemplate(config: TemplateConfig): string {
  const theme = config.theme === 'auto' ? 'light' : config.theme;
  return `
    <div class="olbrain-widget-container" data-theme="${theme}">
      <div class="olbrain-chat-widget">
        <div class="olbrain-chat-header">
          <div class="olbrain-chat-title">${escapeHtml(config.title)}</div>
          <button class="olbrain-close-btn" aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M15.898 4.045l-5.307 5.307 5.307 5.307c.39.39.39 1.025 0 1.415-.195.195-.45.292-.707.292-.257 0-.512-.097-.707-.292l-5.307-5.307-5.307 5.307c-.195.195-.45.292-.707.292-.257 0-.512-.097-.707-.292-.39-.39-.39-1.025 0-1.415l5.307-5.307-5.307-5.307c-.39-.39-.39-1.025 0-1.415.39-.39 1.025-.39 1.415 0l5.307 5.307 5.307-5.307c.39-.39 1.025-.39 1.415 0 .39.39.39 1.025 0 1.415z"/>
            </svg>
          </button>
        </div>
        <div class="olbrain-messages-container"></div>
        <div class="olbrain-input-area">
          <input
            type="text"
            class="olbrain-message-input"
            placeholder="${escapeHtml(config.placeholder)}"
            aria-label="Message input"
          />
          <button class="olbrain-send-btn" aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,17.8274344 C0.8376543,18.6129214 0.99,19.3984083 1.77946707,20 C2.41,20.52 3.50612381,20.3429026 4.13399899,20.0274254 L21.714504,3.40596059 C22.6563168,2.59128963 22.6563168,0.9563 21.714504,0.1416 L4.13399899,-0.4800539 C3.50612381,-0.4800539 2.40880848,0.0729863 1.77946707,0.7844625 C0.994041701,1.5699495 0.837158534,2.35644751 1.15159189,3.1419345 L3.03521743,7.39521227 C3.03521743,7.55230969 3.34915502,7.70940711 3.50612381,7.70940711 L16.6915026,8.49489406 C16.6915026,8.49489406 17.1272231,8.49489406 17.1272231,8.99410899 L17.1272231,11.8231405 C17.1272231,12.3223555 16.6915026,12.4744748 16.6915026,12.4744748 Z"/>
            </svg>
          </button>
        </div>
      </div>
      <button class="olbrain-toggle-btn" aria-label="Toggle chat widget">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * User message template
 */
export function userMessageTemplate(content: string, timestamp: string): string {
  return `
    <div class="olbrain-message olbrain-message-user">
      <div class="olbrain-message-content">${escapeHtml(content)}</div>
      <div class="olbrain-message-time">${formatTime(timestamp)}</div>
    </div>
  `;
}

/**
 * Assistant message template
 */
export function assistantMessageTemplate(content: string, timestamp: string): string {
  return `
    <div class="olbrain-message olbrain-message-assistant">
      <div class="olbrain-message-content markdown-content">${renderMarkdown(content)}</div>
      <div class="olbrain-message-time">${formatTime(timestamp)}</div>
    </div>
  `;
}

/**
 * Typing indicator template
 */
export function typingIndicatorTemplate(): string {
  return `
    <div class="olbrain-message olbrain-message-assistant">
      <div class="olbrain-typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
}

/**
 * Error message template
 */
export function errorMessageTemplate(error: string): string {
  return `
    <div class="olbrain-message olbrain-message-error">
      <div class="olbrain-message-content">Error: ${escapeHtml(error)}</div>
    </div>
  `;
}

/**
 * Welcome/greeting template
 */
export function greetingTemplate(greeting: string): string {
  return `
    <div class="olbrain-message olbrain-message-greeting">
      <div class="olbrain-message-content markdown-content">${renderMarkdown(greeting)}</div>
    </div>
  `;
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
 * Format timestamp to readable time
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}
