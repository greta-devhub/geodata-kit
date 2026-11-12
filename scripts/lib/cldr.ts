import { existsSync } from 'node:fs';

import { readJson } from './io.js';
import { cachePath } from './paths.js';

const SUPPLEMENTAL = cachePath('cldr-core', 'package', 'supplemental');

export function supplemental<T>(file: string, key: string): T {
  const json = readJson<{ supplemental: Record<string, unknown> }>(`${SUPPLEMENTAL}/${file}.json`);
  return json.supplemental[key] as T;
}

export function localeDisplayNames(locale: string, kind: 'territories' | 'languages'): Record<string, string> | null {
  const path = cachePath('cldr-localenames-full', 'package', 'main', locale, `${kind}.json`);
  if (!existsSync(path)) return null;
  const json = readJson<{ main: Record<string, { localeDisplayNames: Record<string, Record<string, string>> }> }>(path);
  const root = Object.values(json.main)[0];
  return root?.localeDisplayNames[kind] ?? null;
}

export function availableLocales(): string[] {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  return readdirSync(cachePath('cldr-localenames-full', 'package', 'main')).sort();
}

/** English subdivision names keyed by CLDR id (e.g. "deby" → "Bavaria"). */
export function subdivisionNames(locale: string): Record<string, string> {
  const path = cachePath('cldr-subdivisions-full', 'package', 'subdivisions', locale, `${locale}.json`);
  if (!existsSync(path)) return {};
  const json = readJson<{ subdivisions: { localeDisplayNames: { subdivisions: Record<string, string> } } }>(path);
  return json.subdivisions.localeDisplayNames.subdivisions;
}

/** CLDR subdivision id ("deby") → ISO 3166-2 ("DE-BY"). */
export function cldrSubdivisionToIso(id: string): string {
  return `${id.slice(0, 2).toUpperCase()}-${id.slice(2).toUpperCase()}`;
}
