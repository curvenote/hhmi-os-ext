import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    client: 'src/client.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  external: [
    'react',
    'react-dom',
    'react-router',
    '@react-router/node',
    '@react-router/dev',
    '@react-router/express',
  ],
  outExtension: () => ({
    js: '.js',
  }),
});
