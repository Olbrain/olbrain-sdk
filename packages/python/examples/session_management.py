"""
Session management example for the Olbrain Python SDK.

This example demonstrates:
- Creating and managing sessions
- Session CRUD operations (get, update, delete)
- Message history retrieval
- Session statistics
- Multi-session handling
"""

import os
import time
from olbrain import AgentClient, SessionInfo
from olbrain.exceptions import (
    OlbrainError,
    SessionError,
    SessionNotFoundError
)


def main():
    """Session management example."""

    api_key = os.getenv("OLBRAIN_API_KEY", "sk_live_your-api-key-here")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "your-agent-id-here")
    agent_url = os.getenv("OLBRAIN_AGENT_URL")

    if api_key == "sk_live_your-api-key-here" or agent_id == "your-agent-id-here":
        print("Please set OLBRAIN_API_KEY and OLBRAIN_AGENT_ID environment variables")
        print("Example: export OLBRAIN_API_KEY=sk_live_your_key_here")
        print("Example: export OLBRAIN_AGENT_ID=your-agent-id")
        return

    try:
        # Initialize client
        client = AgentClient(
            agent_id=agent_id,
            api_key=api_key,
            agent_url=agent_url
        )
        print(f"Connected to agent {agent_id}")

        # -----------------------------------------------------------------
        # Creating Sessions with Different Options
        # -----------------------------------------------------------------
        print("\n--- Creating Sessions ---")

        # Create a basic session
        session_id = client.create_session(
            title="Demo Conversation",
            user_id="demo_user_123",
            metadata={
                "source": "python_sdk_example",
                "timestamp": time.time()
            },
            description="Testing session management features"
        )
        print(f"Session created: {session_id}")

        # Create a development/testing session
        test_session_id = client.create_session(
            title="Test Session",
            mode="testing",  # Won't count against production metrics
            user_id="test_user"
        )
        print(f"Test session created: {test_session_id}")

        # -----------------------------------------------------------------
        # Sending Messages
        # -----------------------------------------------------------------
        print("\n--- Conversation ---")

        messages = [
            "Hello! I'm testing session management.",
            "Can you remember what I just said?",
            "What's your name?"
        ]

        for i, message in enumerate(messages, 1):
            print(f"\n[Message {i}]")
            print(f"User: {message}")

            response = client.send_and_wait(session_id, message)

            if response.success:
                print(f"Agent: {response.text}")
                if response.token_usage:
                    print(f"Tokens: {response.token_usage.total_tokens}")
            else:
                print(f"Error: {response.error}")

            time.sleep(1)

        # -----------------------------------------------------------------
        # Get Session Details
        # -----------------------------------------------------------------
        print("\n--- Session Details ---")

        info = client.get_session(session_id)
        print(f"Title: {info.title}")
        print(f"Status: {info.status}")
        print(f"Message count: {info.message_count}")
        print(f"Created: {info.created_at}")
        print(f"User ID: {info.user_id}")
        print(f"Channel: {info.channel}")

        # -----------------------------------------------------------------
        # Update Session
        # -----------------------------------------------------------------
        print("\n--- Update Session ---")

        # Rename the session
        updated = client.update_session(
            session_id,
            title="Renamed: Demo Conversation",
            metadata={"updated": True, "update_time": time.time()}
        )
        print(f"New title: {updated.title}")

        # -----------------------------------------------------------------
        # Get Message History
        # -----------------------------------------------------------------
        print("\n--- Message History ---")

        result = client.get_messages(session_id, limit=10)
        messages_list = result.get('messages', [])

        print(f"Retrieved {len(messages_list)} messages:")
        for msg in messages_list:
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            preview = content[:80] + "..." if len(content) > 80 else content
            icon = "User" if role == 'user' else "Agent"
            print(f"  [{icon}]: {preview}")

        # -----------------------------------------------------------------
        # Get Session Statistics
        # -----------------------------------------------------------------
        print("\n--- Session Statistics ---")

        stats_result = client.get_session_stats(session_id)
        stats = stats_result.get('stats', {})

        print(f"Total tokens: {stats.get('total_tokens', 'N/A')}")
        print(f"Total cost: ${stats.get('total_cost', 0):.4f}")
        print(f"Messages: {stats.get('message_count', 'N/A')}")

        # -----------------------------------------------------------------
        # Multiple Sessions Demo
        # -----------------------------------------------------------------
        print("\n--- Multiple Sessions ---")

        # Create a second session
        session2_id = client.create_session(
            title="Second Conversation",
            user_id="another_user"
        )
        print(f"Second session: {session2_id}")

        # Send a message to the second session
        response = client.send_and_wait(session2_id, "Hello! This is a new conversation.")
        print(f"Agent (Session 2): {response.text}")

        # Verify sessions are independent
        response = client.send_and_wait(
            session2_id,
            "Do you remember talking to demo_user_123?"
        )
        print(f"Agent (Session 2): {response.text}")
        print("Note: Sessions are independent - the agent doesn't remember other sessions")

        # -----------------------------------------------------------------
        # Session Not Found Handling
        # -----------------------------------------------------------------
        print("\n--- Error Handling ---")

        try:
            client.get_session("nonexistent-session-id")
        except SessionNotFoundError as e:
            print(f"Expected error: {e}")

        # -----------------------------------------------------------------
        # Cleanup - Archive Sessions
        # -----------------------------------------------------------------
        print("\n--- Cleanup ---")

        # Archive the sessions
        result = client.delete_session(session_id)
        print(f"Session 1 archived at: {result.get('archived_at')}")

        result = client.delete_session(session2_id)
        print(f"Session 2 archived")

        result = client.delete_session(test_session_id)
        print(f"Test session archived")

    except SessionError as e:
        print(f"Session error: {e}")
    except OlbrainError as e:
        print(f"Olbrain error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'client' in locals():
            client.close()
            print("Client closed")


if __name__ == "__main__":
    main()
