import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    exclude: ['dist', 'node_modules'],
    silent: false, // show console.log / console.warn / console.error from tests and code
  },
});
