/**
 * OrgClient — Organization-level management client for Olbrain.
 *
 * Allows B2B clients (e.g. Sinch) to programmatically manage projects and agents
 * using an organization-level API key, without requiring Firebase authentication
 * or the Olbrain dashboard.
 *
 * Auth: Authorization: ApiKey org_live_<key>
 * Target: Olbrain Studio Backend (not the agent-cloud service)
 *
 * @example
 * ```ts
 * import { OrgClient } from '@olbrain/js-sdk';
 *
 * const client = new OrgClient({
 *   orgApiKey: 'org_live_...',
 *   studioUrl: 'https://your-studio-backend.run.app',
 * });
 *
 * const project = await client.createProject('My Project', 'org_123');
 * const agent = await client.createAgent('Support Bot', project.projectId);
 * const deployment = await client.deployAgent(agent.agentId);
 * console.log(deployment.status);
 * ```
 */

import {
  OrgClientConfig,
  ProjectInfo,
  AgentInfo,
  DeploymentInfo,
  CreateProjectOptions,
  CreateAgentOptions,
  UpdateAgentOptions,
  ListAgentsOptions,
} from './types';
import {
  OlbrainError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ValidationError,
} from './exceptions';

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * OrgClient for managing Olbrain projects and agents via an org-level API key.
 */
export class OrgClient {
  private orgApiKey: string;
  private studioUrl: string;

  constructor(config: OrgClientConfig) {
    if (!config.orgApiKey || !config.orgApiKey.startsWith('org')) {
      throw new ValidationError(
        "Invalid org API key — must start with 'org_live_' or 'org_'"
      );
    }
    if (!config.studioUrl) {
      throw new ValidationError('studioUrl is required in OrgClientConfig');
    }

    this.orgApiKey = config.orgApiKey;
    this.studioUrl = config.studioUrl.replace(/\/$/, '');
  }

  // ---------------------------------------------------------------------------
  // Project Management
  // ---------------------------------------------------------------------------

  /**
   * Create a new project inside the organization.
   */
  async createProject(
    name: string,
    organizationId: string,
    options?: CreateProjectOptions
  ): Promise<ProjectInfo> {
    if (!name) throw new ValidationError('Project name is required');

    const data = await this._request('POST', '/api/projects', {
      organization_id: organizationId,
      project_info: {
        name,
        description: options?.description ?? '',
      },
      team_access: { visibility: 'organization' },
    });

    return this._parseProject(data);
  }

  /**
   * List all projects in the organization.
   */
  async listProjects(organizationId: string): Promise<ProjectInfo[]> {
    const data = await this._request('GET', '/api/projects', undefined, {
      organization_id: organizationId,
    });
    const projects: any[] = data?.data ?? (Array.isArray(data) ? data : []);
    return projects.map((p) => this._parseProject(p));
  }

  /**
   * Delete a project by ID.
   */
  async deleteProject(projectId: string): Promise<Record<string, any>> {
    return this._request('DELETE', `/api/projects/${projectId}`);
  }

  // ---------------------------------------------------------------------------
  // Agent Management
  // ---------------------------------------------------------------------------

  /**
   * Create a new agent inside a project.
   */
  async createAgent(
    name: string,
    projectId: string,
    options?: CreateAgentOptions
  ): Promise<AgentInfo> {
    if (!name) throw new ValidationError('Agent name is required');
    if (!projectId) throw new ValidationError('projectId is required');

    const payload: Record<string, any> = {
      name,
      project_id: projectId,
      description: options?.description ?? '',
    };
    if (options?.agentType) payload.agent_type = options.agentType;
    if (options?.industry) payload.industry = options.industry;
    if (options?.useCase) payload.use_case = options.useCase;

    const data = await this._request('POST', '/api/agents', payload);
    return this._parseAgent(data);
  }

  /**
   * List agents, optionally filtered by project or organization.
   */
  async listAgents(options?: ListAgentsOptions): Promise<AgentInfo[]> {
    const params: Record<string, string> = {
      lifecycle_state: options?.lifecycleState ?? 'active',
    };
    if (options?.projectId) params.project_id = options.projectId;
    if (options?.organizationId) params.organization_id = options.organizationId;

    const data = await this._request('GET', '/api/agents', undefined, params);
    const agents: any[] = data?.agents ?? data?.data ?? (Array.isArray(data) ? data : []);
    return agents.map((a) => this._parseAgent(a));
  }

  /**
   * Get a single agent by ID.
   */
  async getAgent(agentId: string): Promise<AgentInfo> {
    const data = await this._request('GET', `/api/agents/${agentId}`);
    return this._parseAgent(data);
  }

  /**
   * Update an agent's metadata.
   */
  async updateAgent(
    agentId: string,
    options: UpdateAgentOptions
  ): Promise<Record<string, any>> {
    if (!options || Object.keys(options).length === 0) {
      throw new ValidationError('At least one field must be provided to update');
    }

    const payload: Record<string, any> = {};
    if (options.name !== undefined) payload.name = options.name;
    if (options.description !== undefined) payload.description = options.description;
    if (options.agentType !== undefined) payload.agent_type = options.agentType;
    if (options.industry !== undefined) payload.industry = options.industry;
    if (options.useCase !== undefined) payload.use_case = options.useCase;

    return this._request('PUT', `/api/agents/${agentId}`, payload);
  }

  /**
   * Delete an agent by ID.
   */
  async deleteAgent(agentId: string): Promise<Record<string, any>> {
    return this._request('DELETE', `/api/agents/${agentId}`);
  }

  /**
   * Deploy an agent (publishes its configuration to the agent-cloud).
   */
  async deployAgent(agentId: string): Promise<DeploymentInfo> {
    const data = await this._request('POST', `/api/agents/${agentId}/deploy`);
    return this._parseDeployment(data);
  }

  /**
   * Get deployment status for an agent.
   */
  async getDeploymentStatus(agentId: string): Promise<Record<string, any>> {
    return this._request('GET', `/api/agents/${agentId}/deployment-status`);
  }

  // ---------------------------------------------------------------------------
  // Response parsers
  // ---------------------------------------------------------------------------

  private _parseProject(data: any): ProjectInfo {
    const projectInfo = data?.project_info ?? {};
    return {
      projectId: data?.project_id ?? data?.id ?? '',
      name: projectInfo?.name ?? data?.name ?? '',
      organizationId: data?.organization_id ?? '',
      description: projectInfo?.description ?? data?.description ?? '',
      createdAt: data?.created_at ? String(data.created_at) : undefined,
      updatedAt: data?.updated_at ? String(data.updated_at) : undefined,
      createdBy: data?.created_by,
    };
  }

  private _parseAgent(data: any): AgentInfo {
    const basicInfo = data?.basic_info ?? {};
    const status = data?.status ?? {};
    return {
      agentId: data?.id ?? data?.agent_id ?? '',
      name: basicInfo?.name ?? data?.name ?? '',
      projectId: data?.project_id ?? '',
      organizationId: data?.organization_id ?? '',
      description: basicInfo?.description ?? data?.description ?? '',
      developmentStage: status?.development_stage ?? 'draft',
      version: data?.version ?? 1,
      createdAt: data?.created_at ? String(data.created_at) : undefined,
      updatedAt: data?.updated_at ? String(data.updated_at) : undefined,
    };
  }

  private _parseDeployment(data: any): DeploymentInfo {
    return {
      deploymentId: data?.deployment_id ?? data?.id ?? '',
      agentId: data?.agent_id ?? '',
      version: data?.version ?? 1,
      status: data?.status ?? '',
      isActive: data?.is_active ?? false,
      configFilePath: data?.config_file_path ?? '',
      createdAt: data?.created_at ? String(data.created_at) : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal HTTP helper
  // ---------------------------------------------------------------------------

  private async _request(
    method: string,
    path: string,
    payload?: Record<string, any>,
    params?: Record<string, string>,
    timeout: number = DEFAULT_TIMEOUT_MS
  ): Promise<any> {
    let url = `${this.studioUrl}${path}`;

    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url = `${url}?${qs}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `ApiKey ${this.orgApiKey}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let responseData: any = {};
      try {
        responseData = await response.json();
      } catch {
        // non-JSON body (e.g. 204 No Content)
      }

      if (!response.ok) {
        const detail = responseData?.detail ?? responseData?.message ?? response.statusText;

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(detail);
        }
        if (response.status === 422) {
          throw new ValidationError(`Validation error: ${detail}`);
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(detail, retryAfter ? parseInt(retryAfter) : undefined);
        }
        throw new NetworkError(detail, response.status);
      }

      return responseData;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OlbrainError) throw error;

      if (error instanceof TypeError && error.message.includes('aborted')) {
        throw new OlbrainError(`Request to ${url} timed out after ${timeout}ms`);
      }

      throw new NetworkError(String(error));
    }
  }
}
