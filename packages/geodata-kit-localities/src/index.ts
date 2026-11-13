/**
 * geodata-kit-localities — villages, hamlets and city districts
 * that are not in geodata-kit-cities (4.9 million places), one gzip file per country.
 *
 * Install it next to geodata-kit and the city functions use it automatically
 * (tier 'all'). It can also be used on its own.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

/** [geonameid, name, asciiName|0, featureCode, population, lat, lng, a1, a2, a3, a4, tzIndex, parentId|0] */
export type LocalityRow = [number, string, string | 0, string, number, number, number, string, string, string, string, number, number | 0];

export interface LocalityFile {
  /** Timezones referenced by tzIndex. */
  tz: string[];
  rows: LocalityRow[];
}

const DATA_DIR = new URL('../data/', import.meta.url);

/** Raw locality rows of a country, or null when the country has none. Not cached: geodata-kit caches what it loads. */
export async function loadLocalities(country: string): Promise<LocalityFile | null> {
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const file = new URL(`${code}.json.gz`, DATA_DIR);
  if (!existsSync(file)) return null;
  return JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as LocalityFile;
}

/** Countries with locality data. */
export function listLocalityCountries(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((file) => file.endsWith('.json.gz')).map((file) => file.slice(0, 2)).sort();
}
