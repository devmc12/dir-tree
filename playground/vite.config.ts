import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Date: 2026-06-07
 * Desc: Configures the Vite React playground
 */

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@devmc12\/dir-tree$/u,
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
      {
        find: /^@devmc12\/dir-tree\/adapters$/u,
        replacement: fileURLToPath(
          new URL('../src/adapters/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/annotations$/u,
        replacement: fileURLToPath(
          new URL('../src/annotations/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/ascii$/u,
        replacement: fileURLToPath(
          new URL('../src/ascii/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/browser$/u,
        replacement: fileURLToPath(
          new URL('../src/browser/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/parser$/u,
        replacement: fileURLToPath(
          new URL('../src/parser/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/selection$/u,
        replacement: fileURLToPath(
          new URL('../src/selection/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/transfer$/u,
        replacement: fileURLToPath(
          new URL('../src/transfer/index.ts', import.meta.url)
        ),
      },
      {
        find: /^@devmc12\/dir-tree\/tree$/u,
        replacement: fileURLToPath(
          new URL('../src/tree/index.ts', import.meta.url)
        ),
      },
    ],
  },
});
