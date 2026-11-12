/** Every function named in a package README's API tables must be exported by that package. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const MAIN_SECTIONS: Record<string, string> = {
  '`geodata-kit` — countries': 'index', '`geodata-kit` — groups and regions': 'index', '`geodata-kit` — languages': 'index',
  '`geodata-kit` — timezones': 'index', '`geodata-kit/subdivisions`': 'subdivisions', '`geodata-kit/cities` (all async)': 'cities',
  '`geodata-kit/airports` (all async)': 'airports', '`geodata-kit/shapes` (all async)': 'shapes', '`geodata-kit/address`': 'address',
  '`geodata-kit/phone`': 'phone',
};

function tableNames(markdown: string): string[] {
  return [...markdown.matchAll(/^\| `([A-Za-z][A-Za-z0-9_]*)[(`]/gm)].map((match) => match[1]!);
}

describe('README API tables', () => {
  it('lists only exported functions of geodata-kit, and every export', async () => {
    const readme = readFileSync(join(ROOT, 'packages/geodata-kit/README.md'), 'utf8');
    const sections = readme.split(/^### /m).slice(1);
    const documented = new Set<string>();
    for (const section of sections) {
      const title = section.split('\n')[0]!.trim();
      const entry = MAIN_SECTIONS[title];
      expect(entry, `unknown section ${title}`).toBeDefined();
      const module = await import(`../packages/geodata-kit/src/${entry}.ts`) as Record<string, unknown>;
      for (const name of tableNames(section)) {
        expect(name in module, `${name} in ${entry}`).toBe(true);
        documented.add(`${entry}:${name}`);
      }
    }
    for (const entry of new Set(Object.values(MAIN_SECTIONS))) {
      const module = await import(`../packages/geodata-kit/src/${entry}.ts`) as Record<string, unknown>;
      const missing = Object.entries(module)
        .filter(([name, value]) => (typeof value === 'function' || name === name.toUpperCase()) && !documented.has(`${entry}:${name}`))
        .map(([name]) => name)
        // index re-exports are documented in the core sections
        .filter((name) => entry !== 'index' || !documented.has(`index:${name}`));
      expect(missing, `undocumented exports of ${entry}`).toEqual([]);
    }
  });

  for (const [pkg, file] of [['geodata-kit-localities', 'index'], ['geodata-kit-postal', 'index'], ['geodata-kit-tz', 'index']] as const) {
    it(`documents every export of ${pkg}`, async () => {
      const names = tableNames(readFileSync(join(ROOT, `packages/${pkg}/README.md`), 'utf8'));
      const module = await import(`../packages/${pkg}/src/${file}.ts`) as Record<string, unknown>;
      for (const name of names) expect(name in module, name).toBe(true);
      const exported = Object.entries(module).filter(([, value]) => typeof value === 'function').map(([name]) => name);
      expect(exported.filter((name) => !names.includes(name))).toEqual([]);
    });
  }
});
