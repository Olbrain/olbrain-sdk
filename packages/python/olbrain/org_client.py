"""
Olbrain OrgClient — Organization-level management client.

Allows B2B clients (e.g. Sinch) to programmatically manage projects and agents
using an organization-level API key, without requiring Firebase authentication
or the Olbrain dashboard.

Auth: Authorization: ApiKey org_live_<key>
Target: Olbrain Studio Backend (not the agent-cloud service)

Example:
    >>> from olbrain import OrgClient
    >>>
    >>> client = OrgClient(
    ...     org_api_key="org_live_...",
    ...     studio_url="https://your-studio-backend.run.app"
    ... )
    >>>
    >>> project = client.create_project("My Project", organization_id="org_123")
    >>> agent = client.create_agent("Support Bot", project_id=project.project_id)
    >>> deployment = client.deploy_agent(agent.agent_id)
    >>> print(deployment.status)
"""

import logging
import os
import requests
from typing import Dict, Any, List, Optional

from .session import ProjectInfo, AgentInfo, DeploymentInfo
from .exceptions import (
    OlbrainError,
    AuthenticationError,
    NetworkError,
    RateLimitError,
    ValidationError
)

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30


class OrgClient:
    """
    Client for managing Olbrain projects and agents via an organization API key.

    Uses Authorization: ApiKey <org_live_key> against the studio backend.
    The existing AgentClient (for chatting with agents) is separate and unchanged.

    Args:
        org_api_key: Organization API key (must start with 'org_live_' or 'org_')
        studio_url: Base URL of the Olbrain Studio Backend.
                    Falls back to OLBRAIN_STUDIO_URL env var if not provided.
    """

    def __init__(
        self,
        org_api_key: str,
        studio_url: Optional[str] = None
    ):
        valid_prefixes = ('org_live_', 'org_')
        if not org_api_key or not org_api_key.startswith(valid_prefixes):
            raise ValueError(
                "Invalid org API key — must start with 'org_live_' or 'org_'"
            )

        self.org_api_key = org_api_key
        self.studio_url = (
            studio_url
            or os.environ.get('OLBRAIN_STUDIO_URL', '')
        ).rstrip('/')

        if not self.studio_url:
            raise ValueError(
                "studio_url is required. Pass it directly or set the "
                "OLBRAIN_STUDIO_URL environment variable."
            )

        logger.info(f"OrgClient initialized against {self.studio_url}")

    # -------------------------------------------------------------------------
    # Project Management
    # -------------------------------------------------------------------------

    def create_project(
        self,
        name: str,
        organization_id: str,
        description: str = ""
    ) -> ProjectInfo:
        """
        Create a new project inside the organization.

        Args:
            name: Project name
            organization_id: Organization ID this project belongs to
            description: Optional project description

        Returns:
            ProjectInfo with the created project's details
        """
        if not name:
            raise ValidationError("Project name is required")

        payload = {
            "organization_id": organization_id,
            "project_info": {
                "name": name,
                "description": description
            },
            "team_access": {
                "visibility": "organization"
            }
        }

        data = self._request("POST", "/api/projects", payload)
        return ProjectInfo.from_dict(data)

    def list_projects(self, organization_id: str) -> List[ProjectInfo]:
        """
        List all projects in the organization.

        Args:
            organization_id: Organization ID to filter by

        Returns:
            List of ProjectInfo objects
        """
        data = self._request(
            "GET", "/api/projects",
            params={"organization_id": organization_id}
        )
        projects = data.get("data", data if isinstance(data, list) else [])
        return [ProjectInfo.from_dict(p) for p in projects]

    def delete_project(self, project_id: str) -> Dict[str, Any]:
        """
        Delete a project by ID.

        Args:
            project_id: Project ID to delete

        Returns:
            Dict with success confirmation
        """
        return self._request("DELETE", f"/api/projects/{project_id}")

    # -------------------------------------------------------------------------
    # Agent Management
    # -------------------------------------------------------------------------

    def create_agent(
        self,
        name: str,
        project_id: str,
        description: str = "",
        agent_type: str = None,
        industry: str = None,
        use_case: str = None
    ) -> AgentInfo:
        """
        Create a new agent inside a project.

        Args:
            name: Agent name
            project_id: Project ID the agent belongs to
            description: Optional agent description
            agent_type: Optional agent type
            industry: Optional industry
            use_case: Optional use case

        Returns:
            AgentInfo with the created agent's details
        """
        if not name:
            raise ValidationError("Agent name is required")
        if not project_id:
            raise ValidationError("project_id is required")

        payload: Dict[str, Any] = {
            "name": name,
            "project_id": project_id,
            "description": description
        }
        if agent_type:
            payload["agent_type"] = agent_type
        if industry:
            payload["industry"] = industry
        if use_case:
            payload["use_case"] = use_case

        data = self._request("POST", "/api/agents", payload)
        return AgentInfo.from_dict(data)

    def list_agents(
        self,
        project_id: str = None,
        organization_id: str = None,
        lifecycle_state: str = "active"
    ) -> List[AgentInfo]:
        """
        List agents, optionally filtered by project or organization.

        Args:
            project_id: Optional project filter
            organization_id: Optional organization filter
            lifecycle_state: Filter by state (default: active)

        Returns:
            List of AgentInfo objects
        """
        params: Dict[str, Any] = {"lifecycle_state": lifecycle_state}
        if project_id:
            params["project_id"] = project_id
        if organization_id:
            params["organization_id"] = organization_id

        data = self._request("GET", "/api/agents", params=params)
        agents = data.get("agents", data.get("data", []))
        return [AgentInfo.from_dict(a) for a in agents]

    def get_agent(self, agent_id: str) -> AgentInfo:
        """
        Get a single agent by ID.

        Args:
            agent_id: Agent ID

        Returns:
            AgentInfo
        """
        data = self._request("GET", f"/api/agents/{agent_id}")
        return AgentInfo.from_dict(data)

    def update_agent(
        self,
        agent_id: str,
        name: str = None,
        description: str = None,
        agent_type: str = None,
        industry: str = None,
        use_case: str = None
    ) -> Dict[str, Any]:
        """
        Update an agent's metadata.

        Args:
            agent_id: Agent ID to update
            name: New name (optional)
            description: New description (optional)
            agent_type: New type (optional)
            industry: New industry (optional)
            use_case: New use case (optional)

        Returns:
            Success response dict
        """
        payload: Dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if agent_type is not None:
            payload["agent_type"] = agent_type
        if industry is not None:
            payload["industry"] = industry
        if use_case is not None:
            payload["use_case"] = use_case

        if not payload:
            raise ValidationError("At least one field must be provided to update")

        return self._request("PUT", f"/api/agents/{agent_id}", payload)

    def delete_agent(self, agent_id: str) -> Dict[str, Any]:
        """
        Delete an agent by ID.

        Args:
            agent_id: Agent ID to delete

        Returns:
            Dict with success confirmation and delete_type (hard/soft)
        """
        return self._request("DELETE", f"/api/agents/{agent_id}")

    def deploy_agent(self, agent_id: str) -> DeploymentInfo:
        """
        Deploy an agent (publishes its configuration to the agent-cloud).

        Args:
            agent_id: Agent ID to deploy

        Returns:
            DeploymentInfo with deployment_id, version, and status
        """
        data = self._request("POST", f"/api/agents/{agent_id}/deploy")
        return DeploymentInfo.from_dict(data)

    def get_deployment_status(self, agent_id: str) -> Dict[str, Any]:
        """
        Get deployment status for an agent.

        Args:
            agent_id: Agent ID

        Returns:
            Dict with hasDeployment, deploymentCount, latestDeploymentId
        """
        return self._request("GET", f"/api/agents/{agent_id}/deployment-status")

    # -------------------------------------------------------------------------
    # Context Manager
    # -------------------------------------------------------------------------

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass  # No persistent connections to close

    def __repr__(self) -> str:
        return f"OrgClient(studio_url={self.studio_url})"

    # -------------------------------------------------------------------------
    # Internal HTTP helper
    # -------------------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        payload: Dict[str, Any] = None,
        params: Dict[str, Any] = None,
        timeout: int = DEFAULT_TIMEOUT
    ) -> Any:
        """
        Make an authenticated HTTP request to the studio backend.

        Auth: Authorization: ApiKey <org_api_key>
        """
        url = f"{self.studio_url}{path}"
        headers = {
            "Authorization": f"ApiKey {self.org_api_key}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=payload,
                params=params,
                timeout=timeout
            )
            self._handle_errors(response, f"{method} {path}")
            return response.json()

        except requests.exceptions.ConnectionError as e:
            raise NetworkError(f"Cannot connect to studio backend at {self.studio_url}: {e}")
        except requests.exceptions.Timeout:
            raise NetworkError(f"Request to {url} timed out after {timeout}s")
        except requests.exceptions.RequestException as e:
            raise NetworkError(f"Network error: {e}")

    def _handle_errors(self, response: requests.Response, operation: str):
        """Raise typed exceptions for HTTP error responses."""
        if response.status_code < 400:
            return

        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text

        if response.status_code == 401:
            raise AuthenticationError(f"Invalid or expired org API key")
        if response.status_code == 403:
            raise AuthenticationError(f"Permission denied: {detail}")
        if response.status_code == 404:
            raise OlbrainError(f"Not found: {detail}")
        if response.status_code == 422:
            raise ValidationError(f"Validation error: {detail}")
        if response.status_code == 429:
            raise RateLimitError(f"Rate limit exceeded: {detail}")
        raise OlbrainError(
            f"Request failed [{response.status_code}] during {operation}: {detail}"
        )
