import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    client: 'src/client.ts',
  },
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false,
  loader: {
    '.svg': 'dataurl',
    '.json': 'json',
  },
  external: [
    'react',
    'react-dom',
    'react-router',
    '@react-router/node',
    '@react-router/dev',
    '@react-router/express',
  ],
  outExtension: ({ format }) => ({
    js: '.js',
  }),
  noExternal: [],
});
