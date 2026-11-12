/**
 * Runs the language-neutral golden files in tests/golden/. The same files are
 * run by the Python test suite (python/tests/test_golden.py), so both
 * implementations must agree.
 *
 * Case format: { fn, args, path?, op?, expect, note? }
 *   path: property path into the result: "code", "[].code" (map an array), "subregion.name", "length"
 *   op:   eq (default, deep equal) | includesAll | sameMembers | gte | lte | startsWith
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GoldenCase {
  fn: string;
  args: unknown[];
  path?: string;
  op?: 'eq' | 'includesAll' | 'sameMembers' | 'gte' | 'lte' | 'startsWith';
  expect: unknown;
  note?: string;
}

export interface GoldenFile { description: string; cases: GoldenCase[] }

export const GOLDEN_DIR = join(import.meta.dirname, 'golden');

export function readGoldenFiles(): [string, GoldenFile][] {
  return readdirSync(GOLDEN_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => [file, JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8')) as GoldenFile]);
}

export function applyPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current: unknown = value;
  const parts = path.split('.');
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (current === null || current === undefined) return current;
    if (part === '[]') {
      const rest = parts.slice(index + 1).join('.');
      return (current as unknown[]).map((item) => applyPath(item, rest || undefined));
    }
    if (part === 'length') { current = (current as unknown[]).length; continue; }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function check(actual: unknown, testCase: GoldenCase): string | null {
  const expected = testCase.expect;
  const show = (value: unknown): string => JSON.stringify(value);
  switch (testCase.op ?? 'eq') {
    case 'eq':
      return JSON.stringify(actual ?? null) === JSON.stringify(expected) ? null : `expected ${show(expected)}, got ${show(actual)}`;
    case 'includesAll': {
      const list = (actual ?? []) as unknown[];
      const missing = (expected as unknown[]).filter((item) => !list.includes(item));
      return missing.length ? `missing ${show(missing)} in ${show(actual)}` : null;
    }
    case 'sameMembers': {
      const a = [...((actual ?? []) as string[])].sort();
      const b = [...(expected as string[])].sort();
      return show(a) === show(b) ? null : `expected members ${show(b)}, got ${show(a)}`;
    }
    case 'gte':
      return (actual as number) >= (expected as number) ? null : `expected ≥ ${show(expected)}, got ${show(actual)}`;
    case 'lte':
      return (actual as number) <= (expected as number) ? null : `expected ≤ ${show(expected)}, got ${show(actual)}`;
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(expected as string) ? null : `expected to start with ${show(expected)}, got ${show(actual)}`;
  }
}
