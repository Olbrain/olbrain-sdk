"""
Live messages for a session. The Olbrain API has no stream route for chat sessions, so this polls
the session's message list (oldest first, paged by offset) and delivers each new message once.
"""

import logging
import threading
from urllib.parse import quote

import requests

from .exceptions import OlbrainError

logger = logging.getLogger(__name__)

POLL_SECONDS = 2
PAGE = 200


class MessageStream:
    """Polls one session's messages in a background thread. Messages already there when it starts are skipped."""

    def __init__(self, agent_url: str, api_key: str, session_id: str, on_message, agent_id: str = None):
        """
        Args:
            agent_url: Olbrain API base URL
            api_key: Access key
            session_id: Session to follow
            on_message: Callback function(message_dict) for each new message
            agent_id: The session's agent
        """
        self.url = (f"{agent_url.rstrip('/')}/api/agents/{quote(agent_id or '', safe='')}"
                    f"/sessions/{quote(session_id, safe='')}/messages")
        self.api_key = api_key
        self.session_id = session_id
        self.on_message = on_message
        self.running = False
        self.thread = None
        self._stop = threading.Event()
        self._offset = 0
        self._seen = set()

    def start(self):
        """Start polling in a background thread"""
        if self.running:
            logger.warning(f"Stream already running for session {self.session_id}")
            return

        self.running = True
        self._stop.clear()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        primed = False  # the first full read only records what is already there
        delay = POLL_SECONDS
        while self.running:
            try:
                while self._poll(deliver=primed) == PAGE and self.running:
                    pass
                primed = True
                delay = POLL_SECONDS
            except (requests.exceptions.RequestException, OlbrainError) as e:
                logger.error(f"Message poll failed: {e}. Retrying in {delay}s")
                delay = min(max(delay * 2, 5), 60)
            self._stop.wait(delay)

    def _poll(self, deliver: bool) -> int:
        """Read one page from the current offset; deliver unseen messages when `deliver`. Returns the page size."""
        response = requests.get(self.url, headers={'Authorization': f'Bearer {self.api_key}'},
                                params={'offset': self._offset, 'limit': PAGE}, timeout=30)
        if response.status_code != 200:
            raise OlbrainError(f"Messages refused (HTTP {response.status_code})")
        messages = response.json().get('messages') or []
        # ponytail: offset counts what came back; a soft-discarded message the API hides can make a page
        # overlap the last one, and _seen drops the repeats.
        self._offset += len(messages)
        for m in messages:
            mid = m.get('message_id')
            if mid:
                if mid in self._seen:
                    continue
                self._seen.add(mid)
            if deliver and m.get('content'):
                self.on_message(m)
        return len(messages)

    def stop(self):
        """Stop polling"""
        if not self.running:
            return
        self.running = False
        self._stop.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
