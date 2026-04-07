import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'src/web/node_modules/**'],
    setupFiles: ["./config/vitest.setup.ts"],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.{test,spec}.ts',
        'src/test-memory.ts',
        '**/*.d.ts',
        '**/types.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
