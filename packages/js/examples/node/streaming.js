/**
 * Streaming example for Node.js
 * Demonstrates real-time message delivery via Server-Sent Events
 *
 * Usage: npm install eventsource
 *        node streaming.js
 */

import { AgentClient } from '@olbrain/js-sdk';

const agentId = process.env.OLBRAIN_AGENT_ID || 'demo-agent';
const apiKey = process.env.OLBRAIN_API_KEY || 'sk_live_demo';

async function main() {
  const client = new AgentClient({
    agentId,
    apiKey,
  });

  try {
    console.log('🔄 Olbrain Streaming Example\n');

    // Create session
    console.log('Creating session...');
    const sessionId = await client.createSession({
      title: 'Node.js Streaming Example',
    });
    console.log(`✓ Session created: ${sessionId}\n`);

    // Set up message listener
    console.log('Setting up streaming listener...');
    const messageLog = [];

    await client.listen(
      sessionId,
      (message) => {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        console.log(`\n[${timestamp}] ${message.role.toUpperCase()}`);
        console.log(message.content);
        messageLog.push(message);
      },
      (error) => {
        console.error('\n⚠️ Streaming Error:', error.message);
      }
    );

    console.log('✓ Streaming listener active. Ready to receive messages.\n');

    // Send first message
    console.log('Sending message: "Hello, tell me about AI"');
    await client.send(sessionId, 'Hello, tell me about AI');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send another message
    console.log('\nSending message: "What are the applications?"');
    await client.send(sessionId, 'What are the applications?');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Display summary
    console.log('\n📊 Message Summary:');
    console.log(`Total messages: ${messageLog.length}`);

    const userMessages = messageLog.filter((m) => m.role === 'user');
    const assistantMessages = messageLog.filter((m) => m.role === 'assistant');

    console.log(`User messages: ${userMessages.length}`);
    console.log(`Assistant messages: ${assistantMessages.length}`);

    // Stop listening
    console.log('\n🛑 Stopping stream...');
    client.stopListening(sessionId);

    console.log('✅ Example completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
