"""
SSE streaming client for real-time message delivery
"""

import requests
import json
import threading
import logging
import time

logger = logging.getLogger(__name__)


class MessageStream:
    """Real-time message stream client using Server-Sent Events"""

    def __init__(self, agent_url: str, api_key: str, session_id: str, on_message, agent_id: str = None):
        """
        Initialize message stream

        Args:
            agent_url: Agent service URL
            api_key: API key for authentication
            session_id: Session ID to stream messages from
            on_message: Callback function(message_dict) for new messages
            agent_id: Agent ID for X-Agent-ID header
        """
        self.url = f"{agent_url.rstrip('/')}/sessions/{session_id}/stream"
        self.api_key = api_key
        self.session_id = session_id
        self.on_message = on_message
        self.agent_id = agent_id
        self.running = False
        self.thread = None
        self.response = None

        logger.debug(f"MessageStream initialized for session {session_id}")

    def start(self):
        """Start receiving messages in background thread"""
        if self.running:
            logger.warning(f"Stream already running for session {self.session_id}")
            return

        self.running = True
        self.thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.thread.start()

        logger.info(f"Started message stream for session {self.session_id}")

    def _stream_loop(self):
        """Main streaming loop with auto-reconnect"""
        reconnect_delay = 5

        while self.running:
            try:
                logger.debug(f"Connecting to stream: {self.url}")

                # Open SSE connection
                headers = {
                    'Authorization': f'Bearer {self.api_key}',
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache'
                }
                if self.agent_id:
                    headers['X-Agent-ID'] = self.agent_id

                self.response = requests.get(
                    self.url,
                    headers=headers,
                    stream=True,
                    timeout=90  # 90 second timeout (longer than 30s ping interval)
                )

                if self.response.status_code != 200:
                    logger.error(f"Stream connection failed: {self.response.status_code} - {self.response.text}")
                    time.sleep(reconnect_delay)
                    continue

                logger.info(f"Stream connected for session {self.session_id}")
                reconnect_delay = 5  # Reset delay on successful connection

                # Read SSE events
                for line in self.response.iter_lines():
                    if not self.running:
                        break

                    if line and line.startswith(b'data:'):
                        # Parse SSE data line
                        data_json = line.decode('utf-8')[5:].strip()

                        try:
                            data = json.loads(data_json)

                            # Skip system messages (ping, connected)
                            if data.get('type') in ['ping', 'connected']:
                                logger.debug(f"Received {data.get('type')} event")
                                continue

                            # Message received - call user's callback
                            if 'content' in data:
                                logger.debug(f"Received message: {data.get('message_id')}")
                                self.on_message(data)

                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse SSE data: {e}")

            except requests.exceptions.RequestException as e:
                logger.error(f"Stream error: {e}")

            except Exception as e:
                logger.error(f"Unexpected stream error: {e}", exc_info=True)

            finally:
                if self.response:
                    self.response.close()

            # Auto-reconnect if still running
            if self.running:
                logger.info(f"Reconnecting in {reconnect_delay}s...")
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 60)  # Exponential backoff, max 60s

        logger.info(f"Stream stopped for session {self.session_id}")

    def stop(self):
        """Stop streaming"""
        if not self.running:
            return

        logger.info(f"Stopping stream for session {self.session_id}")
        self.running = False

        if self.response:
            try:
                self.response.close()
            except:
                pass

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)

        logger.info(f"Stream stopped for session {self.session_id}")
