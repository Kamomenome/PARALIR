import { defineConfig } from 'vitest/config';
import { gitCommit } from './tools/commit';

export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(gitCommit()) },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
