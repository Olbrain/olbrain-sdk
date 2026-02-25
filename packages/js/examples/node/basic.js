/**
 * Basic Node.js example using Olbrain SDK
 *
 * Usage: node basic.js
 * or: OLBRAIN_AGENT_ID=your-id OLBRAIN_API_KEY=sk_live_xxx node basic.js
 */

import { AgentClient } from '@olbrain/js-sdk';

// Get credentials from environment variables
const agentId = process.env.OLBRAIN_AGENT_ID || 'demo-agent';
const apiKey = process.env.OLBRAIN_API_KEY || 'sk_live_demo';

async function main() {
  // Initialize the client
  const client = new AgentClient({
    agentId,
    apiKey,
  });

  try {
    console.log('🤖 Olbrain Node.js Example\n');

    // Create a new session
    console.log('Creating session...');
    const sessionId = await client.createSession({
      title: 'Node.js Example Session',
      userId: 'user123',
      metadata: {
        source: 'nodejs_example',
      },
    });
    console.log(`✓ Session created: ${sessionId}\n`);

    // Send a message and wait for response
    console.log('Sending message: "What is machine learning?"');
    const response = await client.sendAndWait(
      sessionId,
      'What is machine learning?'
    );

    console.log('\n📝 Response:');
    console.log(response.text);

    if (response.tokenUsage) {
      console.log(
        `\n📊 Token Usage: ${response.tokenUsage.totalTokens} total tokens`
      );
    }

    if (response.responseTimeMs) {
      console.log(`⏱️ Response time: ${response.responseTimeMs}ms`);
    }

    // Get session information
    console.log('\n📋 Session Info:');
    const session = await client.getSession(sessionId);
    console.log(`Title: ${session.title}`);
    console.log(`Status: ${session.status}`);
    console.log(`Messages: ${session.messageCount}`);

    // Get messages from session
    console.log('\n💬 Recent Messages:');
    const messages = await client.getMessages(sessionId, 10);
    messages.forEach((msg) => {
      console.log(`${msg.role.toUpperCase()}: ${msg.content.substring(0, 60)}...`);
    });

    // Get session statistics
    console.log('\n📈 Session Stats:');
    const stats = await client.getSessionStats(sessionId);
    console.log(`Total Tokens Used: ${stats.totalTokens}`);
    console.log(`Messages: ${stats.messageCount}`);

    console.log('\n✅ Example completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    // Always close the client when done
    client.close();
  }
}

main();
