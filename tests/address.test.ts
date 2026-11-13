import { describe, expect, it } from 'vitest';

import { fold, listCountries } from 'geodata-kit';
import { getPostalCodeRules, normalizePostalCode } from 'geodata-kit-address';
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
