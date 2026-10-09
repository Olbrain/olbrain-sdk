// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readSse } from '../src/core/sse';

const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const e = new TextEncoder();
      chunks.forEach((x) => c.enqueue(e.encode(x)));
      c.close();
    },
  });
const all = async (b: ReadableStream<Uint8Array>) => {
  const out: unknown[] = [];
  for await (const f of readSse(b)) out.push(f);
  return out;
};

describe('readSse', () => {
  it('reassembles a frame cut mid-JSON across chunks', async () => {
    expect(await all(body('data: {"type":"text_de', 'lta","text":"hi"}\n', '\n'))).toEqual([{ type: 'text_delta', text: 'hi' }]);
  });

  it('joins multi-line data and skips comments, empty frames and non-JSON', async () => {
    expect(await all(body(': hb\n\n', 'data: {"a":\ndata: 1}\n\n', 'data: not json\n\n', 'event: x\n\n', 'data: {"b":2}\n\n'))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('drops a trailing partial frame', async () => {
    expect(await all(body('data: {"a":1}\n\ndata: {"b"'))).toEqual([{ a: 1 }]);
  });
});
