"""
Streaming responses example for the Olbrain Python SDK.

This example demonstrates:
- Real-time streaming responses
- Session-based streaming
- Error handling during streaming
- Different streaming patterns
"""

import os
import time
import sys
from olbrain import AgentClient
from olbrain.exceptions import (
    OlbrainError,
    StreamingError
)


def print_with_typing_effect(text, delay=0.02):
    """Print text with a typing effect."""
    for char in text:
        print(char, end='', flush=True)
        time.sleep(delay)
    print()  # New line


def main():
    """Streaming responses example."""
    
    api_key = os.getenv("OLBRAIN_API_KEY", "sk_live_your-api-key-here")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "your-agent-id-here")

    if (api_key == "sk_live_your-api-key-here" or
        agent_id == "your-agent-id-here"):
        print("Please set OLBRAIN_API_KEY and OLBRAIN_AGENT_ID environment variables")
        print("Example: export OLBRAIN_API_KEY=sk_live_agent123_your_key")
        print("Example: export OLBRAIN_AGENT_ID=your-agent-id")
        return
    
    try:
        # Initialize client for the specific agent
        client = AgentClient(
            agent_id=agent_id,
            api_key=api_key
        )
        print(f"✅ Connected to agent {agent_id}")
        
        # Example 1: Session-based streaming
        print(f"\n" + "="*50)
        print("📡 Example 1: Session-Based Streaming")
        print("="*50)
        
        # Create a session first (required for all messaging)
        session = client.create_session(
            user_id="streaming_demo_user",
            metadata={"demo_type": "streaming"}
        )
        print(f"✅ Created session: {session.session_id}")
        
        message1 = "Tell me a short story about a robot learning to paint"
        print(f"👤 User: {message1}")
        print("🤖 Agent: ", end="", flush=True)
        
        try:
            full_response = ""
            chunk_count = 0
            
            for chunk in session.stream_message(message1):
                print(chunk, end="", flush=True)
                full_response += chunk
                chunk_count += 1
                
                # Optional: add small delay for better visual effect
                time.sleep(0.01)
            
            print()  # New line after streaming
            print(f"📊 Received {chunk_count} chunks, {len(full_response)} total characters")
            
        except StreamingError as e:
            print(f"\n❌ Streaming failed: {e}")
        
        # Example 2: Multi-message session streaming (using same session)
        print(f"\n" + "="*50)
        print("📡 Example 2: Multi-Message Session Streaming")
        print("="*50)
        
        # First message in session
        message2 = "Hello! Can you explain quantum computing in simple terms?"
        print(f"👤 User: {message2}")
        print("🤖 Agent: ", end="", flush=True)
        
        try:
            response_text = ""
            for chunk in session.stream_message(message2):
                print(chunk, end="", flush=True)
                response_text += chunk
                time.sleep(0.01)  # Visual effect
            
            print()  # New line
            
        except StreamingError as e:
            print(f"\n❌ Session streaming failed: {e}")
        
        # Follow-up message in same session
        time.sleep(1)
        message3 = "Can you give me a practical example?"
        print(f"\n👤 User: {message3}")
        print("🤖 Agent: ", end="", flush=True)
        
        try:
            for chunk in session.stream_message(message3):
                print(chunk, end="", flush=True)
                time.sleep(0.01)
            
            print()  # New line
            
        except StreamingError as e:
            print(f"\n❌ Follow-up streaming failed: {e}")
        
        # Example 3: Comparison with regular (non-streaming) response
        print(f"\n" + "="*50)
        print("📡 Example 3: Streaming vs Regular Response")
        print("="*50)
        
        comparison_message = "Explain the difference between AI and machine learning in 2-3 sentences"
        
        # Regular response (still through session)
        print(f"👤 User: {comparison_message}")
        print("\n⏱️  Regular (non-streaming) response:")
        start_time = time.time()
        regular_response = session.send_message(comparison_message)
        regular_time = time.time() - start_time
        
        if regular_response.success:
            print_with_typing_effect(f"🤖 Agent: {regular_response.text}")
            print(f"⏰ Time to complete response: {regular_time:.2f} seconds")
        else:
            print(f"❌ Regular response failed: {regular_response.error}")
        
        # Streaming response
        print(f"\n⏱️  Streaming response:")
        print(f"👤 User: {comparison_message}")
        print("🤖 Agent: ", end="", flush=True)
        
        start_time = time.time()
        streaming_response = ""
        
        try:
            first_chunk_time = None
            for chunk in session.stream_message(comparison_message):
                if first_chunk_time is None:
                    first_chunk_time = time.time() - start_time
                print(chunk, end="", flush=True)
                streaming_response += chunk
                time.sleep(0.01)
            
            total_time = time.time() - start_time
            print()  # New line
            print(f"⏰ Time to first chunk: {first_chunk_time:.2f} seconds")
            print(f"⏰ Total streaming time: {total_time:.2f} seconds")
            
        except StreamingError as e:
            print(f"\n❌ Streaming comparison failed: {e}")
        
        # Example 4: Handling streaming errors gracefully
        print(f"\n" + "="*50)
        print("📡 Example 4: Error Handling in Streaming")
        print("="*50)
        
        try:
            # Try streaming with a very long message to test limits
            long_message = "Please write a detailed essay about " + "artificial intelligence " * 100
            print("👤 User: [Very long message - testing limits]")
            print("🤖 Agent: ", end="", flush=True)
            
            for chunk in session.stream_message(long_message):
                print(chunk, end="", flush=True)
                time.sleep(0.01)
            
            print()  # New line
            
        except StreamingError as e:
            print(f"\n❌ Expected error with long message: {e}")
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
        
        # Example 5: Multiple concurrent streaming sessions
        print(f"\n" + "="*50)
        print("📡 Example 5: Multiple Sessions Demo")
        print("="*50)
        
        # Create multiple sessions
        session1 = client.create_session(user_id="user1")
        session2 = client.create_session(user_id="user2")
        
        print("💬 Session 1 - Math question:")
        print("🤖 Agent: ", end="", flush=True)
        for chunk in session1.stream_message("What is 15 * 23?"):
            print(chunk, end="", flush=True)
            time.sleep(0.01)
        print()
        
        print("\n💬 Session 2 - Science question:")  
        print("🤖 Agent: ", end="", flush=True)
        for chunk in session2.stream_message("What is photosynthesis?"):
            print(chunk, end="", flush=True)
            time.sleep(0.01)
        print()
        
        # Show session independence
        print("\n💬 Session 1 follow-up (should remember math context):")
        print("🤖 Agent: ", end="", flush=True)
        for chunk in session1.stream_message("What's that number divided by 5?"):
            print(chunk, end="", flush=True)
            time.sleep(0.01)
        print()
        
        print("\n✅ Streaming examples completed successfully!")
        
    except OlbrainError as e:
        print(f"❌ Olbrain error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    
    finally:
        if 'client' in locals():
            client.close()
            print("\n🧹 Client closed")


if __name__ == "__main__":
    # Note: This script works best in a terminal that supports real-time output
    print("🚀 Starting streaming examples...")
    print("💡 Tip: Watch the responses appear in real-time!")
    main()