"""
Basic usage examples for the Olbrain Python SDK.

This example demonstrates the fundamental features of the SDK including:
- Client initialization
- Session creation
- Sending messages (sync and streaming)
- Session management
- Error handling
"""

import os
from olbrain import AgentClient, ChatResponse, SessionInfo
from olbrain.exceptions import (
    OlbrainError,
    AuthenticationError,
    SessionNotFoundError,
    NetworkError
)


def main():
    """Basic usage example."""

    # Get credentials from environment variables
    api_key = os.getenv("OLBRAIN_API_KEY", "sk_live_your-api-key-here")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "your-agent-id-here")
    # Optional: custom agent URL (auto-constructed from agent_id if not provided)
    agent_url = os.getenv("OLBRAIN_AGENT_URL")

    if api_key == "sk_live_your-api-key-here" or agent_id == "your-agent-id-here":
        print("Please set OLBRAIN_API_KEY and OLBRAIN_AGENT_ID environment variables")
        print()
        print("Example:")
        print("  export OLBRAIN_API_KEY=sk_live_your_key_here")
        print("  export OLBRAIN_AGENT_ID=your-agent-id")
        return

    try:
        # Initialize the client
        client = AgentClient(
            agent_id=agent_id,
            api_key=api_key,
            agent_url=agent_url  # Optional - uses default Cloud Run URL if not provided
        )
        print(f"Client initialized for agent {agent_id}")
        print(f"Agent URL: {client.agent_url}")

        # -----------------------------------------------------------------
        # Example 1: Synchronous messaging (request-response pattern)
        # -----------------------------------------------------------------
        print("\n--- Example 1: Synchronous Messaging ---")

        # Create a session
        session_id = client.create_session(
            title="Basic Demo Chat",
            user_id="demo-user-123",
            mode="production"
        )
        print(f"Session created: {session_id}")

        # Send a message and wait for response
        response = client.send_and_wait(session_id, "Hello! Can you introduce yourself?")

        print(f"Agent: {response.text}")
        if response.token_usage:
            print(f"Tokens used: {response.token_usage.total_tokens}")

        # Send another message in the same session
        response2 = client.send_and_wait(session_id, "What can you help me with?")
        print(f"Agent: {response2.text}")

        # -----------------------------------------------------------------
        # Example 2: Real-time streaming (callback pattern)
        # -----------------------------------------------------------------
        print("\n--- Example 2: Real-time Streaming ---")

        # Define a callback for incoming messages
        def on_message(msg):
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            print(f"[{role}]: {content}")

        # Create session with streaming enabled
        streaming_session_id = client.create_session(
            on_message=on_message,  # Providing callback enables streaming
            title="Streaming Demo",
            user_id="demo-user-123"
        )
        print(f"Streaming session created: {streaming_session_id}")

        # Send message - response arrives via callback
        client.send(streaming_session_id, "Tell me a short joke")

        # In a real app, you would call client.run() to block and process messages
        # For this demo, we'll just wait briefly
        import time
        time.sleep(5)  # Wait for streaming response

        # -----------------------------------------------------------------
        # Example 3: Session management
        # -----------------------------------------------------------------
        print("\n--- Example 3: Session Management ---")

        # Get session details
        info = client.get_session(session_id)
        print(f"Session title: {info.title}")
        print(f"Message count: {info.message_count}")
        print(f"Status: {info.status}")

        # Update session
        updated = client.update_session(session_id, title="Renamed Demo Chat")
        print(f"Updated title: {updated.title}")

        # Get session stats
        stats = client.get_session_stats(session_id)
        print(f"Session stats: {stats.get('stats', {})}")

        # Get message history
        messages = client.get_messages(session_id, limit=10)
        print(f"Retrieved {len(messages.get('messages', []))} messages")

        # -----------------------------------------------------------------
        # Example 4: Using model override
        # -----------------------------------------------------------------
        print("\n--- Example 4: Model Override ---")

        # Send message with specific model
        response = client.send(
            session_id,
            "Explain quantum computing in one sentence",
            model="gpt-4"  # Override default model
        )
        print(f"Response: {response.get('response', '')}")

        # -----------------------------------------------------------------
        # Cleanup
        # -----------------------------------------------------------------
        print("\n--- Cleanup ---")

        # Archive sessions when done
        client.delete_session(session_id)
        client.delete_session(streaming_session_id)
        print("Sessions archived")

    except AuthenticationError:
        print("Authentication failed. Please check your API key.")
    except SessionNotFoundError:
        print("Session not found.")
    except NetworkError as e:
        print(f"Network error: {e}")
    except OlbrainError as e:
        print(f"Olbrain error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if 'client' in locals():
            client.close()
            print("Client closed")


if __name__ == "__main__":
    main()
