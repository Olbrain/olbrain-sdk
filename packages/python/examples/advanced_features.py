"""
Advanced features example for the Olbrain Python SDK.

This example demonstrates:
- Context manager usage
- Custom configuration
- Metadata handling
- Performance monitoring
- Advanced session management
"""

import os
import time
import logging
from typing import Dict, Any
from contextlib import contextmanager
from olbrain import AgentClient
from olbrain.exceptions import OlbrainError


# Configure logging for performance monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@contextmanager
def timer(operation_name: str):
    """Context manager to time operations."""
    start_time = time.time()
    yield
    end_time = time.time()
    logger.info(f"{operation_name} took {end_time - start_time:.2f} seconds")


class AdvancedOlbrainClient:
    """Extended client with additional features."""
    
    def __init__(self, agent_id: str, api_key: str, **kwargs):
        self.client = AgentClient(agent_id=agent_id, api_key=api_key, **kwargs)
        self.metrics = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'total_tokens': 0,
            'average_response_time': 0,
            'response_times': []
        }
    
    def get_agent_with_metrics(self, agent_id: str):
        """Get agent with metrics tracking."""
        agent = self.client.get_agent(agent_id)
        
        # Wrap agent methods to track metrics
        original_chat = agent.chat
        
        def chat_with_metrics(*args, **kwargs):
            start_time = time.time()
            self.metrics['total_requests'] += 1
            
            try:
                response = original_chat(*args, **kwargs)
                response_time = time.time() - start_time
                
                if response.success:
                    self.metrics['successful_requests'] += 1
                    if response.token_usage:
                        self.metrics['total_tokens'] += response.token_usage.get('total_tokens', 0)
                else:
                    self.metrics['failed_requests'] += 1
                
                self.metrics['response_times'].append(response_time)
                self.metrics['average_response_time'] = sum(self.metrics['response_times']) / len(self.metrics['response_times'])
                
                return response
                
            except Exception as e:
                self.metrics['failed_requests'] += 1
                raise
        
        agent.chat = chat_with_metrics
        return agent
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get metrics summary."""
        return {
            **self.metrics,
            'success_rate': (self.metrics['successful_requests'] / max(self.metrics['total_requests'], 1)) * 100,
            'min_response_time': min(self.metrics['response_times']) if self.metrics['response_times'] else 0,
            'max_response_time': max(self.metrics['response_times']) if self.metrics['response_times'] else 0
        }
    
    def close(self):
        """Close the underlying client."""
        self.client.close()


def demonstrate_context_manager_usage():
    """Demonstrate using the client as a context manager."""
    print("=" * 60)
    print("🎯 Context Manager Usage")
    print("=" * 60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping context manager demo - no valid API key")
        return
    
    # Using the client as a context manager ensures proper cleanup
    with AgentClient(api_key=api_key) as client:
        print("✅ Client initialized in context manager")
        
        try:
            agent = client.get_agent(agent_id)
            
            with timer("Agent info retrieval"):
                info = agent.get_info()
                print(f"📋 Agent: {info.get('name', 'Unknown')}")
            
            with timer("Chat interaction"):
                response = agent.chat("What's 2+2?")
                if response.success:
                    print(f"🤖 Agent: {response.text}")
                    
        except Exception as e:
            print(f"❌ Error in context manager demo: {e}")
    
    print("✅ Client automatically closed when exiting context manager")


def demonstrate_custom_configuration():
    """Demonstrate custom client configuration."""
    print("\n" + "=" * 60)
    print("⚙️ Custom Configuration")
    print("=" * 60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    
    # Configuration for high-performance usage
    high_perf_config = {
        'timeout': 60,  # Longer timeout for complex requests
        'max_retries': 5,  # More retries for reliability
    }
    
    # Configuration for quick interactions
    quick_config = {
        'timeout': 10,  # Quick timeout
        'max_retries': 1,  # Minimal retries
    }
    
    print("🚀 High-performance configuration:")
    print(f"  Timeout: {high_perf_config['timeout']}s")
    print(f"  Max retries: {high_perf_config['max_retries']}")
    
    print("\n⚡ Quick interaction configuration:")
    print(f"  Timeout: {quick_config['timeout']}s")
    print(f"  Max retries: {quick_config['max_retries']}")
    
    if api_key != "demo-key":
        # Demonstrate different configurations
        try:
            # Test with quick config
            with AgentClient(api_key=api_key, **quick_config) as quick_client:
                print("\n✅ Quick client initialized")
                
            # Test with high-performance config
            with AgentClient(api_key=api_key, **high_perf_config) as hp_client:
                print("✅ High-performance client initialized")
                
        except Exception as e:
            print(f"❌ Configuration demo error: {e}")
    else:
        print("\n⚠️ Skipping configuration demo - no valid API key")


def demonstrate_metadata_handling():
    """Demonstrate advanced metadata usage."""
    print("\n" + "=" * 60)
    print("📊 Metadata Handling")
    print("=" * 60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping metadata demo - no valid API key")
        return
    
    try:
        with AgentClient(api_key=api_key) as client:
            agent = client.get_agent(agent_id)
            
            # Create session with rich metadata
            session_metadata = {
                'user_type': 'premium',
                'session_category': 'technical_support',
                'priority': 'high',
                'source': 'python_sdk_demo',
                'features_enabled': ['streaming', 'history', 'analytics'],
                'user_preferences': {
                    'response_style': 'detailed',
                    'technical_level': 'expert',
                    'language': 'en'
                },
                'context': {
                    'previous_issues': 0,
                    'satisfaction_score': None,
                    'department': 'engineering'
                }
            }
            
            print("📝 Creating session with rich metadata...")
            session = agent.create_session(
                user_id="expert_user_456",
                metadata=session_metadata
            )
            
            print(f"✅ Session created: {session.session_id}")
            print(f"📊 Metadata keys: {list(session_metadata.keys())}")
            
            # Send messages with per-message metadata
            messages_with_metadata = [
                {
                    'message': 'I need help with API integration',
                    'metadata': {
                        'message_type': 'question',
                        'urgency': 'medium',
                        'topic': 'api_integration',
                        'expected_response_time': '< 30s'
                    }
                },
                {
                    'message': 'Can you provide code examples?',
                    'metadata': {
                        'message_type': 'request',
                        'urgency': 'low',
                        'topic': 'code_examples',
                        'format_preference': 'code_with_comments'
                    }
                }
            ]
            
            for msg_data in messages_with_metadata:
                print(f"\n👤 User: {msg_data['message']}")
                print(f"📊 Message metadata: {msg_data['metadata']}")
                
                response = session.send_message(
                    message=msg_data['message'],
                    metadata=msg_data['metadata']
                )
                
                if response.success:
                    print(f"🤖 Agent: {response.text[:100]}...")
                    if response.metadata:
                        print(f"📊 Response metadata: {response.metadata}")
                else:
                    print(f"❌ Failed: {response.error}")
            
            # Retrieve history with metadata
            print(f"\n📜 Retrieving conversation history with metadata...")
            history = session.get_history(include_metadata=True)
            
            print(f"📊 History summary:")
            for i, msg in enumerate(history):
                msg_preview = msg['content'][:50] + "..." if len(msg['content']) > 50 else msg['content']
                metadata_keys = list(msg.get('metadata', {}).keys())
                print(f"  {i+1}. {msg['role']}: {msg_preview}")
                if metadata_keys:
                    print(f"     Metadata: {', '.join(metadata_keys)}")
                    
    except Exception as e:
        print(f"❌ Metadata demo error: {e}")


def demonstrate_performance_monitoring():
    """Demonstrate performance monitoring features."""
    print("\n" + "=" * 60)
    print("📈 Performance Monitoring")
    print("=" * 60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping performance monitoring demo - no valid API key")
        return
    
    try:
        # Use our extended client with metrics
        extended_client = AdvancedAgentClient(api_key=api_key)
        agent = extended_client.get_agent_with_metrics(agent_id)
        
        print("🚀 Running performance test with metrics collection...")
        
        # Run a series of requests to collect metrics
        test_messages = [
            "Hello, how are you?",
            "What's 5 * 7?",
            "Explain recursion briefly",
            "What's the capital of France?",
            "Generate a random number"
        ]
        
        print(f"📊 Testing with {len(test_messages)} messages...")
        
        for i, message in enumerate(test_messages, 1):
            print(f"[{i}/{len(test_messages)}] ", end="", flush=True)
            
            with timer(f"Request {i}"):
                response = agent.chat(message)
                
            if response.success:
                print(f"✅ Success - {len(response.text)} chars")
            else:
                print(f"❌ Failed - {response.error}")
            
            time.sleep(0.5)  # Small delay between requests
        
        # Display metrics summary
        metrics = extended_client.get_metrics_summary()
        
        print(f"\n📊 Performance Metrics Summary:")
        print(f"  Total requests: {metrics['total_requests']}")
        print(f"  Successful requests: {metrics['successful_requests']}")
        print(f"  Failed requests: {metrics['failed_requests']}")
        print(f"  Success rate: {metrics['success_rate']:.1f}%")
        print(f"  Total tokens used: {metrics['total_tokens']}")
        print(f"  Average response time: {metrics['average_response_time']:.2f}s")
        print(f"  Min response time: {metrics['min_response_time']:.2f}s")
        print(f"  Max response time: {metrics['max_response_time']:.2f}s")
        
        # Performance recommendations
        print(f"\n💡 Performance Insights:")
        if metrics['average_response_time'] > 3:
            print("  • Consider using streaming for better perceived performance")
        if metrics['success_rate'] < 95:
            print("  • Consider increasing retry limits or timeout values")
        if metrics['total_tokens'] > 1000:
            print("  • Monitor token usage for cost optimization")
        
        extended_client.close()
        
    except Exception as e:
        print(f"❌ Performance monitoring error: {e}")


def demonstrate_advanced_session_management():
    """Demonstrate advanced session management features."""
    print("\n" + "=" * 60)
    print("💼 Advanced Session Management")
    print("=" * 60)
    
    api_key = os.getenv("OLBRAIN_API_KEY", "demo-key")
    agent_id = os.getenv("OLBRAIN_AGENT_ID", "demo-agent")
    
    if api_key == "demo-key":
        print("⚠️ Skipping advanced session demo - no valid API key")
        return
    
    try:
        with AgentClient(api_key=api_key) as client:
            agent = client.get_agent(agent_id)
            
            # Create multiple sessions with different purposes
            sessions = {}
            
            # Technical support session
            sessions['tech_support'] = agent.create_session(
                user_id="user_tech_123",
                metadata={
                    'session_type': 'technical_support',
                    'priority': 'high',
                    'department': 'engineering'
                }
            )
            
            # General inquiry session
            sessions['general'] = agent.create_session(
                user_id="user_general_456",
                metadata={
                    'session_type': 'general_inquiry',
                    'priority': 'normal',
                    'department': 'sales'
                }
            )
            
            # Training session
            sessions['training'] = agent.create_session(
                user_id="user_training_789",
                metadata={
                    'session_type': 'training',
                    'priority': 'low',
                    'department': 'hr'
                }
            )
            
            print(f"✅ Created {len(sessions)} specialized sessions")
            
            # Test each session with appropriate messages
            session_tests = {
                'tech_support': [
                    "I'm having trouble with the API authentication",
                    "Can you help me debug this error?"
                ],
                'general': [
                    "What are your business hours?",
                    "Do you offer enterprise plans?"
                ],
                'training': [
                    "Can you explain how machine learning works?",
                    "What's the difference between AI and ML?"
                ]
            }
            
            # Run tests on each session
            for session_type, test_messages in session_tests.items():
                print(f"\n🧪 Testing {session_type} session:")
                session = sessions[session_type]
                
                for message in test_messages:
                    print(f"  👤 {session_type}: {message}")
                    
                    response = session.send_message(message)
                    if response.success:
                        preview = response.text[:80] + "..." if len(response.text) > 80 else response.text
                        print(f"  🤖 Agent: {preview}")
                    else:
                        print(f"  ❌ Error: {response.error}")
                
                # Get session stats
                try:
                    stats = session.get_stats()
                    message_count = stats.get('total_messages', len(session._message_cache))
                    print(f"  📊 Session stats: {message_count} total messages")
                except Exception:
                    print(f"  📊 Local cache: {len(session._message_cache)} messages")
            
            # Demonstrate session history comparison
            print(f"\n📊 Session History Summary:")
            for session_type, session in sessions.items():
                history = session.get_history(limit=10, include_metadata=False)
                print(f"  {session_type}: {len(history)} messages")
                
                if history:
                    last_msg = history[-1]
                    preview = last_msg['content'][:50] + "..." if len(last_msg['content']) > 50 else last_msg['content']
                    print(f"    Last message: {last_msg['role']} - {preview}")
    
    except Exception as e:
        print(f"❌ Advanced session management error: {e}")


def main():
    """Run all advanced feature demonstrations."""
    print("🚀 Olbrain SDK Advanced Features Examples")
    print("This demo showcases advanced usage patterns and features.\n")
    
    demonstrate_context_manager_usage()
    demonstrate_custom_configuration()
    demonstrate_metadata_handling()
    demonstrate_performance_monitoring()
    demonstrate_advanced_session_management()
    
    print("\n" + "=" * 60)
    print("✅ Advanced Features Examples Completed")
    print("=" * 60)
    print("Key advanced patterns demonstrated:")
    print("• Context manager usage for automatic resource cleanup")
    print("• Custom configuration for different use cases")
    print("• Rich metadata handling for enhanced context")
    print("• Performance monitoring and metrics collection")
    print("• Advanced session management with specialized purposes")
    print("• Error handling and graceful degradation")


if __name__ == "__main__":
    main()