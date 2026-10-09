/**
 * The one SSE reader. Real traffic splits frames across network chunks, so
 * bytes accumulate and split on the blank line between frames — never one
 * chunk as one frame. Yields each frame's `data:` payload parsed as JSON;
 * comments (heartbeats), data-less frames and non-JSON payloads are skipped,
 * as noesis's research stream reader does.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (!data) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
