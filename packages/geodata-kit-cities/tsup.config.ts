import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  platform: 'neutral',
  tsconfig: '../../tsconfig.build.json',
  // Data modules load lazily at runtime; optional packages come from the user's install.
  external: [/^\.\.\/data\//, 'geodata-kit-localities'],
  // Keep import() in the CommonJS build so it can load the ESM data modules.
  esbuildOptions(options) {
    options.supported = { ...options.supported, 'dynamic-import': true };
  },
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
