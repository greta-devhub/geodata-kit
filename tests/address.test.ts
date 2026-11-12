import { describe, expect, it } from 'vitest';

import { getPostalCodeRules, normalizePostalCode } from '../packages/geodata-kit/src/address.js';
import { fold } from '../packages/geodata-kit/src/fold.js';
import { listCountries } from '../packages/geodata-kit/src/index.js';
import { foldName } from '../packages/geodata-kit-postal/src/index.js';

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
