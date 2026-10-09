/**
 * Live reads for olbrain.research, in place of the Firestore listeners Noesis
 * holds. Six reads are polled {etag, data} snapshots; run steps follow an SSE
 * stream that resumes from its cursor. Callbacks get the same shapes Noesis's
 * subscribe* callbacks get.
 */
import { readSse } from './sse';

export type LiveSubscription = (() => void) & { setActive(active: boolean): void; refresh(): void };

/** onErrorValue that means "keep showing the last value" (noesis listeners with no error callback). */
export const KEEP = Symbol('keep');
export const ACTIVE_MS = 2000;
export const IDLE_MS = 10000;
const ERRORED = '\u0000errored';

export function poll<T>(
  read: () => Promise<{ etag: string; data: T }>,
  cb: (data: T) => void,
  onErrorValue: T | typeof KEEP,
  active = true,
): LiveSubscription {
  let etag: string | undefined;
  let stopped = false;
  let inFlight = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(tick, active ? ACTIVE_MS : IDLE_MS);
  };
  async function tick(): Promise<void> {
    if (stopped) return;
    if (inFlight) {
      again = true;
      return;
    }
    if (hidden()) return schedule();
    inFlight = true;
    try {
      const out = await read();
      if (!stopped && out.etag !== etag) {
        etag = out.etag;
        cb(out.data);
      }
    } catch {
      // Degrade like noesis's onSnapshot error callbacks — once per failure streak.
      if (!stopped && etag !== ERRORED) {
        etag = ERRORED;
        if (onErrorValue !== KEEP) cb(onErrorValue as T);
      }
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        void tick();
      } else {
        schedule();
      }
    }
  }
  void tick();
  const sub = (() => {
    stopped = true;
    clearTimeout(timer);
  }) as LiveSubscription;
  sub.setActive = (a) => { active = a; };
  sub.refresh = () => { void tick(); };
  return sub;
}

/** Follows a run's steps stream; cb gets the accumulated, ts-ordered steps. */
export function watchSteps(
  open: (after: string | null, signal: AbortSignal) => Promise<Response>,
  cb: (steps: unknown[]) => void,
): () => void {
  const steps: unknown[] = [];
  let cursor: string | null = null;
  let stopped = false;
  let reported = false;
  let backoff = 1000;
  let ctrl: AbortController | undefined;
  const report = () => {
    reported = true;
    cb([...steps]);
  };
  void (async () => {
    while (!stopped) {
      ctrl = new AbortController();
      let next: 'end' | 'reconnect' | 'failed' = 'failed';
      try {
        const res = await open(cursor, ctrl.signal);
        for await (const frame of readSse(res.body!)) {
          const f = frame as { type?: string; step?: unknown; cursor?: string | null };
          if (f.type === 'step') {
            steps.push(f.step);
            cursor = f.cursor ?? cursor;
            backoff = 1000;
            if (!stopped) report();
          } else if (f.type === 'end' || f.type === 'reconnect') {
            next = f.type;
            break;
          }
        }
      } catch {
        // refused, dropped or aborted — handled below
      }
      ctrl.abort();
      if (stopped) return;
      // Nothing delivered yet: say "no steps", as noesis's error callback does.
      if (!reported) report();
      if (next === 'end') return;
      if (next === 'failed') {
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  })();
  return () => {
    stopped = true;
    ctrl?.abort();
  };
}
