/**
 * Agreement between polygon timezones (geodata-kit-tz) and GeoNames' own
 * timezone for every city with 15,000+ inhabitants. Differences come from
 * cities right on a zone border and zones GeoNames names differently.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalTimezone } from '../packages/geodata-kit/src/index.js';
import { getTimezoneAt } from '../packages/geodata-kit-tz/src/index.js';

describe('geodata-kit-tz', () => {
  /** UTC offsets on 15 January and 15 July: zones that behave the same today. */
  const behaviour = (zone: string): string => ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z']
    .map((date) => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).format(new Date(date)).split(' ').pop()).join('/');

  it('agrees with GeoNames for at least 99.5% of cities15000 (same current offsets)', async () => {
    const citiesDir = join(import.meta.dirname, '..', 'data', 'cities');
    let total = 0;
    let sameName = 0;
    const mismatches: string[] = [];
    for (const country of readdirSync(citiesDir).filter((name) => /^[A-Z]{2}$/.test(name))) {
      let file: { tz: string[]; rows: (string | number)[][] };
      try { file = JSON.parse(readFileSync(join(citiesDir, country, '15000.json'), 'utf8')); } catch { continue; }
      for (const row of file.rows) {
        total++;
        const expected = canonicalTimezone(file.tz[row[11] as number]!);
        const actual = canonicalTimezone(await getTimezoneAt(row[5] as number, row[6] as number));
        if (expected === actual) sameName++;
        else if (behaviour(expected!) !== behaviour(actual!)) mismatches.push(`${country} ${row[1]}: GeoNames ${expected}, polygons ${actual}`);
      }
    }
    const rate = mismatches.length / total;
    console.log(`tz agreement: same name ${sameName}/${total} (${((sameName / total) * 100).toFixed(2)}%), same offsets ${total - mismatches.length}/${total} (${((1 - rate) * 100).toFixed(2)}%); differences:\n  ${mismatches.slice(0, 15).join('\n  ')}`);
    expect(rate).toBeLessThan(0.005);
  });
});
