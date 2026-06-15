import { defineConfig } from 'vitest/config';

/**
 * Date: 2026-06-07
 * Desc: Configures unit tests for headless package modules
 */

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
