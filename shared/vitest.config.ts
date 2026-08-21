import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/money/**'],
      thresholds: {
        // Umbral del núcleo financiero (TESTING.md §7)
        lines: 95,
        functions: 95,
        branches: 85,
        statements: 95,
      },
    },
  },
});
