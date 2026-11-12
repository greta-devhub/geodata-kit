import { defineConfig } from 'tsup';

const entries = ['index', 'subdivisions', 'cities', 'airports', 'shapes', 'address', 'phone'];

export default defineConfig({
  entry: Object.fromEntries(entries.map((name) => [name, `src/${name}.ts`])),
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Shared code and the bundled core data go into common chunks instead of every entry.
  splitting: true,
  treeshake: true,
  target: 'es2020',
  platform: 'neutral',
  // Data modules are loaded lazily at runtime; optional packages are resolved by the user's install.
  external: [/^\.\.\/data\//, 'geodata-kit-localities', 'geodata-kit-postal'],
  // Keep import() in the CommonJS build so it can load the ESM data modules.
  esbuildOptions(options) {
    options.supported = { ...options.supported, 'dynamic-import': true };
  },
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
