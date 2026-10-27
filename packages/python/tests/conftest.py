import pytest


@pytest.fixture(autouse=True)
def no_url_from_env(monkeypatch):
    # A developer's own OLBRAIN_AGENT_URL must not leak into tests
    monkeypatch.delenv("OLBRAIN_AGENT_URL", raising=False)
