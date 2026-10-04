/**
 * Olbrain's Agent API: run workflow agents, read and control their runs, and
 * resolve their approvals — with an access key (servers, scripts) or an
 * Olbrain sign-in (front ends such as screens.olbrain.com).
 */
import {
  ApiError, AuthenticationError, BillingError, NetworkError, NotFoundError, RateLimitError, ValidationError,
} from './exceptions';

export interface OlbrainConfig {
  /** An Olbrain access key, ak_… Give this or getIdToken. */
  apiKey?: string;
  /** Returns the signed-in user's Firebase ID token; called before every request. */
  getIdToken?: () => Promise<string>;
  /** Defaults to https://webhook.olbrain.com */
  baseUrl?: string;
  timeoutMs?: number;
}

export interface RunSummary { total_processed: number; successful: number; failed: number; exceptions: number; skipped: number; }

export interface Run {
  run_id: string;
  status: string;
  progress_percent?: number;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  error?: string | null;
  summary?: RunSummary | null;
  [key: string]: unknown;
}

export interface Approval {
  exception_id: string;
  step_id: string;
  item_id?: string | null;
  data?: Record<string, unknown> | null;
  error: string;
  requires_human_review: boolean;
  blocking: boolean;
}

export interface ResolveInput {
  exceptionId: string;
  resolution: 'approved' | 'rejected' | 'modified';
  /** Only with resolution "modified". */
  modifiedData?: Record<string, unknown>;
}

export interface ResolveResult { exception_id: string; resolution: string; all_resolved: boolean; resumed: boolean; }

const DEFAULT_BASE_URL = 'https://webhook.olbrain.com';
const BILLING_CODES = new Set([
  'insufficient_funds', 'credit_limit_exceeded', 'subscription_suspended', 'subscription_inactive', 'billing_unavailable',
]);
const enc = encodeURIComponent;

export class Olbrain {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: OlbrainConfig) {
    if (!config || Boolean(config.apiKey) === Boolean(config.getIdToken)) {
      throw new ValidationError('Give exactly one of apiKey or getIdToken');
    }
    if (config.apiKey && !config.apiKey.startsWith('ak_')) {
      throw new ValidationError('apiKey must be an Olbrain access key (ak_…)');
    }
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  readonly workflows = {
    run: async (agentId: string, input: { payload?: unknown; variables?: Record<string, unknown> } = {}) => {
      const out = await this.request<{ run_id: string; status: string }>('POST', `/api/workflows/${enc(agentId)}/trigger`, input);
      return { runId: out.run_id, status: out.status };
    },
  };

  readonly runs = {
    list: (agentId: string, opts: { status?: string; limit?: number } = {}) => {
      const q = new URLSearchParams();
      if (opts.limit !== undefined) q.set('limit', String(opts.limit));
      if (opts.status) q.set('status', opts.status);
      const qs = q.toString();
      return this.request<Run[]>('GET', `/api/agents/${enc(agentId)}/runs${qs ? `?${qs}` : ''}`);
    },
    get: (agentId: string, runId: string) => this.request<Run>('GET', `/api/agents/${enc(agentId)}/runs/${enc(runId)}`),
    cancel: (agentId: string, runId: string) => this.control(agentId, runId, 'cancel'),
    pause: (agentId: string, runId: string) => this.control(agentId, runId, 'pause'),
    retry: (agentId: string, runId: string) => this.control(agentId, runId, 'retry'),
    resume: (agentId: string, runId: string) => this.control(agentId, runId, 'resume'),
  };

  readonly approvals = {
    list: (agentId: string, runId: string) =>
      this.request<Approval[]>('GET', `/api/agents/${enc(agentId)}/runs/${enc(runId)}/approvals`),
    resolve: (agentId: string, runId: string, input: ResolveInput) =>
      this.request<ResolveResult>('POST', `/api/agents/${enc(agentId)}/runs/${enc(runId)}/approvals/resolve`, {
        exception_id: input.exceptionId,
        resolution: input.resolution,
        ...(input.modifiedData ? { modified_data: input.modifiedData } : {}),
      }),
  };

  private control(agentId: string, runId: string, verb: 'cancel' | 'pause' | 'retry' | 'resume') {
    return this.request<Record<string, unknown>>('POST', `/api/agents/${enc(agentId)}/runs/${enc(runId)}/${verb}`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = this.config.apiKey ?? (await this.config.getIdToken!());
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
    } catch (err) {
      const e = err as Error;
      throw new NetworkError(e?.name === 'AbortError' ? `Request timed out after ${this.timeoutMs}ms` : e?.message || 'Network error');
    } finally {
      clearTimeout(timer);
    }
    const data: any = await res.json().catch(() => undefined);
    if (res.ok) return data as T;
    // Our API: {error:{code,message}}. Runtime errors pass through as FastAPI {detail: string | {code,message} | [...]}.
    const detail = data?.detail;
    const pick = (k: 'code' | 'message'): string | undefined =>
      [data?.error?.[k], typeof detail === 'object' && !Array.isArray(detail) ? detail?.[k] : undefined, data?.[k]]
        .find((v) => typeof v === 'string' && v);
    const code: string = pick('code') ?? 'error';
    const message: string = data?.error?.message
      ?? (typeof detail === 'string' && detail ? detail : undefined)
      ?? pick('message')
      ?? (res.statusText || 'Request failed');
    if (BILLING_CODES.has(code)) throw new BillingError(res.status, code, message);
    if (res.status === 401) throw new AuthenticationError(message);
    if (res.status === 404) throw new NotFoundError(code, message);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      throw new RateLimitError(message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    throw new ApiError(res.status, code, message);
  }
}
