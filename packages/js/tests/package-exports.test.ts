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
