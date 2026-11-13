import { describe, expect, it } from 'vitest';

import { fold, listCountries } from 'geodata-kit';
import { formatAddress, getPostalCodeRules, normalizePostalCode, parseAddress, type PostalAddress } from 'geodata-kit-address';
import { foldName } from 'geodata-kit-postal';

describe('postal-code rules', () => {
  it('accepts every example code of every country', () => {
    const failures: string[] = [];
    for (const country of listCountries()) {
      const rules = getPostalCodeRules(country.code);
      for (const example of rules?.examples ?? []) {
        if (normalizePostalCode(example, country.code) === null) failures.push(`${country.code} ${example}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('geodata-kit-postal', () => {
  it('folds names exactly like geodata-kit', () => {
    for (const text of ['München', 'São Paulo', "Kane'ohe", 'St. Louis', 'Großenhain', 'Łódź', 'Ærøskøbing', 'Sainte-Foy']) {
      expect(foldName(text)).toBe(fold(text));
    }
  });
});

describe('formatAddress then parseAddress', () => {
  const addresses: PostalAddress[] = [
    { name: 'Jane Doe', addressLines: ['1600 Pennsylvania Avenue NW'], city: 'Washington', region: 'DC', postalCode: '20500', country: 'US' },
    { addressLines: ['1 Market St'], city: 'San Francisco', region: 'CA', postalCode: '94103', country: 'US' },
    { addressLines: ['350 Fifth Avenue'], city: 'New York', region: 'NY', postalCode: '10118', country: 'US' },
    { addressLines: ['1 Main St', 'Suite 4'], city: 'Austin', region: 'TX', postalCode: '78701-1234', country: 'US' },
    { addressLines: ['24 Sussex Drive'], city: 'Ottawa', region: 'ON', postalCode: 'K1M 1M4', country: 'CA' },
    { addressLines: ['Hauptstr. 1'], city: 'München', postalCode: '80331', country: 'DE' },
    { addressLines: ['Bahnhofstrasse 1'], city: 'Zürich', postalCode: '8001', country: 'CH' },
  ];
  const same = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

  for (const address of addresses) {
    for (const mode of ['with the country given', 'with the country on the last line'] as const) {
      it(`gives the same fields back: ${address.city}, ${mode}`, async () => {
        const lines = formatAddress(address, { includeCountry: mode === 'with the country on the last line' });
        const parsed = await parseAddress(lines.join('\n'), mode === 'with the country given' ? { country: address.country } : {});
        expect(parsed.country).toBe(address.country);
        expect(parsed.postalCode).toBe(address.postalCode);
        expect(same(parsed.city, address.city), `city ${parsed.city}`).toBe(true);
        expect(parsed.region ?? null).toBe(address.region ?? null);
        expect(parsed.lines.map((line) => line.toLowerCase())).toEqual([address.name, ...(address.addressLines ?? [])].filter(Boolean).map((line) => line!.toLowerCase()));
      });
    }
  }

  it('finds the country of a US and a Canadian address without being told', async () => {
    for (const address of addresses.filter((entry) => entry.region)) {
      const parsed = await parseAddress(formatAddress(address).join('\n'));
      expect(parsed.country, address.city ?? '').toBe(address.country);
      expect(parsed.region, address.city ?? '').toBe(address.region);
    }
  });
});

describe('postal prefixes', () => {
  it('strips every prefix of every country in front of its example codes', () => {
    const failures: string[] = [];
    for (const country of listCountries()) {
      const rules = getPostalCodeRules(country.code);
      const example = rules?.examples[0];
      if (!rules || !example) continue;
      const expected = normalizePostalCode(example, country.code);
      // Latvia's codes carry the prefix themselves ("LV-1073"), so it is not put in front again.
      for (const prefix of rules.prefixes.filter((entry) => !example.startsWith(entry))) {
        if (normalizePostalCode(`${prefix}${example}`, country.code) !== expected) failures.push(`${country.code} ${prefix}${example}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('finds the country from every prefix that ends in a dash', async () => {
    const failures: string[] = [];
    for (const country of listCountries()) {
      const rules = getPostalCodeRules(country.code);
      const example = rules?.examples[0];
      if (!rules || !example) continue;
      for (const prefix of rules.prefixes.filter((entry) => entry.endsWith('-') && !example.startsWith(entry))) {
        const parsed = await parseAddress(`Main Street 1, ${prefix}${example} Sometown`);
        if (parsed.country !== country.code || parsed.postalCode !== normalizePostalCode(example, country.code)) {
          failures.push(`${prefix}${example}: ${parsed.country} ${parsed.postalCode}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('country arguments', () => {
  it('are read the same way by every function: code or name, unknown gives null or an empty list', async () => {
    const address = await import('geodata-kit-address');
    for (const name of ['DE', 'de', 'Germany', 'Deutschland', 'Allemagne']) {
      expect(address.getAddressFormat(name)?.pattern, name).toBe(address.getAddressFormat('DE')!.pattern);
      expect(address.getRequiredAddressFields(name), name).toEqual(address.getRequiredAddressFields('DE'));
      expect(address.getPostalCodeRules(name)?.prefixes, name).toEqual(['D-', 'DE-']);
      expect(address.normalizePostalCode('D-80331', name), name).toBe('80331');
      expect(address.isValidPostalCode('80331', name), name).toBe(true);
      expect(address.formatAddress({ city: 'Berlin', postalCode: '10117', country: name }), name).toEqual(['10117 Berlin']);
      expect((await address.parseAddress('10117 Berlin', { country: name })).city, name).toBe('Berlin');
    }
    expect(address.listRegions('United States').length).toBe(address.listRegions('US').length);
    expect(address.resolveRegion('Texas', 'USA')?.key).toBe('TX');
    expect(address.isValidRegion('TX', 'United States of America')).toBe(true);
    for (const unknown of ['ZZ', 'Atlantis', '']) {
      expect(address.getAddressFormat(unknown)).toBeNull();
      expect(address.getRequiredAddressFields(unknown)).toEqual([]);
      expect(address.listRegions(unknown)).toEqual([]);
      expect(address.resolveRegion('Texas', unknown)).toBeNull();
      expect(address.isValidRegion('TX', unknown)).toBe(false);
      expect(address.getPostalCodeRules(unknown)).toBeNull();
      expect(address.normalizePostalCode('80331', unknown)).toBeNull();
      expect(address.isValidPostalCode('80331', unknown)).toBe(false);
      expect(address.formatAddress({ city: 'Berlin', country: unknown })).toEqual([]);
      expect((await address.parseAddress('10117 Berlin', { country: unknown })).country).toBeNull();
    }
  });
});

describe('postal-code ranges', () => {
  it('follow the report of the data build: enforced only where every real code agrees', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const report = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'reports', 'address.json'), 'utf8')) as Record<string, string>;
    const enforced = Object.entries(report).filter(([, note]) => note.startsWith('region ranges enforced')).map(([code]) => code);
    expect(enforced).toEqual(expect.arrayContaining(['ES', 'IN', 'US', 'JP']));
    for (const code of ['BR', 'IT', 'RU', 'TR', 'UY']) expect(report[code], code).toContain('region ranges not enforced');
  });
});
