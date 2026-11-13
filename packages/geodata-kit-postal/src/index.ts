/**
 * geodata-kit-postal — postal code → places and place → postal codes for 124
 * countries (1.8 million codes). Node.js only.
 *
 * For GB, CA and NL the data has the first part of the code only
 * ("SW1A", "K1A", "1234"); full codes are matched by that first part.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export interface PostalPlace {
  postalCode: string;
  /** Place name as published by the postal service. */
  name: string;
  /** First-level subdivision name and code as used by the postal data (the code may differ from ISO 3166-2). */
  subdivisionName: string;
  subdivisionCode: string;
  /** County / district names, where given. */
  subdivision2Name: string;
  subdivision3Name: string;
  lat: number;
  lng: number;
}

type Row = [string, string, string, string, string, string, number, number];

const DATA_DIR = new URL('../data/', import.meta.url);

interface CountryPostal { places: PostalPlace[]; byCode: Map<string, PostalPlace[]>; codeLengths: number[] }
const cache = new Map<string, Promise<CountryPostal | null>>();

const compact = (code: string): string => code.toUpperCase().replace(/[\s-]/g, '');

/**
 * Same folding as geodata-kit's fold() (kept identical; a test checks it):
 * lower case, no accents, no punctuation, "saint" → "st".
 */
export function foldName(text: string): string {
  const special: Record<string, string> = { 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ı': 'i' };
  let plain = '';
  for (const character of text.replace(/['’ʻʼ`´]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()) {
    plain += special[character] ?? character;
  }
  return plain.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean)
    .map((word) => (word === 'saint' ? 'st' : word === 'sainte' ? 'ste' : word)).join(' ');
}

function load(country: string): Promise<CountryPostal | null> {
  const code = country.trim().toUpperCase();
  let promise = cache.get(code);
  if (!promise) {
    promise = (async () => {
      const file = new URL(`${code}.json.gz`, DATA_DIR);
      if (!/^[A-Z]{2}$/.test(code) || !existsSync(file)) return null;
      const data = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as { rows: Row[] };
      const places = data.rows.map((row): PostalPlace => ({
        postalCode: row[0], name: row[1], subdivisionName: row[2], subdivisionCode: row[3],
        subdivision2Name: row[4], subdivision3Name: row[5], lat: row[6], lng: row[7],
      }));
      const byCode = new Map<string, PostalPlace[]>();
      for (const place of places) {
        const key = compact(place.postalCode);
        const list = byCode.get(key);
        if (list) list.push(place); else byCode.set(key, [place]);
      }
      return { places, byCode, codeLengths: [...new Set([...byCode.keys()].map((key) => key.length))].sort((a, b) => b - a) };
    })();
    cache.set(code, promise);
  }
  return promise;
}

function lookup(data: CountryPostal, code: string): PostalPlace[] {
  // Strip prefixes such as "D-", "CH-", "DE-" in front of a digit.
  const key = compact(code.trim().replace(/^[A-Z]{1,3}-(?=\d)/i, '').replace(/^〒/, ''));
  const exact = data.byCode.get(key);
  if (exact) return exact;
  // Partial codes (GB "SW1A", CA "K1A", NL "1234"): try the leading part.
  for (const length of data.codeLengths) {
    if (length >= key.length) continue;
    const partial = data.byCode.get(key.slice(0, length));
    if (partial) return partial;
  }
  return [];
}

/** Places with this postal code: ("80331", "DE") → München. Prefixes and spacing are ignored. */
export async function findPlacesByPostalCode(code: string, country: string): Promise<PostalPlace[]> {
  const data = await load(country);
  return data ? lookup(data, code).map((place) => ({ ...place })) : [];
}

/** True if the postal code exists in the country's data. */
export async function isKnownPostalCode(code: string, country: string): Promise<boolean> {
  return (await findPlacesByPostalCode(code, country)).length > 0;
}

/** Postal codes of a place: ({ city: 'Unterhaching', country: 'DE' }) → ["82008"]. */
export async function findPostalCodes(options: { city: string; country: string; subdivision?: string }): Promise<string[]> {
  const data = await load(options.country);
  if (!data) return [];
  const key = foldName(options.city);
  const subdivision = options.subdivision ? foldName(options.subdivision) : null;
  const codes = new Set<string>();
  for (const place of data.places) {
    if (foldName(place.name) !== key) continue;
    if (subdivision && foldName(place.subdivisionName) !== subdivision && foldName(place.subdivisionCode) !== subdivision) continue;
    codes.add(place.postalCode);
  }
  return [...codes].sort();
}

/** Countries with postal data. */
export function listPostalCountries(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((file) => file.endsWith('.json.gz')).map((file) => file.slice(0, 2)).sort();
}
