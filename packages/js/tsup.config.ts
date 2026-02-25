import { defineConfig } from 'tsup';

export default defineConfig([
  // Core API (no widget)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm', 'iife'],
    globalName: 'Olbrain',
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    clean: false,
    shims: true,
  },
  // Widget (includes core + UI with markdown support)
  {
    entry: ['src/widget.ts'],
    format: ['iife'],
    globalName: 'OlbrainWidget',
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    clean: false,
    outExtension: () => ({ js: '.widget.global.js', dts: '.widget.d.ts' }),
    // Bundle markdown dependencies for browser use
    noExternal: ['marked', 'marked-highlight', 'highlight.js'],
  },
]);
