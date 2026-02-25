# Olbrain JavaScript SDK

Official JavaScript/TypeScript SDK for Olbrain Agent Cloud. Add AI agent chatbots to your website or application with a single line of code.

## 🚀 Quick Start

### For Websites (One-Line Integration)

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
</head>
<body>
  <h1>Welcome to my website</h1>

  <!-- ONE LINE: Load and initialize chat widget -->
  <script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/widget.widget.global.js"></script>
  <script>
    new OlbrainWidget.ChatWidget({
      agentId: 'your-agent-id',
      apiKey: 'sk_live_your_key'
    }).mount();
  </script>
</body>
</html>
```

### For npm Projects

```bash
npm install @olbrain/js-sdk
```

**Node.js Example:**
```javascript
import { AgentClient } from '@olbrain/js-sdk';

const client = new AgentClient({
  agentId: 'your-agent-id',
  apiKey: 'sk_live_your_key'
});

async function chat() {
  const sessionId = await client.createSession();
  const response = await client.sendAndWait(sessionId, 'Hello!');
  console.log(response.text);
}

chat();
```

## 📦 Installation

### Browser (Via CDN)

**Core API only:**
```html
<script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/index.global.js"></script>
<script>
  const client = new Olbrain.AgentClient({ agentId: '...', apiKey: '...' });
</script>
```

**With Chat Widget:**
```html
<script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/widget.widget.global.js"></script>
<script>
  new OlbrainWidget.ChatWidget({ agentId: '...', apiKey: '...' }).mount();
</script>
```

### npm / Node.js

```bash
npm install @olbrain/js-sdk

# For Node.js streaming support (optional)
npm install eventsource
```

### TypeScript

The SDK is written in TypeScript and includes full type definitions.

```typescript
import { AgentClient, ChatResponse } from '@olbrain/js-sdk';

const client = new AgentClient({ agentId: '...', apiKey: '...' });
const response: ChatResponse = await client.sendAndWait(sessionId, 'Hi!');
```

## 🎯 Core Concepts

### AgentClient

The main API client for communicating with Olbrain agents.

```javascript
const client = new AgentClient({
  agentId: 'your-agent-id',
  apiKey: 'sk_live_your_key',
  baseUrl: 'https://...', // Optional, defaults to production
});
```

### Sessions

Each conversation is managed through a session. Sessions maintain message history and context.

```javascript
// Create a new session
const sessionId = await client.createSession({
  title: 'My Chat',
  userId: 'user123',
  metadata: { custom: 'data' }
});

// Get session info
const session = await client.getSession(sessionId);

// Update session
await client.updateSession(sessionId, { title: 'New Title' });

// Delete session
await client.deleteSession(sessionId);
```

### Messaging

Send messages and receive responses.

```javascript
// Send and wait for response (blocking)
const response = await client.sendAndWait(sessionId, 'Your message', {
  timeout: 30000,
  metadata: { source: 'web' }
});

console.log(response.text);           // Agent's response
console.log(response.tokenUsage);     // Token usage stats
console.log(response.responseTimeMs); // Response latency

// Send without waiting (fire and forget)
await client.send(sessionId, 'Your message');
```

### Streaming (Real-time Messages)

Listen for messages in real-time via Server-Sent Events.

```javascript
// Start listening for messages
await client.listen(
  sessionId,
  (message) => {
    console.log(`${message.role}: ${message.content}`);
  },
  (error) => {
    console.error('Stream error:', error);
  }
);

// Send message (will be received via stream)
await client.send(sessionId, 'Tell me a story');

// Stop listening
client.stopListening(sessionId);
```

## 🎨 Chat Widget

Ready-to-use chat widget component for instant deployment.

### Basic Usage

```html
<script src="https://unpkg.com/@olbrain/js-sdk@latest/dist/widget.widget.global.js"></script>
<script>
  new OlbrainWidget.ChatWidget({
    agentId: 'your-agent-id',
    apiKey: 'sk_live_your_key'
  }).mount();
</script>
```

### Configuration Options

```javascript
new OlbrainWidget.ChatWidget({
  // Required
  agentId: 'your-agent-id',
  apiKey: 'sk_live_your_key',

  // UI Options
  position: 'bottom-right',        // 'bottom-right' | 'bottom-left' | 'custom'
  title: 'Chat with us',           // Widget header title
  greeting: 'Hi! How can I help?', // Initial greeting message
  placeholder: 'Type here...',     // Input placeholder text
  theme: 'light',                  // 'light' | 'dark' | 'auto'
  primaryColor: '#667eea',         // Brand color

  // Behavior
  autoOpen: false,                 // Auto-open on load
  persistSession: true,            // Save session in localStorage

  // Advanced
  target: document.body,           // Where to mount (selector or element)
  onMessage: (msg) => {},          // Custom message callback
  baseUrl: '...',                  // Custom API base URL
}).mount();
```

### Widget Methods

```javascript
const widget = new OlbrainWidget.ChatWidget({ agentId: '...', apiKey: '...' });

widget.mount();                     // Mount to page (required)
widget.unmount();                   // Remove from page
widget.open();                      // Open chat window
widget.close();                     // Close chat window
await widget.sendMessage('Hello!'); // Send message programmatically
```

## 📚 API Reference

### AgentClient Methods

#### Session Management

```javascript
// Create session
await client.createSession(options?: CreateSessionOptions): Promise<string>

// Get session info
await client.getSession(sessionId: string): Promise<SessionInfo>

// Update session
await client.updateSession(sessionId: string, updates: SessionUpdates): Promise<SessionInfo>

// Delete session
await client.deleteSession(sessionId: string): Promise<void>

// Get session messages
await client.getMessages(sessionId: string, limit?: number): Promise<Message[]>

// Get session statistics
await client.getSessionStats(sessionId: string): Promise<SessionStats>
```

#### Messaging

```javascript
// Send message and wait for response
await client.sendAndWait(
  sessionId: string,
  message: string,
  options?: SendOptions
): Promise<ChatResponse>

// Send message without waiting
await client.send(sessionId: string, message: string): Promise<void>
```

#### Streaming

```javascript
// Start listening for real-time messages
await client.listen(
  sessionId: string,
  onMessage: MessageCallback,
  onError?: ErrorCallback
): Promise<void>

// Stop listening
client.stopListening(sessionId: string): void
```

#### Lifecycle

```javascript
// Close client and cleanup resources
client.close(): void
```

### Type Definitions

```typescript
interface AgentConfig {
  agentId: string;
  apiKey: string;
  baseUrl?: string;
}

interface ChatResponse {
  text: string;
  sessionId: string;
  success: boolean;
  tokenUsage?: TokenUsage;
  modelUsed?: string;
  responseTimeMs?: number;
  error?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface SessionInfo {
  sessionId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  messageCount: number;
  userId?: string;
  metadata: Record<string, any>;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}
```

## 🔐 Error Handling

The SDK provides typed error classes for precise error handling.

```javascript
import {
  OlbrainError,
  AuthenticationError,
  SessionNotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  StreamingError
} from '@olbrain/js-sdk';

try {
  const response = await client.sendAndWait(sessionId, 'Hello!');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof SessionNotFoundError) {
    console.error(`Session ${error.sessionId} not found`);
  } else if (error instanceof OlbrainError) {
    console.error('API error:', error.message);
  }
}
```

## 📖 Examples

See the `examples/` directory for complete working examples:

- **Browser Examples:**
  - `examples/browser/chat-widget.html` - One-line widget embed
  - `examples/browser/api-client.html` - Core API usage
  - `examples/browser/streaming.html` - Real-time messaging

- **Node.js Examples:**
  - `examples/node/basic.js` - Basic usage
  - `examples/node/streaming.js` - Streaming with Node.js

- **TypeScript Examples:**
  - `examples/typescript/advanced.ts` - Advanced patterns with full type safety

## 🌐 Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📦 Build Outputs

The SDK includes multiple build formats for different use cases:

- **CJS** (`dist/index.js`) - CommonJS for Node.js
- **ESM** (`dist/index.mjs`) - ES Modules for modern tooling
- **UMD** (`dist/index.global.js`) - Universal Module for browsers and Node.js
- **UMD Widget** (`dist/widget.widget.global.js`) - Pre-built widget

## 🔧 Development

### Setup

```bash
npm install
npm run build
npm test
npm run typecheck
```

### Build

```bash
npm run build    # Production build
npm run dev      # Watch mode
npm run clean    # Clean dist/
```

### Testing

```bash
npm test         # Run tests
npm test -- --ui # Watch with UI
```

### Type Checking

```bash
npm run typecheck
```

## 📝 API Key Format

API keys start with specific prefixes:
- `sk_live_*` - Production secret key
- `org_live_*` - Organization key
- `sk_*` - Development secret key
- `org_*` - Development organization key

## 🚀 Performance

- **Bundle Size:** ~30KB for core API, ~50KB for widget (gzipped)
- **Zero Runtime Dependencies:** No external dependencies for browser builds
- **Optional Dependencies:** `eventsource` for Node.js streaming

## 🔄 Session Persistence

The widget automatically saves sessions to localStorage:

```javascript
// Auto-saved in localStorage as 'olbrain_widget_session_id'
// Sessions persist across page reloads by default
// Disable with: persistSession: false
```

## 🌟 Features

- ✅ One-line browser integration
- ✅ Full TypeScript support
- ✅ Real-time SSE streaming
- ✅ Session persistence
- ✅ Error handling with typed exceptions
- ✅ Customizable UI theme and colors
- ✅ Mobile responsive widget
- ✅ Keyboard shortcuts (Enter to send)
- ✅ Message history
- ✅ Token usage tracking
- ✅ Response latency metrics
- ✅ Automatic reconnection
- ✅ ARIA labels & accessibility

## 📄 License

MIT

## 🤝 Support

For issues, feature requests, or questions:

1. Check [existing issues](https://github.com/anthropics/olbrain-js-sdk/issues)
2. [Create a new issue](https://github.com/anthropics/olbrain-js-sdk/issues/new)
3. Visit the [Olbrain documentation](https://docs.olbrain.com)

## 📚 Related Resources

- [Python SDK](https://github.com/anthropics/olbrain-python-sdk)
- [Olbrain Documentation](https://docs.olbrain.com)
- [API Reference](https://docs.olbrain.com/api)
- [Getting Started Guide](https://docs.olbrain.com/getting-started)

---

Made with ❤️ by the Olbrain team
