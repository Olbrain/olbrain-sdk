/**
 * CSS styles for the chat widget
 * Exported as a string to be injected dynamically (no external stylesheet needed)
 */

export interface StyleConfig {
  primaryColor: string;
  theme: 'light' | 'dark' | 'auto';
}

/**
 * Generate widget CSS with customizable colors
 */
export function generateStyles(config: StyleConfig): string {
  const primary = config.primaryColor || '#4f46e5';
  const isDark = config.theme === 'dark';

  const bgColor = isDark ? '#1f2937' : '#ffffff';
  const textColor = isDark ? '#f3f4f6' : '#111827';
  const borderColor = isDark ? '#374151' : '#e5e7eb';
  const hoverBg = isDark ? '#111827' : '#f9fafb';

  return `
    .olbrain-widget-container {
      --primary-color: ${primary};
      --bg-color: ${bgColor};
      --text-color: ${textColor};
      --border-color: ${borderColor};
      --hover-bg: ${hoverBg};

      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .olbrain-widget-container * {
      box-sizing: border-box;
    }

    .olbrain-widget-container[data-theme="dark"] {
      color-scheme: dark;
    }

    .olbrain-widget-container[data-theme="light"] {
      color-scheme: light;
    }

    /* Toggle Button */
    .olbrain-toggle-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background-color: var(--primary-color);
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      z-index: 999999;
    }

    .olbrain-toggle-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .olbrain-toggle-btn:active {
      transform: scale(0.95);
    }

    .olbrain-toggle-btn.hidden {
      display: none;
    }

    /* Chat Widget Container */
    .olbrain-chat-widget {
      position: fixed;
      bottom: 100px;
      right: 24px;
      width: 420px;
      max-width: calc(100vw - 32px);
      height: 600px;
      max-height: calc(100vh - 140px);
      background-color: var(--bg-color);
      border-radius: 12px;
      box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
      display: flex;
      flex-direction: column;
      z-index: 999998;
      animation: slideUp 0.3s ease;
      opacity: 0;
      pointer-events: none;
      transform: translateY(20px);
    }

    .olbrain-chat-widget.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Chat Header */
    .olbrain-chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      border-radius: 12px 12px 0 0;
      background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 80%, black));
      color: white;
    }

    .olbrain-chat-title {
      font-size: 16px;
      font-weight: 600;
    }

    .olbrain-close-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .olbrain-close-btn:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }

    /* Messages Container */
    .olbrain-messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background-color: var(--bg-color);
    }

    .olbrain-messages-container::-webkit-scrollbar {
      width: 6px;
    }

    .olbrain-messages-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .olbrain-messages-container::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
    }

    .olbrain-messages-container::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--border-color) 80%, black);
    }

    /* Message */
    .olbrain-message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .olbrain-message-content {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 8px;
      word-wrap: break-word;
      line-height: 1.4;
      font-size: 14px;
    }

    /* User Message */
    .olbrain-message-user .olbrain-message-content {
      background-color: var(--primary-color);
      color: white;
      align-self: flex-end;
      border-radius: 18px 18px 4px 18px;
    }

    /* Assistant Message */
    .olbrain-message-assistant .olbrain-message-content {
      background-color: var(--hover-bg);
      color: var(--text-color);
      align-self: flex-start;
      border-radius: 18px 18px 18px 4px;
    }

    /* Greeting Message */
    .olbrain-message-greeting .olbrain-message-content {
      background-color: transparent;
      color: var(--text-color);
      align-self: center;
      padding: 8px 12px;
    }

    .olbrain-message-greeting .olbrain-message-content:not(.markdown-content) {
      font-style: italic;
      opacity: 0.7;
    }

    .olbrain-message-greeting .olbrain-message-content.markdown-content {
      opacity: 1;
    }

    /* Error Message */
    .olbrain-message-error .olbrain-message-content {
      background-color: #fee;
      color: #c33;
      align-self: flex-start;
    }

    .olbrain-message-time {
      font-size: 12px;
      color: var(--text-color);
      opacity: 0.6;
      padding: 0 16px;
    }

    /* Typing Indicator */
    .olbrain-typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }

    .olbrain-typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--text-color);
      opacity: 0.4;
      animation: typing 1.4s infinite;
    }

    .olbrain-typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .olbrain-typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 60%, 100% {
        opacity: 0.4;
        transform: translateY(0);
      }
      30% {
        opacity: 1;
        transform: translateY(-10px);
      }
    }

    /* Input Area */
    .olbrain-input-area {
      display: flex;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid var(--border-color);
      background-color: var(--bg-color);
      border-radius: 0 0 12px 12px;
    }

    .olbrain-message-input {
      flex: 1;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      font-family: inherit;
      background-color: var(--hover-bg);
      color: var(--text-color);
      transition: border-color 0.2s;
    }

    .olbrain-message-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 20%, transparent);
    }

    .olbrain-message-input::placeholder {
      color: var(--text-color);
      opacity: 0.5;
    }

    .olbrain-send-btn {
      background-color: var(--primary-color);
      border: none;
      color: white;
      border-radius: 8px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .olbrain-send-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 30%, transparent);
    }

    .olbrain-send-btn:active {
      transform: scale(0.95);
    }

    .olbrain-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    /* Markdown Content Styles */
    .markdown-content {
      line-height: 1.6 !important;
      color: var(--text-color) !important;
      display: block !important;
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4,
    .markdown-content h5,
    .markdown-content h6 {
      margin-top: 16px;
      margin-bottom: 8px;
      font-weight: 600;
      line-height: 1.3;
    }

    .markdown-content h1 {
      font-size: 1.5em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 4px;
    }

    .markdown-content h2 {
      font-size: 1.3em;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 4px;
    }

    .markdown-content h3 { font-size: 1.15em; }
    .markdown-content h4 { font-size: 1em; }
    .markdown-content h5 { font-size: 0.9em; }
    .markdown-content h6 { font-size: 0.85em; }

    .markdown-content p {
      margin-bottom: 12px !important;
      margin-top: 12px !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      padding: 0 !important;
      display: block !important;
    }

    .markdown-content p:first-child {
      margin-top: 0 !important;
    }

    .markdown-content ul,
    .markdown-content ol {
      margin-bottom: 12px !important;
      margin-top: 12px !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      padding-left: 2em !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      display: block !important;
    }

    .markdown-content ul:first-child,
    .markdown-content ol:first-child {
      margin-top: 0 !important;
    }

    .markdown-content ul {
      list-style-type: disc !important;
    }

    .markdown-content ol {
      list-style-type: decimal !important;
    }

    .markdown-content li {
      margin-bottom: 6px !important;
      margin-left: 0 !important;
      margin-top: 0 !important;
      padding-left: 0.5em !important;
      display: list-item !important;
      list-style-position: outside !important;
      color: var(--text-color) !important;
    }

    .markdown-content ul li {
      list-style-type: disc !important;
    }

    .markdown-content ol li {
      list-style-type: decimal !important;
    }

    .markdown-content ul li::marker {
      color: var(--primary-color);
    }

    .markdown-content ol li::marker {
      color: var(--primary-color);
      font-weight: 600;
    }

    .markdown-content code {
      background-color: ${isDark ? '#2d3748' : '#f7fafc'};
      color: ${isDark ? '#e53e3e' : '#d53f8c'};
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.875em;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    }

    .markdown-content pre {
      background-color: ${isDark ? '#1e1e1e' : '#f6f8fa'};
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      margin-bottom: 12px;
      border: 1px solid var(--border-color);
    }

    .markdown-content pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
      font-size: 0.875em;
    }

    .markdown-content blockquote {
      border-left: 4px solid var(--primary-color);
      background-color: ${isDark ? '#2d3748' : '#f7fafc'};
      padding: 8px 16px;
      margin: 12px 0;
      font-style: italic;
    }

    .markdown-content blockquote p {
      margin-bottom: 0;
    }

    .markdown-content a {
      color: var(--primary-color);
      text-decoration: none;
    }

    .markdown-content a:hover {
      text-decoration: underline;
    }

    .markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 12px;
      border: 1px solid var(--border-color);
    }

    .markdown-content th,
    .markdown-content td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    .markdown-content th {
      background-color: ${isDark ? '#374151' : '#f9fafb'};
      font-weight: 600;
    }

    .markdown-content tr:nth-child(even) {
      background-color: ${isDark ? '#2d3748' : '#f7fafc'};
    }

    .markdown-content hr {
      border: none;
      height: 2px;
      background-color: var(--border-color);
      margin: 16px 0;
    }

    .markdown-content img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 8px 0;
    }

    /* Syntax Highlighting - GitHub Light Theme */
    ${!isDark ? `
      .hljs {
        color: #24292e;
        background: #f6f8fa;
      }
      .hljs-doctag,
      .hljs-keyword,
      .hljs-meta .hljs-keyword,
      .hljs-template-tag,
      .hljs-template-variable,
      .hljs-type,
      .hljs-variable.language_ {
        color: #d73a49;
      }
      .hljs-title,
      .hljs-title.class_,
      .hljs-title.class_.inherited__,
      .hljs-title.function_ {
        color: #6f42c1;
      }
      .hljs-attr,
      .hljs-attribute,
      .hljs-literal,
      .hljs-meta,
      .hljs-number,
      .hljs-operator,
      .hljs-variable,
      .hljs-selector-attr,
      .hljs-selector-class,
      .hljs-selector-id {
        color: #005cc5;
      }
      .hljs-regexp,
      .hljs-string,
      .hljs-meta .hljs-string {
        color: #032f62;
      }
      .hljs-built_in,
      .hljs-symbol {
        color: #e36209;
      }
      .hljs-comment,
      .hljs-code,
      .hljs-formula {
        color: #6a737d;
      }
    ` : `
      .hljs {
        color: #e1e4e8;
        background: #1e1e1e;
      }
      .hljs-doctag,
      .hljs-keyword,
      .hljs-meta .hljs-keyword,
      .hljs-template-tag,
      .hljs-template-variable,
      .hljs-type,
      .hljs-variable.language_ {
        color: #f97583;
      }
      .hljs-title,
      .hljs-title.class_,
      .hljs-title.class_.inherited__,
      .hljs-title.function_ {
        color: #b392f0;
      }
      .hljs-attr,
      .hljs-attribute,
      .hljs-literal,
      .hljs-meta,
      .hljs-number,
      .hljs-operator,
      .hljs-variable,
      .hljs-selector-attr,
      .hljs-selector-class,
      .hljs-selector-id {
        color: #79b8ff;
      }
      .hljs-regexp,
      .hljs-string,
      .hljs-meta .hljs-string {
        color: #85e89d;
      }
      .hljs-built_in,
      .hljs-symbol {
        color: #ffb86c;
      }
      .hljs-comment,
      .hljs-code,
      .hljs-formula {
        color: #6a737d;
      }
    `}

    /* Mobile Responsive */
    @media (max-width: 480px) {
      .olbrain-chat-widget {
        width: calc(100vw - 32px);
        height: calc(100vh - 140px);
        bottom: 100px;
        right: 16px;
        border-radius: 8px;
      }

      .olbrain-toggle-btn {
        width: 48px;
        height: 48px;
        bottom: 20px;
        right: 16px;
      }

      .olbrain-message-content {
        max-width: 90%;
      }

      .markdown-content pre {
        padding: 8px;
        font-size: 0.75em;
      }
    }
  `;
}
