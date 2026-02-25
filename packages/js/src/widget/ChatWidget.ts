/**
 * ChatWidget - Ready-to-use chat widget component
 * Combines AgentClient with UI for one-line integration
 */

import { AgentClient } from '../core/client';
import { WidgetConfig, Message } from '../core/types';
import {
  widgetContainerTemplate,
  userMessageTemplate,
  assistantMessageTemplate,
  typingIndicatorTemplate,
  errorMessageTemplate,
  greetingTemplate,
} from './templates';
import { generateStyles } from './styles';

const DEFAULT_GREETING = 'Hi! How can I help you today?';
const DEFAULT_TITLE = 'Chat with us';
const DEFAULT_PLACEHOLDER = 'Type your message...';
const DEFAULT_PRIMARY_COLOR = '#4f46e5';
const SESSION_STORAGE_KEY = 'olbrain_widget_session_id';

/**
 * Ready-to-use chat widget for websites
 */
export class ChatWidget {
  private config: Required<WidgetConfig>;
  private client: AgentClient;
  private sessionId: string | null = null;
  private container: HTMLElement | null = null;
  private chatWidget: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private messageInput: HTMLInputElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private isOpen: boolean = false;
  private isWaitingForResponse: boolean = false;

  constructor(config: WidgetConfig) {
    this.config = this._normalizeConfig(config);
    this.client = new AgentClient({
      agentId: config.agentId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  /**
   * Mount widget to the page
   */
  async mount(target?: HTMLElement | string): Promise<void> {
    // Load styles
    this._injectStyles();

    // Find or create container
    if (target) {
      if (typeof target === 'string') {
        this.container = document.querySelector(target);
        if (!this.container) {
          throw new Error(`Element with selector "${target}" not found`);
        }
      } else {
        this.container = target;
      }
    } else {
      this.container = document.body;
    }

    // Render widget
    this._render();
    this._attachEventListeners();

    // Load or create session
    await this._initializeSession();

    // Show greeting message
    this._showGreeting();

    // Auto-open if configured
    if (this.config.autoOpen) {
      this.open();
    }
  }

  /**
   * Unmount widget from the page
   */
  unmount(): void {
    this.client.stopListening(this.sessionId || '');
    this.client.close();

    if (this.container) {
      const wrapper = this.container.querySelector('.olbrain-widget-container');
      if (wrapper) {
        wrapper.remove();
      }
    }

    this.container = null;
  }

  /**
   * Open chat window
   */
  open(): void {
    if (this.chatWidget) {
      this.chatWidget.classList.add('open');
      this.isOpen = true;
      if (this.messageInput) {
        this.messageInput.focus();
      }
    }
  }

  /**
   * Close chat window
   */
  close(): void {
    if (this.chatWidget) {
      this.chatWidget.classList.remove('open');
      this.isOpen = false;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(text: string): Promise<void> {
    if (!text.trim() || !this.sessionId || this.isWaitingForResponse) {
      return;
    }

    // Add user message to UI
    this._addMessageToUI(text, 'user');

    // Clear input
    if (this.messageInput) {
      this.messageInput.value = '';
    }

    this.isWaitingForResponse = true;

    try {
      // Show typing indicator
      this._showTypingIndicator();

      // Send message and get response
      const response = await this.client.sendAndWait(this.sessionId, text);

      // Remove typing indicator
      this._removeTypingIndicator();

      if (response.success && response.text) {
        this._addMessageToUI(response.text, 'assistant');
      } else if (response.error) {
        this._showError(response.error);
      }
    } catch (error) {
      this._removeTypingIndicator();
      this._showError((error as Error).message);
    } finally {
      this.isWaitingForResponse = false;
    }
  }

  /**
   * Normalize configuration with defaults
   */
  private _normalizeConfig(config: WidgetConfig): Required<WidgetConfig> {
    return {
      agentId: config.agentId,
      apiKey: config.apiKey,
      position: config.position || 'bottom-right',
      theme: config.theme || 'auto',
      primaryColor: config.primaryColor || DEFAULT_PRIMARY_COLOR,
      title: config.title || DEFAULT_TITLE,
      greeting: config.greeting || DEFAULT_GREETING,
      placeholder: config.placeholder || DEFAULT_PLACEHOLDER,
      autoOpen: config.autoOpen ?? false,
      persistSession: config.persistSession ?? true,
      target: config.target || document.body,
      onMessage: config.onMessage || (() => {}),
      baseUrl: config.baseUrl || '',
    };
  }

  /**
   * Inject widget styles into the page
   */
  private _injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById('olbrain-widget-styles')) {
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'olbrain-widget-styles';
    styleEl.textContent = generateStyles({
      primaryColor: this.config.primaryColor,
      theme: this.config.theme,
    });

    document.head.appendChild(styleEl);
  }

  /**
   * Render widget HTML
   */
  private _render(): void {
    if (!this.container) return;

    const html = widgetContainerTemplate({
      title: this.config.title,
      greeting: this.config.greeting,
      placeholder: this.config.placeholder,
      theme: this.config.theme,
    });

    this.container.insertAdjacentHTML('beforeend', html);

    // Get references to widget elements
    const wrapper = this.container.querySelector('.olbrain-widget-container');
    if (wrapper) {
      this.chatWidget = wrapper.querySelector('.olbrain-chat-widget');
      this.toggleBtn = wrapper.querySelector('.olbrain-toggle-btn');
      this.messagesContainer = wrapper.querySelector('.olbrain-messages-container');
      this.messageInput = wrapper.querySelector('.olbrain-message-input');
      this.sendBtn = wrapper.querySelector('.olbrain-send-btn');
    }
  }

  /**
   * Attach event listeners
   */
  private _attachEventListeners(): void {
    // Toggle button
    this.toggleBtn?.addEventListener('click', () => {
      this.isOpen ? this.close() : this.open();
      this.toggleBtn?.classList.toggle('hidden', this.isOpen);
    });

    // Close button
    this.chatWidget
      ?.querySelector('.olbrain-close-btn')
      ?.addEventListener('click', () => {
        this.close();
        if (this.toggleBtn) {
          this.toggleBtn.classList.remove('hidden');
        }
      });

    // Send button
    this.sendBtn?.addEventListener('click', () => {
      if (this.messageInput) {
        this.sendMessage(this.messageInput.value);
      }
    });

    // Message input enter key
    this.messageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.messageInput) {
          this.sendMessage(this.messageInput.value);
        }
      }
    });

    // Disable send button while waiting
    this.messageInput?.addEventListener('input', () => {
      if (this.sendBtn) {
        this.sendBtn.disabled = this.isWaitingForResponse;
      }
    });
  }

  /**
   * Initialize session (load or create)
   */
  private async _initializeSession(): Promise<void> {
    // Try to load saved session
    if (this.config.persistSession) {
      const savedSessionId = this._getStoredSessionId();
      if (savedSessionId) {
        try {
          await this.client.getSession(savedSessionId);
          this.sessionId = savedSessionId;
          return;
        } catch {
          // Session invalid, create new one
        }
      }
    }

    // Create new session
    try {
      this.sessionId = await this.client.createSession({
        title: 'Widget Chat Session',
        metadata: {
          source: 'chat_widget',
        },
      });

      if (this.config.persistSession) {
        this._storeSessionId(this.sessionId);
      }
    } catch (error) {
      this._showError(`Failed to create session: ${(error as Error).message}`);
    }
  }

  /**
   * Show greeting message
   */
  private _showGreeting(): void {
    if (this.messagesContainer) {
      const html = greetingTemplate(this.config.greeting);
      this.messagesContainer.insertAdjacentHTML('beforeend', html);
      this._scrollToBottom();
    }
  }

  /**
   * Add message to UI
   */
  private _addMessageToUI(content: string, role: 'user' | 'assistant'): void {
    if (!this.messagesContainer) return;

    const timestamp = new Date().toISOString();
    const html =
      role === 'user'
        ? userMessageTemplate(content, timestamp)
        : assistantMessageTemplate(content, timestamp);

    this.messagesContainer.insertAdjacentHTML('beforeend', html);
    this._scrollToBottom();

    // Call custom callback if provided
    if (this.config.onMessage) {
      this.config.onMessage({
        role,
        content,
        timestamp,
        metadata: {},
      });
    }
  }

  /**
   * Show typing indicator
   */
  private _showTypingIndicator(): void {
    if (!this.messagesContainer) return;

    const html = typingIndicatorTemplate();
    this.messagesContainer.insertAdjacentHTML('beforeend', html);
    this._scrollToBottom();
  }

  /**
   * Remove typing indicator
   */
  private _removeTypingIndicator(): void {
    const indicator = this.messagesContainer?.querySelector('.olbrain-typing-indicator');
    if (indicator) {
      indicator.closest('.olbrain-message')?.remove();
    }
  }

  /**
   * Show error message
   */
  private _showError(error: string): void {
    if (!this.messagesContainer) return;

    const html = errorMessageTemplate(error);
    this.messagesContainer.insertAdjacentHTML('beforeend', html);
    this._scrollToBottom();
  }

  /**
   * Scroll to bottom of messages
   */
  private _scrollToBottom(): void {
    if (this.messagesContainer) {
      setTimeout(() => {
        this.messagesContainer!.scrollTop = this.messagesContainer!.scrollHeight;
      }, 0);
    }
  }

  /**
   * Store session ID in localStorage
   */
  private _storeSessionId(sessionId: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      }
    } catch {
      // localStorage not available
    }
  }

  /**
   * Get stored session ID from localStorage
   */
  private _getStoredSessionId(): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // localStorage not available
    }
    return null;
  }
}
