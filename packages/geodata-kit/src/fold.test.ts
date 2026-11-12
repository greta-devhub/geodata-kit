import { describe, expect, it } from 'vitest';

import { fold } from './fold.js';

describe('fold', () => {
  it('lowercases and removes accents', () => {
    expect(fold('São Paulo')).toBe('sao paulo');
    expect(fold('MÜNCHEN')).toBe('munchen');
    expect(fold('Łódź')).toBe('lodz');
    expect(fold('Großenhain')).toBe('grossenhain');
  });

  it('drops apostrophes of any kind', () => {
    expect(fold("Kane'ohe")).toBe('kaneohe');
    expect(fold('Kaneʻohe')).toBe('kaneohe');
    expect(fold('Kane´ohe')).toBe(fold("Kane'ohe"));
    expect(fold('Coeur d’Alene')).toBe('coeur dalene');
  });

  it('turns punctuation into single spaces', () => {
    expect(fold('  Washington,  D.C. ')).toBe('washington d c');
    expect(fold('Winston-Salem')).toBe('winston salem');
  });

  it('treats "Saint" and "St." the same', () => {
    expect(fold('Saint Louis')).toBe('st louis');
    expect(fold('St. Louis')).toBe('st louis');
    expect(fold('Sainte-Foy')).toBe('ste foy');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(fold('')).toBe('');
    expect(fold(' - , ')).toBe('');
  });

  it('folds letters NFKD does not split', () => {
    expect(fold('Ærøskøbing')).toBe('aeroskobing');
    expect(fold('Þórshöfn')).toBe('thorshofn');
    expect(fold('Đà Nẵng')).toBe('da nang');
    expect(fold('Türkiye')).toBe('turkiye');
  });
});
