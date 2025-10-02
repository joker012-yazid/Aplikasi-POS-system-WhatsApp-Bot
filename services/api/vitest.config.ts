import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 90000,
    hookTimeout: 90000,
    maxThreads: 1,
    minThreads: 1,
  },
});
