"""
Utility functions for the Olbrain Python SDK.
"""

import time
import json
import logging
from typing import Dict, Any, Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)


def validate_agent_id(agent_id: str) -> bool:
    """Validate agent ID format."""
    if not isinstance(agent_id, str):
        return False
    
    # Basic validation - agent IDs should be non-empty strings
    return bool(agent_id.strip())


def validate_api_key(api_key: str) -> bool:
    """Validate API key format."""
    if not isinstance(api_key, str):
        return False
    
    # Basic validation - API keys should be non-empty strings
    return bool(api_key.strip())


def format_url(base_url: str, path: str) -> str:
    """Safely join base URL with path."""
    if not base_url.endswith('/'):
        base_url += '/'
    if path.startswith('/'):
        path = path[1:]
    
    return urljoin(base_url, path)


def parse_response_headers(headers: Dict[str, str]) -> Dict[str, Any]:
    """Parse relevant headers from HTTP response."""
    parsed = {}
    
    # Rate limiting headers
    if 'x-ratelimit-remaining' in headers:
        try:
            parsed['rate_limit_remaining'] = int(headers['x-ratelimit-remaining'])
        except ValueError:
            pass
    
    if 'x-ratelimit-reset' in headers:
        try:
            parsed['rate_limit_reset'] = int(headers['x-ratelimit-reset'])
        except ValueError:
            pass
    
    if 'retry-after' in headers:
        try:
            parsed['retry_after'] = int(headers['retry-after'])
        except ValueError:
            pass
    
    # Content type
    if 'content-type' in headers:
        parsed['content_type'] = headers['content-type']
    
    return parsed


def retry_with_backoff(func, max_retries: int = 3, base_delay: float = 1.0):
    """
    Retry a function with exponential backoff.
    
    Args:
        func: Function to retry
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds
    
    Returns:
        Function result or raises the last exception
    """
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return func()
        except Exception as e:
            last_exception = e
            
            if attempt == max_retries:
                break
            
            delay = base_delay * (2 ** attempt)
            logger.debug(f"Retry attempt {attempt + 1}/{max_retries} failed, retrying in {delay}s")
            time.sleep(delay)
    
    raise last_exception


def clean_json_response(text: str) -> str:
    """Clean and validate JSON response text."""
    text = text.strip()
    
    # Remove any non-JSON prefixes that might be present
    if text.startswith('data: '):
        text = text[6:]
    
    # Handle streaming completion marker
    if text == '[DONE]':
        return None
    
    return text


def extract_error_message(response_data: Dict[str, Any]) -> str:
    """Extract error message from API response."""
    if isinstance(response_data, dict):
        # Try different possible error message fields
        for field in ['message', 'error', 'detail', 'description']:
            if field in response_data:
                error_value = response_data[field]
                if isinstance(error_value, str):
                    return error_value
                elif isinstance(error_value, dict):
                    return str(error_value)
        
        # If no specific error field, return the whole response as string
        return str(response_data)
    
    return str(response_data)


def is_valid_url(url: str) -> bool:
    """Check if a URL is valid."""
    try:
        parsed = urlparse(url)
        return bool(parsed.scheme and parsed.netloc)
    except Exception:
        return False


def sanitize_message(message: str) -> str:
    """Sanitize user message content."""
    if not isinstance(message, str):
        return str(message)
    
    # Basic sanitization - strip whitespace and ensure reasonable length
    message = message.strip()
    
    # Limit message length (10,000 characters)
    if len(message) > 10000:
        message = message[:10000]
    
    return message