/**
 * Size budgets, tier nesting and attribution checks for the generated data.
 * Budgets are the sizes measured on the 2026-11-12 GeoNames snapshot plus
 * about 15% headroom; a refresh that grows a dataset more than that fails here
 * and has to be looked at.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listCities } from 'geodata-kit-cities';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');

function sizeOf(path: string): number {
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.size;
  return readdirSync(path).reduce((total, entry) => total + sizeOf(join(path, entry)), 0);
}

const MB = 1024 * 1024;
const BUDGETS: Record<string, number> = {
  'core': 1.0 * MB, // bundled into the main entry point
  'subdivisions': 27 * MB,
  'cities': 29 * MB,
  'localities': 95 * MB,
  'postal': 22 * MB,
  'tz': 8.5 * MB,
  'shapes': 11 * MB,
  'address': 0.3 * MB,
  'phone': 0.35 * MB,
  'airports.json': 1.0 * MB,
};

describe('data budgets', () => {
  for (const [part, budget] of Object.entries(BUDGETS)) {
    it(`${part} stays within ${(budget / MB).toFixed(1)} MB`, () => {
      expect(sizeOf(join(DATA, part))).toBeLessThanOrEqual(budget);
    });
  }

  it('keeps every city band file small enough to load per country', () => {
    let largest = 0;
    for (const country of readdirSync(join(DATA, 'cities')).filter((name) => /^[A-Z]{2}$/.test(name))) {
      for (const file of readdirSync(join(DATA, 'cities', country))) largest = Math.max(largest, statSync(join(DATA, 'cities', country, file)).size);
    }
    expect(largest).toBeLessThan(2.5 * MB);
  });
});

describe('city tiers', () => {
  it('are nested: every tier contains all bigger tiers', async () => {
    for (const country of ['DE', 'US', 'CH', 'IN', 'LI']) {
      const counts: number[] = [];
      let previous = new Set<number>();
      for (const tier of [15000, 5000, 1000, 500] as const) {
        const ids = new Set((await listCities({ country, tier })).map((city) => city.geonameId));
        for (const id of previous) expect(ids.has(id), `${country}: ${id} in tier above ${tier}`).toBe(true);
        counts.push(ids.size);
        previous = ids;
      }
      expect(counts, country).toEqual([...counts].sort((a, b) => a - b));
    }
  });
});

describe('attribution', () => {
  it('credits every source of data/meta.json in NOTICE', () => {
    const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
    const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8')) as { sources: { provider: string }[] };
    const providers = new Set(meta.sources.map((source) => source.provider));
    const credits: Record<string, string> = {
      'GeoNames (geonames.org)': 'GeoNames',
      'Unicode CLDR': 'Unicode CLDR',
      'IANA Time Zone Database': 'IANA Time Zone Database',
      'Natural Earth': 'Natural Earth',
      'libphonenumber (The Libphonenumber Authors)': 'Libphonenumber Authors',
      'Google libaddressinput address metadata': 'libaddressinput',
      'timezone-boundary-builder (data from OpenStreetMap contributors)': 'timezone-boundary-builder',
    };
    for (const provider of providers) {
      expect(credits[provider], `no NOTICE mapping for ${provider}`).toBeDefined();
      expect(notice, provider).toContain(credits[provider]);
    }
    expect(notice).toContain('Wikidata');
    expect(notice).toContain('europa.eu');
  });

  it('ships NOTICE and LICENSE in every package', () => {
    for (const dir of [...readdirSync(join(ROOT, 'packages')).map((name) => `packages/${name}`), 'python']) {
      expect(statSync(join(ROOT, dir, 'NOTICE')).size, dir).toBeGreaterThan(0);
      expect(statSync(join(ROOT, dir, 'LICENSE')).size, dir).toBeGreaterThan(0);
    }
    expect(statSync(join(ROOT, 'packages/geodata-kit-tz/LICENSE-DATA')).size).toBeGreaterThan(0);
  });
});
