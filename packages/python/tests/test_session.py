"""
Basic tests for Session
"""
import pytest
import requests_mock
from olbrain import AgentClient, Session
from olbrain.exceptions import SessionError


class TestSession:
    def test_session_initialization(self):
        """Test Session initialization."""
        client = AgentClient(agent_id="test-agent", api_key="test-key")
        session = Session(session_id="test-session", client=client)
        
        assert session.session_id == "test-session"
        assert session.client == client
        assert session._message_cache == []

    @requests_mock.Mocker()
    def test_send_message_success(self, m):
        """Test successful message sending."""
        client = AgentClient(agent_id="test-agent", api_key="test-key")
        session = Session(session_id="test-session", client=client)
        
        # Mock the message sending endpoint
        m.post(
            f"{client.agent_url}/sessions/test-session/messages",
            json={
                "response": "Hello! How can I help you?",
                "message_id": "msg-123"
            },
            status_code=200
        )
        
        response = session.send_message("Hello")
        assert response.text == "Hello! How can I help you?"
        assert response.message_id == "msg-123"

    @requests_mock.Mocker()
    def test_send_message_error(self, m):
        """Test message sending with error."""
        client = AgentClient(agent_id="test-agent", api_key="test-key")
        session = Session(session_id="invalid-session", client=client)
        
        # Mock session error
        m.post(
            f"{client.agent_url}/sessions/invalid-session/messages",
            json={"error": "Session expired"},
            status_code=400
        )
        
        with pytest.raises(SessionError):
            session.send_message("Hello")

    @requests_mock.Mocker()
    def test_get_history_success(self, m):
        """Test successful history retrieval."""
        client = AgentClient(agent_id="test-agent", api_key="test-key")
        session = Session(session_id="test-session", client=client)
        
        # Mock the history endpoint
        mock_history = [
            {
                "message_info": {
                    "role": "user",
                    "content": "Hello"
                }
            },
            {
                "message_info": {
                    "role": "assistant", 
                    "content": "Hi there!"
                }
            }
        ]
        
        m.get(
            f"{client.agent_url}/sessions/test-session/history",
            json={"history": mock_history},
            status_code=200
        )
        
        history = session.get_history()
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[0]["content"] == "Hello"
        assert history[1]["role"] == "assistant"
        assert history[1]["content"] == "Hi there!"