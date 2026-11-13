import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const packages = fileURLToPath(new URL('./packages', import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the sources of every package, not their builds.
    alias: [{ find: /^(geodata-kit(?:-[a-z]+)?)$/, replacement: `${packages}/$1/src/index.ts` }],
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    server: { deps: { inline: [/geodata-kit/] } },
  },
});
