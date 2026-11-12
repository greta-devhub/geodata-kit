import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalTimezone, getCountry, getNationalLanguages, isTimezone, listCountries, listGroups, listTimezones, resolveCountry } from '../packages/geodata-kit/src/index.js';

const DATA = join(import.meta.dirname, '..', 'data');
const readData = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

describe('countries data', () => {
  const countries = listCountries();

  it('has the ISO 3166-1 set plus Kosovo, without retired codes', () => {
    expect(countries.length).toBe(250);
    expect(new Set(countries.map((country) => country.code)).size).toBe(countries.length);
    for (const retired of ['CS', 'AN', 'YU', 'UK', 'SU', 'DD']) expect(getCountry(retired)).toBeNull();
    expect(getCountry('XK')).not.toBeNull();
  });

  it('has unique alpha-3 and numeric codes', () => {
    expect(new Set(countries.map((country) => country.alpha3)).size).toBe(countries.length);
    const numerics = countries.filter((country) => country.numeric !== '000').map((country) => country.numeric);
    expect(new Set(numerics).size).toBe(numerics.length);
  });

  it('resolves every country by its own code, alpha-3 and English name', () => {
    for (const country of countries) {
      expect(resolveCountry(country.code)?.code).toBe(country.code);
      expect(resolveCountry(country.alpha3)?.code).toBe(country.code);
      expect(resolveCountry(country.name)?.code, country.name).toBe(country.code);
    }
  });

  it('gives Kosovo complete data', () => {
    const kosovo = getCountry('XK')!;
    expect(kosovo.callingCode).toBe('383');
    expect(kosovo.timezones).toEqual(['Europe/Belgrade']);
    expect(kosovo.currencies).toEqual(['EUR']);
  });

  it('only uses timezones the runtime knows', () => {
    for (const zone of listTimezones()) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }), zone).not.toThrow();
    }
    for (const country of countries) for (const zone of country.timezones) expect(isTimezone(zone), zone).toBe(true);
  });

  it('maps legacy timezone names to current ones', () => {
    expect(canonicalTimezone('Europe/Kiev')).toBe('Europe/Kyiv');
    expect(canonicalTimezone('asia/calcutta')).toBe('Asia/Kolkata');
    expect(canonicalTimezone('Mars/Olympus')).toBeNull();
  });

  it('gives every inhabited country a national language', () => {
    for (const country of countries) {
      if ((country.population ?? 0) > 0) expect(getNationalLanguages(country.code).length, country.code).toBeGreaterThan(0);
    }
  });

  it('only lists known codes in groups', () => {
    const codes = new Set(countries.map((country) => country.code));
    for (const group of listGroups()) for (const member of group.members) expect(codes.has(member.code), `${group.slug}: ${member.code}`).toBe(true);
  });
});

describe('meta', () => {
  it('records every source with a licence', () => {
    const meta = readData<{ sources: { file: string; licence: string; sha256: string }[] }>('meta.json');
    expect(meta.sources.length).toBeGreaterThan(10);
    for (const source of meta.sources) {
      expect(source.licence, source.file).toBeTruthy();
      expect(source.sha256, source.file).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
