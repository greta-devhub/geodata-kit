import type { DateInput } from '../types.js';

/** NFKC, zero-width characters removed, whitespace collapsed, trimmed. */
export function cleanInput(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toIsoDate(date: DateInput | undefined): string {
  if (date === undefined) return new Date().toISOString().slice(0, 10);
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/** True when `day` is inside [from, to] (both inclusive, open ends allowed). */
export function isActive(range: { from?: string | null; to?: string | null }, day: string): boolean {
  return (!range.from || range.from <= day) && (!range.to || range.to >= day);
}

/** "de-CH" → "de", "pt_BR" → "pt", "zh-Hant-TW" → "zh-Hant". */
export function languageBase(tag: string): string {
  const parts = tag.replace(/_/g, '-').split('-');
  const kept = [parts[0]!.toLowerCase()];
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(part)) kept.push(part[0]!.toUpperCase() + part.slice(1).toLowerCase());
  }
  return kept.join('-');
}

/** Picks the bundled locale for a requested one: "de-AT" → "de", unknown → "en". */
export function pickLocale(locale: string | undefined, available: readonly string[]): string {
  if (!locale) return 'en';
  const lower = locale.toLowerCase().replace(/_/g, '-');
  if (available.includes(lower)) return lower;
  const base = lower.split('-')[0]!;
  return available.includes(base) ? base : 'en';
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}
