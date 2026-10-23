"""
Tests for AgentClient: it talks to the Olbrain API at webhook.olbrain.com.
"""

import pytest

from olbrain import AgentClient
from olbrain.exceptions import OlbrainError, SessionNotFoundError
from olbrain.streaming import MessageStream

DOOR = "https://webhook.olbrain.com"
CHAT = f"{DOOR}/api/agents/webhook/a1"
SESSION = f"{DOOR}/api/agents/a1/sessions/s1"


@pytest.fixture
def client():
    return AgentClient(agent_id="a1", api_key="ak_test")


class TestAgentClient:
    def test_defaults_to_the_olbrain_api(self, client):
        assert client.agent_url == DOOR

    def test_custom_url(self):
        client = AgentClient(agent_id="a1", api_key="ak_test", agent_url="https://custom.example/")
        assert client.agent_url == "https://custom.example"

    def test_chat_goes_to_the_agent_webhook(self, client, requests_mock):
        requests_mock.post(CHAT, json={"session_id": "s1", "response": "Hi", "success": True})
        assert client.create_session(title="Hello") == "s1"
        client.send_and_wait("s1", "Hello again")
        assert [r.url for r in requests_mock.request_history] == [CHAT, CHAT]
        assert requests_mock.request_history[1].json()["session_id"] == "s1"
        assert requests_mock.request_history[1].headers["Authorization"] == "Bearer ak_test"

    def test_never_sends_a_session_mode(self, client, requests_mock):
        """The runtime refuses mode "production" with a 422; the Olbrain API always serves the published agent."""
        requests_mock.post(CHAT, json={"session_id": "s1", "response": "Hi", "success": True})
        client.create_session(title="Hello")
        client.send("s1", "Hi")
        assert all("mode" not in r.json() for r in requests_mock.request_history)

    def test_reads_a_session_its_stats_and_messages(self, client, requests_mock):
        requests_mock.get(SESSION, json={"session_id": "s1", "message_count": 2,
                                         "token_usage": {"total_tokens": 12}})
        requests_mock.get(f"{SESSION}/messages", json={"messages": [{"role": "user", "content": "Hi"}]})
        assert client.get_session("s1").session_id == "s1"
        assert client.get_session_stats("s1")["message_count"] == 2
        assert client.get_messages("s1", limit=5, offset=2)["messages"][0]["content"] == "Hi"
        assert requests_mock.request_history[2].qs == {"limit": ["5"], "offset": ["2"]}

    def test_an_unknown_session_is_not_found(self, client, requests_mock):
        requests_mock.get(SESSION, status_code=404, json={"error": {"code": "session_not_found"}})
        with pytest.raises(SessionNotFoundError):
            client.get_session("s1")

    def test_no_api_to_change_or_delete_a_session(self, client, requests_mock):
        with pytest.raises(OlbrainError, match="not supported"):
            client.update_session("s1", title="x")
        with pytest.raises(OlbrainError, match="not supported"):
            client.delete_session("s1")
        assert requests_mock.call_count == 0

    @pytest.mark.parametrize("key", ["ak_test123456", "sk_live_test123456", "org_live_test123456",
                                     "sk_test123456", "org_test123456"])
    def test_api_key_prefixes_accepted(self, key):
        assert AgentClient(agent_id="a1", api_key=key).api_key == key

    @pytest.mark.parametrize("key", ["invalid_key123", "", None])
    def test_bad_api_keys_rejected(self, key):
        with pytest.raises(ValueError, match="Invalid API key"):
            AgentClient(agent_id="a1", api_key=key)


class TestMessageStream:
    """listen() polls the session's messages: there is no stream route for chat sessions."""

    def test_delivers_only_new_messages_once(self, requests_mock):
        got = []
        stream = MessageStream(agent_url=DOOR, api_key="ak_test", session_id="s1", on_message=got.append,
                               agent_id="a1")
        url = f"{SESSION}/messages"
        requests_mock.get(url, [{"json": {"messages": [{"message_id": "m1", "role": "user", "content": "old"}]}},
                                {"json": {"messages": [{"message_id": "m2", "role": "assistant", "content": "hi"}]}},
                                {"json": {"messages": [{"message_id": "m2", "role": "assistant", "content": "hi"}]}}])
        stream._poll(deliver=False)
        stream._poll(deliver=True)
        stream._poll(deliver=True)
        assert [m["content"] for m in got] == ["hi"]
        assert [r.qs["offset"] for r in requests_mock.request_history] == [["0"], ["1"], ["2"]]
        assert requests_mock.request_history[0].headers["Authorization"] == "Bearer ak_test"

    def test_a_refused_read_raises(self, requests_mock):
        stream = MessageStream(agent_url=DOOR, api_key="ak_test", session_id="s1", on_message=print, agent_id="a1")
        requests_mock.get(f"{SESSION}/messages", status_code=401)
        with pytest.raises(OlbrainError, match="HTTP 401"):
            stream._poll(deliver=True)
