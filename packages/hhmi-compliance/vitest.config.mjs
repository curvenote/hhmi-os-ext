import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    plugins: [tsconfigPaths({})],
    environment: 'node',
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/prisma/**',
      '**/dist/**',
      '**/_build/**',
      '**/node_modules/**',
    ],
    forceReruntriggers: ['src/**/*.{ts,tsx}'],
    globals: true,
  },
});

