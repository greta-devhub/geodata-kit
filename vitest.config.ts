import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the sources of the optional packages, not their builds.
    alias: {
      'geodata-kit-localities': source('./packages/geodata-kit-localities/src/index.ts'),
      'geodata-kit-postal': source('./packages/geodata-kit-postal/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    server: { deps: { inline: [/geodata-kit/] } },
  },
});
