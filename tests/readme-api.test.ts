/**
 * Every package README must list each exported function (and upper-case
 * constant) in its API tables, and must not list one that does not exist.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PACKAGES = join(import.meta.dirname, '..', 'packages');

function tableNames(markdown: string): string[] {
  return [...markdown.matchAll(/^\| `([A-Za-z][A-Za-z0-9_]*)[(`]/gm)].map((match) => match[1]!);
}

describe('README API tables', () => {
  for (const name of readdirSync(PACKAGES)) {
    it(`${name}: documents exactly its exports`, async () => {
      const documented = new Set(tableNames(readFileSync(join(PACKAGES, name, 'README.md'), 'utf8')));
      const module = await import(name) as Record<string, unknown>;
      const exported = Object.entries(module)
        .filter(([key, value]) => typeof value === 'function' || key === key.toUpperCase())
        .map(([key]) => key);
      expect(exported.filter((key) => !documented.has(key)), 'exported but not in the README').toEqual([]);
      expect([...documented].filter((key) => !(key in module)), 'in the README but not exported').toEqual([]);
    });
  }
});
