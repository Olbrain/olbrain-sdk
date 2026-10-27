"""
Tests for Olbrain: workflow runs, approvals and research over the Agent API.
"""

import pytest
import requests

from olbrain import (
    Olbrain,
    ApiError,
    AuthenticationError,
    BillingError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)

DOOR = "https://webhook.olbrain.com"
RUNS = f"{DOOR}/api/agents/a1/runs"
RESEARCH = f"{DOOR}/api/agents/r1/research"


@pytest.fixture
def olbrain():
    return Olbrain(api_key="ak_test")


class TestConfig:
    def test_needs_exactly_one_credential(self):
        for kwargs in ({}, {"api_key": "ak_x", "get_id_token": lambda: "t"}):
            with pytest.raises(ValidationError):
                Olbrain(**kwargs)

    def test_only_access_keys(self):
        with pytest.raises(ValidationError, match="ak_"):
            Olbrain(api_key="sk_live_x")

    def test_env_url(self, monkeypatch):
        monkeypatch.setenv("OLBRAIN_AGENT_URL", "http://localhost:8080/")
        assert Olbrain(api_key="ak_test").base_url == "http://localhost:8080"
        assert Olbrain(api_key="ak_test", base_url="https://custom.example").base_url == "https://custom.example"

    def test_asks_for_a_fresh_sign_in_token_on_every_call(self, requests_mock):
        tokens = iter(["t1", "t2"])
        olbrain = Olbrain(get_id_token=lambda: next(tokens))
        requests_mock.get(f"{RUNS}/r", json={"run_id": "r"})
        olbrain.runs.get("a1", "r")
        olbrain.runs.get("a1", "r")
        assert [r.headers["Authorization"] for r in requests_mock.request_history] == [
            "Bearer t1",
            "Bearer t2",
        ]


class TestWorkflowsRunsApprovals:
    def test_runs_a_workflow(self, olbrain, requests_mock):
        requests_mock.post(
            f"{DOOR}/api/workflows/a1/trigger",
            json={"run_id": "r1", "status": "queued"},
        )
        assert olbrain.workflows.run("a1", payload={"url": "u"}) == {
            "run_id": "r1",
            "status": "queued",
        }
        req = requests_mock.last_request
        assert req.json() == {"payload": {"url": "u"}}
        assert req.headers["Authorization"] == "Bearer ak_test"

    def test_lists_reads_and_controls_runs(self, olbrain, requests_mock):
        requests_mock.get(RUNS, json=[])
        requests_mock.get(f"{RUNS}/r1", json={"run_id": "r1", "status": "running"})
        requests_mock.post(f"{RUNS}/r1/pause", json={"ok": True})
        olbrain.runs.list("a1", status="failed", limit=5)
        assert requests_mock.last_request.qs == {"limit": ["5"], "status": ["failed"]}
        olbrain.runs.list("a1")
        assert requests_mock.last_request.url == RUNS
        assert olbrain.runs.get("a1", "r1")["status"] == "running"
        assert olbrain.runs.pause("a1", "r1") == {"ok": True}

    def test_encodes_ids_into_the_path(self, olbrain, requests_mock):
        requests_mock.get(f"{RUNS}/a%2Fb", json={})
        olbrain.runs.get("a1", "a/b")
        assert requests_mock.called

    def test_resolves_approvals(self, olbrain, requests_mock):
        requests_mock.post(f"{RUNS}/r1/approvals/resolve", json={"all_resolved": True})
        olbrain.approvals.resolve("a1", "r1", exception_id="e1", resolution="approved")
        assert requests_mock.last_request.json() == {
            "exception_id": "e1",
            "resolution": "approved",
        }
        olbrain.approvals.resolve("a1", "r1", "e1", "modified", modified_data={"x": 1})
        assert requests_mock.last_request.json()["modified_data"] == {"x": 1}


class TestErrors:
    def call(self, olbrain, requests_mock, **response):
        requests_mock.get(f"{RUNS}/r1", **response)
        olbrain.runs.get("a1", "r1")

    def test_billing_codes_win_over_status(self, olbrain, requests_mock):
        with pytest.raises(BillingError) as e:
            self.call(
                olbrain,
                requests_mock,
                status_code=402,
                json={"error": {"code": "insufficient_funds", "message": "Top up"}},
            )
        assert (e.value.status, e.value.code, e.value.message) == (
            402,
            "insufficient_funds",
            "Top up",
        )

    def test_maps_401_404_429(self, olbrain, requests_mock):
        with pytest.raises(AuthenticationError):
            self.call(
                olbrain, requests_mock, status_code=401, json={"detail": "bad key"}
            )
        with pytest.raises(NotFoundError) as e:
            self.call(
                olbrain,
                requests_mock,
                status_code=404,
                json={"detail": {"code": "agent_not_found", "message": "No"}},
            )
        assert e.value.code == "agent_not_found"
        with pytest.raises(RateLimitError) as e:
            self.call(
                olbrain,
                requests_mock,
                status_code=429,
                headers={"Retry-After": "7"},
                json={},
            )
        assert e.value.retry_after == 7

    def test_anything_else_is_an_api_error_with_the_raw_detail(
        self, olbrain, requests_mock
    ):
        detail = [{"loc": ["body"], "msg": "bad"}]
        with pytest.raises(ApiError) as e:
            self.call(olbrain, requests_mock, status_code=422, json={"detail": detail})
        assert (e.value.status, e.value.code, e.value.detail) == (422, "error", detail)

    def test_a_non_json_error_body(self, olbrain, requests_mock):
        with pytest.raises(ApiError) as e:
            self.call(
                olbrain,
                requests_mock,
                status_code=502,
                text="<html>bad gateway</html>",
                reason="Bad Gateway",
            )
        assert e.value.message == "Bad Gateway"

    def test_network_failures(self, olbrain, requests_mock):
        with pytest.raises(NetworkError, match="timed out"):
            self.call(olbrain, requests_mock, exc=requests.exceptions.ConnectTimeout)
        with pytest.raises(NetworkError):
            self.call(olbrain, requests_mock, exc=requests.exceptions.ConnectionError)


class TestResearch:
    def test_streams_a_turn_frame_by_frame(self, olbrain, requests_mock):
        body = (
            ": heartbeat\n\n"
            'data: {"type": "text_delta", "text": "Héllo"}\n\n'
            "data: not json\n\n"
            "event: x\n\n"
            'data: {"type":\ndata: "complete"}\n\n'
        )
        requests_mock.post(
            f"{RESEARCH}/sessions/s1/messages/stream",
            content=body.encode("utf-8"),
            headers={"Content-Type": "text/event-stream"},
        )
        frames = list(
            olbrain.research.sessions.stream_message(
                "r1", "s1", "Size the market", effort="high"
            )
        )
        assert frames == [{"type": "text_delta", "text": "Héllo"}, {"type": "complete"}]
        assert requests_mock.last_request.json() == {
            "content": "Size the market",
            "effort": "high",
        }
        assert requests_mock.last_request.headers["Accept"] == "text/event-stream"

    def test_a_refused_stream_raises_before_the_first_frame(
        self, olbrain, requests_mock
    ):
        requests_mock.post(
            f"{RESEARCH}/runs/x/review/stream",
            status_code=404,
            json={"error": {"code": "agent_not_found"}},
        )
        with pytest.raises(NotFoundError):
            next(olbrain.research.review.stream("r1", "x"))

    def test_plain_calls(self, olbrain, requests_mock):
        requests_mock.get(f"{RESEARCH}/reports/x", json={"v": 2})
        requests_mock.get(f"{RESEARCH}/runs/x/active-job", json={})
        requests_mock.get(
            f"{RESEARCH}/live/sessions/s1/messages", json={"etag": "e", "data": [1]}
        )
        requests_mock.post(
            f"{RESEARCH}/sessions/s1/attachments", json={"attachments": [{"id": "f"}]}
        )
        assert olbrain.research.reports.get("r1", "x", version=2) == {"v": 2}
        assert requests_mock.last_request.qs == {"version": ["2"]}
        assert olbrain.research.runs.active_job("r1", "x") is None
        assert olbrain.research.messages.older("r1", "s1", "2026-10-24T00:00:00Z") == [
            1
        ]
        assert olbrain.research.attachments.add("r1", "s1", [("a.txt", b"hi")]) == [
            {"id": "f"}
        ]
        assert b'name="files"; filename="a.txt"' in requests_mock.last_request.body
