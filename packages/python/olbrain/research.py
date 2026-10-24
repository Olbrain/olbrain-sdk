"""
olbrain.research — the research console over the Agent API, as in the
JavaScript SDK. Every call takes the research agent's id first.

ponytail: the JS SDK's `live.*` polling subscriptions stand in for a browser's
Firestore listeners; a Python caller polls `reports.get` / `sessions.get`
itself. Port them if a long-running Python UI ever needs them.
"""

from types import SimpleNamespace
from urllib.parse import quote

# A review pass or apply runs for minutes before it answers.
LONG_TIMEOUT = 600


def enc(value):
    return quote(str(value), safe="")


def create_research(request, stream):
    """request(method, path, body=None, files=None, timeout=None) -> JSON;
    stream(method, path, body=None) -> iterator of SSE frames."""

    def root(agent_id):
        return f"/api/agents/{enc(agent_id)}/research"

    def session(agent_id, session_id):
        return f"{root(agent_id)}/sessions/{enc(session_id)}"

    def run(agent_id, run_id):
        return f"{root(agent_id)}/runs/{enc(run_id)}"

    def report(agent_id, run_id):
        return f"{root(agent_id)}/reports/{enc(run_id)}"

    def stream_message(
        agent_id,
        session_id,
        content,
        attachments=None,
        effort=None,
        escalates_run_id=None,
        command=None,
        target_run_id=None,
    ):
        """Yields research-runtime's frames unchanged: text_delta, tool_use_start, complete, error."""
        body = {
            "content": content,
            "attachments": attachments,
            "effort": effort,
            "escalates_run_id": escalates_run_id,
            "command": command,
            "target_run_id": target_run_id,
        }
        return stream(
            "POST",
            f"{session(agent_id, session_id)}/messages/stream",
            {k: v for k, v in body.items() if v is not None},
        )

    def add_attachments(agent_id, session_id, files):
        """files: (filename, file object or bytes[, content type]) tuples. Returns the
        attachment refs to pass as `attachments` to stream_message."""
        out = request(
            "POST",
            f"{session(agent_id, session_id)}/attachments",
            files=[("files", f) for f in files],
        )
        return out["attachments"]

    def active_job(agent_id, run_id):
        return (request("GET", f"{run(agent_id, run_id)}/active-job") or {}).get(
            "active"
        )

    def get_report(agent_id, run_id, version=None):
        return request(
            "GET",
            report(agent_id, run_id) + (f"?version={int(version)}" if version else ""),
        )

    def older_messages(agent_id, session_id, before_ts):
        """One page of messages older than before_ts, in reading order."""
        return request(
            "GET",
            f"{root(agent_id)}/live/sessions/{enc(session_id)}/messages?before={enc(before_ts)}",
        )["data"]

    return SimpleNamespace(
        sessions=SimpleNamespace(
            create=lambda agent_id: request("POST", f"{root(agent_id)}/sessions"),
            list=lambda agent_id, include_archived=False: request(
                "GET",
                f"{root(agent_id)}/sessions?archived={'true' if include_archived else 'false'}",
            ),
            get=lambda agent_id, session_id: request(
                "GET", session(agent_id, session_id)
            ),
            patch=lambda agent_id, session_id, patch: request(
                "PATCH", session(agent_id, session_id), patch
            ),
            delete=lambda agent_id, session_id: request(
                "DELETE", session(agent_id, session_id)
            ),
            models=lambda agent_id, session_id: request(
                "GET", f"{session(agent_id, session_id)}/models"
            ),
            set_model=lambda agent_id, session_id, model: request(
                "PUT", f"{session(agent_id, session_id)}/model", {"model": model}
            ),
            set_review_model=lambda agent_id, session_id, model: request(
                "PUT", f"{session(agent_id, session_id)}/review-model", {"model": model}
            ),
            stream_message=stream_message,
        ),
        plans=SimpleNamespace(
            approve=lambda agent_id, session_id, message_id, body=None: request(
                "POST",
                f"{session(agent_id, session_id)}/messages/{enc(message_id)}/approve-plan",
                body or {},
            ),
            approve_by_id=lambda agent_id, session_id, plan_id, body=None: request(
                "POST",
                f"{session(agent_id, session_id)}/plans/{enc(plan_id)}/approve",
                body or {},
            ),
        ),
        attachments=SimpleNamespace(
            add=add_attachments,
            upload_url=lambda agent_id, session_id, storage_path: request(
                "POST",
                f"{session(agent_id, session_id)}/attachment-url",
                {"storage_path": storage_path},
            ),
        ),
        runs=SimpleNamespace(
            cancel=lambda agent_id, run_id: request(
                "POST", f"{run(agent_id, run_id)}/cancel"
            ),
            retry=lambda agent_id, run_id: request(
                "POST", f"{run(agent_id, run_id)}/retry"
            ),
            active_job=active_job,
            resolve_claims=lambda agent_id, run_id, resolutions: request(
                "POST",
                f"{run(agent_id, run_id)}/claims/resolve",
                {"resolutions": resolutions},
            ),
        ),
        reports=SimpleNamespace(
            get=get_report,
            artifact_url=lambda agent_id, run_id, profile_id, fmt: request(
                "GET",
                f"{report(agent_id, run_id)}/artifacts/{enc(profile_id)}/{enc(fmt)}",
            ),
            evidence=lambda agent_id, run_id: request(
                "GET", f"{report(agent_id, run_id)}/evidence"
            ),
            share=SimpleNamespace(
                get=lambda agent_id, run_id: request(
                    "GET", f"{report(agent_id, run_id)}/share"
                ),
                set=lambda agent_id, run_id, visibility: request(
                    "PUT",
                    f"{report(agent_id, run_id)}/share",
                    {"visibility": visibility},
                ),
                revoke=lambda agent_id, run_id: request(
                    "POST", f"{report(agent_id, run_id)}/share/revoke"
                ),
            ),
        ),
        review=SimpleNamespace(
            get=lambda agent_id, run_id: request(
                "GET", f"{report(agent_id, run_id)}/review"
            ),
            run=lambda agent_id, run_id: request(
                "POST", f"{run(agent_id, run_id)}/review", timeout=LONG_TIMEOUT
            ),
            apply=lambda agent_id, run_id, finding_ids: request(
                "POST",
                f"{run(agent_id, run_id)}/review/apply",
                {"finding_ids": finding_ids},
                timeout=LONG_TIMEOUT,
            ),
            stream=lambda agent_id, run_id: stream(
                "POST", f"{run(agent_id, run_id)}/review/stream"
            ),
            stream_apply=lambda agent_id, run_id, finding_ids: stream(
                "POST",
                f"{run(agent_id, run_id)}/review/apply/stream",
                {"finding_ids": finding_ids},
            ),
        ),
        templates=SimpleNamespace(
            versions=lambda agent_id: request("GET", f"{root(agent_id)}/versions"),
        ),
        messages=SimpleNamespace(older=older_messages),
    )
