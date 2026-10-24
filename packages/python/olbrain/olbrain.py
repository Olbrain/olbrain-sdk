"""
Olbrain's Agent API: run workflow agents, read and control their runs, and
resolve their approvals — with an access key (servers, scripts) or an
Olbrain sign-in (get_id_token). The same API as the JavaScript SDK's `Olbrain`.
"""

import json
from types import SimpleNamespace
from typing import Any, Callable, Dict, Iterator, Optional
from urllib.parse import urlencode

import requests

from .exceptions import (
    ApiError,
    AuthenticationError,
    BillingError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from .research import LONG_TIMEOUT, create_research, enc

DEFAULT_BASE_URL = "https://webhook.olbrain.com"
BILLING_CODES = {
    "insufficient_funds",
    "credit_limit_exceeded",
    "subscription_suspended",
    "subscription_inactive",
    "billing_unavailable",
}


def read_sse(lines: Iterator[str]) -> Iterator[Any]:
    """Yields each SSE frame's `data:` payload parsed as JSON; comments (heartbeats),
    data-less frames and non-JSON payloads are skipped, as the JS SDK does."""
    data = []
    for line in lines:
        if line:
            if line.startswith("data:"):
                data.append(line[5:].lstrip())
            continue
        if data:
            try:
                yield json.loads("\n".join(data))
            except ValueError:
                pass
            data = []


class Olbrain:
    """
    Example:
        >>> olbrain = Olbrain(api_key=os.environ["OLBRAIN_API_KEY"])
        >>> run = olbrain.workflows.run("agent-id", payload={"url": "https://…"})
        >>> olbrain.runs.get("agent-id", run["run_id"])
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        get_id_token: Optional[Callable[[], str]] = None,
        base_url: Optional[str] = None,
        timeout: float = 30,
    ):
        if bool(api_key) == bool(get_id_token):
            raise ValidationError("Give exactly one of api_key or get_id_token")
        if api_key and not api_key.startswith("ak_"):
            raise ValidationError("api_key must be an Olbrain access key (ak_…)")
        self._api_key = api_key
        self._get_id_token = get_id_token
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

        def runs(agent_id):
            return f"/api/agents/{enc(agent_id)}/runs"

        def one(agent_id, run_id):
            return f"{runs(agent_id)}/{enc(run_id)}"

        def control(verb):
            return lambda agent_id, run_id: self._request(
                "POST", f"{one(agent_id, run_id)}/{verb}"
            )

        self.workflows = SimpleNamespace(run=self._run_workflow)
        self.runs = SimpleNamespace(
            list=lambda agent_id, status=None, limit=None: self._request(
                "GET", runs(agent_id) + _query(limit=limit, status=status)
            ),
            get=lambda agent_id, run_id: self._request("GET", one(agent_id, run_id)),
            cancel=control("cancel"),
            pause=control("pause"),
            retry=control("retry"),
            resume=control("resume"),
        )
        self.approvals = SimpleNamespace(
            list=lambda agent_id, run_id: self._request(
                "GET", f"{one(agent_id, run_id)}/approvals"
            ),
            resolve=self._resolve_approval,
        )
        # The research console: sessions, streamed turns, plans, runs, reports, review. Sign-ins only.
        self.research = create_research(self._request, self._stream)

    def _run_workflow(
        self,
        agent_id: str,
        payload: Any = None,
        variables: Optional[Dict[str, Any]] = None,
    ):
        """Returns {"run_id", "status"}."""
        body = {
            k: v
            for k, v in (("payload", payload), ("variables", variables))
            if v is not None
        }
        return self._request("POST", f"/api/workflows/{enc(agent_id)}/trigger", body)

    def _resolve_approval(
        self,
        agent_id: str,
        run_id: str,
        exception_id: str,
        resolution: str,
        modified_data: Optional[Dict[str, Any]] = None,
    ):
        """resolution: "approved" | "rejected" | "modified" (modified_data only with "modified")."""
        body: Dict[str, Any] = {"exception_id": exception_id, "resolution": resolution}
        if modified_data:
            body["modified_data"] = modified_data
        return self._request(
            "POST",
            f"/api/agents/{enc(agent_id)}/runs/{enc(run_id)}/approvals/resolve",
            body,
        )

    def _send(
        self, method, path, body=None, files=None, stream=False, timeout=None
    ) -> requests.Response:
        token = self._api_key or self._get_id_token()
        headers = {"Authorization": f"Bearer {token}"}
        if stream:
            headers["Accept"] = "text/event-stream"
        timeout = timeout or self.timeout
        try:
            res = requests.request(
                method,
                self.base_url + path,
                headers=headers,
                json=body,
                files=files,
                stream=stream,
                timeout=timeout,
            )
        except requests.Timeout:
            raise NetworkError(f"Request timed out after {timeout}s")
        except requests.RequestException as e:
            raise NetworkError(str(e) or "Network error")
        if not res.ok:
            try:
                raise _to_error(res)
            finally:
                res.close()
        return res

    def _request(self, method, path, body=None, files=None, timeout=None):
        res = self._send(method, path, body, files=files, timeout=timeout)
        try:
            return res.json() if res.content else None
        except ValueError:
            return None

    def _stream(self, method, path, body=None):
        # research-runtime sends headers with its first frame, which can be a
        # minute in (searching); the read timeout is per gap between bytes.
        res = self._send(
            method, path, body, stream=True, timeout=(self.timeout, LONG_TIMEOUT)
        )
        res.encoding = (
            "utf-8"  # SSE is always UTF-8; requests guesses ISO-8859-1 for text/*
        )
        try:
            yield from read_sse(res.iter_lines(decode_unicode=True))
        except requests.RequestException as e:
            raise NetworkError(str(e) or "Stream dropped")
        finally:
            res.close()


def _query(**params) -> str:
    qs = urlencode({k: v for k, v in params.items() if v is not None})
    return f"?{qs}" if qs else ""


def _to_error(res: requests.Response) -> Exception:
    try:
        data = res.json()
    except ValueError:
        data = None
    data = data if isinstance(data, dict) else {}
    # Our API: {error:{code,message}}. Runtime errors pass through as FastAPI {detail: str | {code,message} | [...]}.
    err = data.get("error") if isinstance(data.get("error"), dict) else {}
    detail = data.get("detail")
    detail_obj = detail if isinstance(detail, dict) else {}

    def pick(key):
        return next(
            (
                v
                for v in (err.get(key), detail_obj.get(key), data.get(key))
                if isinstance(v, str) and v
            ),
            None,
        )

    code = pick("code") or "error"
    message = (
        (err.get("message") if isinstance(err.get("message"), str) else None)
        or (detail if isinstance(detail, str) and detail else None)
        or pick("message")
        or res.reason
        or "Request failed"
    )
    if code in BILLING_CODES:
        return BillingError(res.status_code, code, message)
    if res.status_code == 401:
        return AuthenticationError(message)
    if res.status_code == 404:
        return NotFoundError(code, message)
    if res.status_code == 429:
        try:
            retry_after = float(res.headers.get("Retry-After", ""))
        except ValueError:
            retry_after = None
        return RateLimitError(
            message,
            retry_after=retry_after if retry_after and retry_after > 0 else None,
        )
    return ApiError(res.status_code, code, message, detail)
