"""
Error handling examples for the Olbrain Python SDK.

This example demonstrates:
- Different types of errors and how to handle them
- Retry mechanisms
- Graceful degradation
- Logging and debugging
"""

import os
import logging
import time
from olbrain import AgentClient
from olbrain.exceptions import (
    OlbrainError,
    AuthenticationError,
    AgentNotFoundError,
    SessionError,
    RateLimitError,
    NetworkError,
    ValidationError,
    StreamingError
)


# Configure logging to see detailed error information
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def demonstrate_authentication_errors():
    """Demonstrate authentication error handling."""
    print("="*60)
    print("🔐 Authentication Error Handling")
    print("="*60)
    
    # Try with invalid API key
    try:
        client = AgentClient(
            agent_id="fake-agent-id", 
            api_key="ak_invalid_key_12345"
        )
        response = client.chat("Hello")  # This should fail
        
    except AuthenticationError as e:
        print(f"✅ Caught expected authentication error: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error type: {type(e).__name__}: {e}")
    
    # Try with empty API key
    try:
        client = AgentClient(
            agent_id="test-agent", 
            api_key=""
        )
        
    except ValueError as e:
        print(f"✅ Caught expected validation error for empty API key: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error type: {type(e).__name__}: {e}")


def demonstrate_agent_not_found_errors():
    """Demonstrate agent not found error handling."""
    print("\n" + "="*60)
    print("🤖 Agent Not Found Error Handling")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    
    if api_key == "demo-key":
        print("⚠️ Skipping agent not found demo - no valid API key")
        return
    
    try:
        # Try to access non-existent agent
        fake_agent_id = "non-existent-agent-12345"
        client = AgentClient(
            agent_id=fake_agent_id,
            api_key=api_key
        )
        
        # This should fail
        response = client.chat("Hello")
        
    except AgentNotFoundError as e:
        print(f"✅ Caught expected agent not found error: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error type: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_validation_errors():
    """Demonstrate input validation error handling."""
    print("\n" + "="*60)
    print("📝 Validation Error Handling")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    
    if api_key == "demo-key":
        print("⚠️ Using demo API key - some tests may not work")
    
    try:
        client = AgentClient(api_key=api_key)
        agent = client.get_agent("demo-agent")
        
        # Test empty message
        try:
            response = agent.chat("")
        except ValidationError as e:
            print(f"✅ Caught empty message validation error: {e}")
        
        # Test None message
        try:
            response = agent.chat(None)
        except (ValidationError, TypeError) as e:
            print(f"✅ Caught None message validation error: {e}")
        
        # Test very long message
        try:
            long_message = "A" * 20000  # Very long message
            response = agent.chat(long_message)
            if response.success:
                print("✅ Long message handled successfully (truncated)")
            else:
                print(f"⚠️ Long message rejected: {response.error}")
        except ValidationError as e:
            print(f"✅ Caught long message validation error: {e}")
            
    except Exception as e:
        print(f"⚠️ Unexpected error in validation demo: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_network_errors():
    """Demonstrate network error handling and retries."""
    print("\n" + "="*60)
    print("🌐 Network Error Handling")
    print("="*60)
    
    # Test with invalid base URL
    try:
        client = AgentClient(
            api_key="demo-key",
            base_url="https://invalid-url-that-does-not-exist.example.com",
            timeout=5,  # Short timeout for quick demo
            max_retries=2
        )
        
        # This should fail with network error
        health = client.health_check()
        
    except NetworkError as e:
        print(f"✅ Caught expected network error: {e}")
        print(f"   Status code: {getattr(e, 'status_code', 'N/A')}")
    except Exception as e:
        print(f"⚠️ Unexpected error type: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_rate_limit_handling():
    """Demonstrate rate limit error handling."""
    print("\n" + "="*60)
    print("⚡ Rate Limit Error Handling")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping rate limit demo - no valid API key")
        return
    
    try:
        client = AgentClient(api_key=api_key)
        agent = client.get_agent(agent_id)
        
        print("🚀 Sending rapid requests to trigger rate limiting...")
        
        # Send multiple rapid requests to potentially trigger rate limiting
        for i in range(5):
            try:
                print(f"Request {i+1}: ", end="", flush=True)
                response = agent.chat(f"Hello, this is request number {i+1}")
                
                if response.success:
                    print("✅ Success")
                else:
                    print(f"❌ Failed: {response.error}")
                    
            except RateLimitError as e:
                print(f"⚡ Rate limited: {e}")
                if hasattr(e, 'retry_after'):
                    print(f"   Retry after: {e.retry_after} seconds")
                    print(f"   Waiting {e.retry_after} seconds before next request...")
                    time.sleep(e.retry_after)
                break
            except Exception as e:
                print(f"❌ Error: {type(e).__name__}: {e}")
                break
            
            # Small delay between requests
            time.sleep(0.5)
            
    except Exception as e:
        print(f"⚠️ Unexpected error in rate limit demo: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_session_errors():
    """Demonstrate session-related error handling."""
    print("\n" + "="*60)
    print("💬 Session Error Handling")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping session error demo - no valid API key")
        return
    
    try:
        client = AgentClient(api_key=api_key)
        agent = client.get_agent(agent_id)
        
        # Try to get non-existent session
        try:
            session = agent.get_session("non-existent-session-12345")
            if session is None:
                print("✅ Correctly returned None for non-existent session")
            else:
                print(f"⚠️ Unexpectedly found session: {session.session_id}")
        except SessionError as e:
            print(f"✅ Caught expected session error: {e}")
        
        # Create a valid session and then test error scenarios
        try:
            session = agent.create_session()
            print(f"✅ Created test session: {session.session_id}")
            
            # Test session message with empty content
            try:
                response = session.send_message("")
            except ValidationError as e:
                print(f"✅ Caught empty message error in session: {e}")
                
        except Exception as e:
            print(f"⚠️ Error creating test session: {e}")
            
    except Exception as e:
        print(f"⚠️ Unexpected error in session demo: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_streaming_errors():
    """Demonstrate streaming error handling."""
    print("\n" + "="*60)
    print("📡 Streaming Error Handling")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping streaming error demo - no valid API key")
        return
    
    try:
        client = AgentClient(
            api_key=api_key,
            timeout=5  # Short timeout for quick demo
        )
        agent = client.get_agent(agent_id)
        
        # Test streaming with empty message
        try:
            print("Testing empty message streaming...")
            for chunk in agent.stream(""):
                print(chunk, end="")
                
        except ValidationError as e:
            print(f"✅ Caught streaming validation error: {e}")
        except StreamingError as e:
            print(f"✅ Caught streaming error: {e}")
        
        # Test streaming with very long message
        try:
            print("\nTesting very long message streaming...")
            long_message = "Please tell me about " + "artificial intelligence " * 200
            chunk_count = 0
            
            for chunk in agent.stream(long_message):
                print(".", end="", flush=True)  # Show progress
                chunk_count += 1
                if chunk_count > 100:  # Limit output for demo
                    break
                    
            print(f"\n✅ Streamed {chunk_count} chunks successfully")
            
        except StreamingError as e:
            print(f"✅ Caught expected streaming error: {e}")
        except Exception as e:
            print(f"⚠️ Unexpected streaming error: {type(e).__name__}: {e}")
            
    except Exception as e:
        print(f"⚠️ Unexpected error in streaming demo: {type(e).__name__}: {e}")
    finally:
        if 'client' in locals():
            client.close()


def demonstrate_graceful_degradation():
    """Demonstrate graceful degradation strategies."""
    print("\n" + "="*60)
    print("🛡️ Graceful Degradation Strategies")
    print("="*60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    def safe_chat(agent, message, fallback_response="I'm sorry, I'm temporarily unavailable."):
        """Safely send a chat message with fallback."""
        try:
            response = agent.chat(message)
            if response.success:
                return response.text
            else:
                logger.warning(f"Agent returned error: {response.error}")
                return fallback_response
                
        except RateLimitError as e:
            logger.warning(f"Rate limited: {e}")
            return "I'm currently experiencing high demand. Please try again in a moment."
            
        except NetworkError as e:
            logger.error(f"Network error: {e}")
            return "I'm having connectivity issues. Please try again later."
            
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return fallback_response
    
    def safe_stream(agent, message):
        """Safely stream a response with fallback."""
        try:
            full_response = ""
            chunk_count = 0
            
            for chunk in agent.stream(message):
                full_response += chunk
                chunk_count += 1
                
                # Yield chunks as we get them
                yield chunk
                
            if chunk_count == 0:
                yield "I apologize, but I couldn't generate a response."
                
        except StreamingError as e:
            logger.error(f"Streaming error: {e}")
            yield "I'm having trouble with streaming. Here's a fallback response: I'm here to help!"
            
        except Exception as e:
            logger.error(f"Unexpected streaming error: {e}")
            yield "I apologize for the technical difficulty. Please try again."
    
    if api_key != "demo-key":
        try:
            client = AgentClient(api_key=api_key, timeout=10, max_retries=2)
            agent = client.get_agent(agent_id)
            
            # Test safe chat
            print("Testing safe chat with graceful degradation:")
            messages = [
                "Hello, how are you?",
                "What's the weather like?",
                ""  # This should trigger validation error
            ]
            
            for msg in messages:
                print(f"👤 User: {msg or '[empty message]'}")
                result = safe_chat(agent, msg)
                print(f"🤖 Agent: {result}")
                print()
            
            # Test safe streaming
            print("Testing safe streaming with graceful degradation:")
            print("👤 User: Tell me a short joke")
            print("🤖 Agent: ", end="", flush=True)
            
            for chunk in safe_stream(agent, "Tell me a short joke"):
                print(chunk, end="", flush=True)
                time.sleep(0.05)  # Visual effect
            print("\n")
            
        except Exception as e:
            print(f"⚠️ Error in graceful degradation demo: {e}")
        finally:
            if 'client' in locals():
                client.close()
    else:
        print("⚠️ Skipping graceful degradation demo - no valid API key")
        print("💡 The safe_chat and safe_stream functions above show the patterns")


def main():
    """Run all error handling demonstrations."""
    print("🚀 Olbrain SDK Error Handling Examples")
    print("This demo shows how to handle different types of errors gracefully.\n")
    
    # Run all demonstrations
    demonstrate_authentication_errors()
    demonstrate_agent_not_found_errors()
    demonstrate_validation_errors()
    demonstrate_network_errors()
    demonstrate_rate_limit_handling()
    demonstrate_session_errors()
    demonstrate_streaming_errors()
    demonstrate_graceful_degradation()
    
    print("\n" + "="*60)
    print("✅ Error Handling Examples Completed")
    print("="*60)
    print("Key takeaways:")
    print("• Always use specific exception types for targeted error handling")
    print("• Implement fallback responses for better user experience")
    print("• Log errors appropriately for debugging")
    print("• Use timeouts and retries for network resilience")
    print("• Validate inputs before sending to avoid unnecessary API calls")


if __name__ == "__main__":
    main()