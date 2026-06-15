import { defineConfig } from 'tsup';

/**
 * Date: 2026-06-07
 * Desc: Builds the headless package entry points
 */

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/adapters/index.ts',
    'src/annotations/index.ts',
    'src/ascii/index.ts',
    'src/browser/index.ts',
    'src/node/index.ts',
    'src/parser/index.ts',
    'src/selection/index.ts',
    'src/transfer/index.ts',
    'src/tree/index.ts',
  ],
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2020',
});
