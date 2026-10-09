import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

describe('package exports', () => {
  // Bundlers honour a "browser" condition/field first; pointing it at the IIFE gave webpack an exports-less module (1.2.0).
  it('sends bundlers to the ESM/CJS builds, never the IIFE', () => {
    expect(pkg.browser).toBeUndefined();
    expect(pkg.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.mjs',
      require: './dist/index.js',
    });
  });

  it('points ./widget at the file tsup actually emits', () => {
    expect(pkg.exports['./widget'].default).toBe('./dist/widget.widget.global.js');
  });
});

describe('1.3.0', () => {
  it('ships the research namespace on Olbrain', async () => {
    const { Olbrain } = await import('../src/index');
    expect(new Olbrain({ getIdToken: async () => 't' }).research.live.runSteps).toBeTypeOf('function');
    expect(pkg.version).toBe('1.3.0');
  });
});
