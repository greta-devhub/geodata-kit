import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as core from '../packages/geodata-kit/src/index.js';
import { applyPath, check, readGoldenFiles } from './golden-runner.js';

/** Every public function of every entry point, by name. Entry points register once they exist. */
const registry: Record<string, unknown> = { ...core };
const entryPoints = [
  ...['subdivisions', 'cities', 'airports', 'shapes', 'address', 'phone'].map((entry) => `../packages/geodata-kit/src/${entry}.ts`),
  '../packages/geodata-kit-postal/src/index.ts',
  '../packages/geodata-kit-tz/src/index.ts',
];
for (const entry of entryPoints) {
  const url = new URL(entry, import.meta.url);
  if (existsSync(url)) Object.assign(registry, await import(/* @vite-ignore */ url.href));
}

for (const [file, golden] of readGoldenFiles()) {
  describe(`golden: ${file}`, () => {
    golden.cases.forEach((testCase, index) => {
      const label = `#${index} ${testCase.fn}(${testCase.args.map((arg) => JSON.stringify(arg)).join(', ')})${testCase.path ? ` → ${testCase.path}` : ''}`;
      it(label, async () => {
        const fn = registry[testCase.fn];
        expect(typeof fn, `function ${testCase.fn} is not exported`).toBe('function');
        const result = await (fn as (...args: unknown[]) => unknown)(...testCase.args);
        const failure = check(applyPath(result, testCase.path), testCase);
        expect(failure, testCase.note).toBeNull();
      });
    });
  });
}
