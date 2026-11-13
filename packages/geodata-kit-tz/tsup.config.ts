import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  tsconfig: '../../tsconfig.build.json',
  // import.meta.url in the CommonJS build.
  shims: true,
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
