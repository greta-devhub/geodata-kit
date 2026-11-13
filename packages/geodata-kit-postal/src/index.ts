/**
 * geodata-kit-postal — postal code → places and place → postal codes for 124
 * countries (1.8 million codes). Node.js only.
 *
 * For GB, CA and NL the data has the first part of the code only
 * ("SW1A", "K1A", "1234"); full codes are matched by that first part.
 *
 * Lookups forgive two common data problems: a numeric code that lost its
 * leading zeros in a spreadsheet ("2134" for 02134), and, when
 * geodata-kit-cities is installed, a city name in another language
 * ("Munich" for München).
 */
import { dataDate } from '../../../data/meta.json';
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

interface CountryPostal {
  places: PostalPlace[];
  byCode: Map<string, PostalPlace[]>;
  codeLengths: number[];
  /** Length of the all-digit codes when they all have one length (US 5, DE 5, FR 5), else null. */
  fixedDigits: number | null;
}
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
      const codeLengths = [...new Set([...byCode.keys()].map((key) => key.length))].sort((a, b) => b - a);
      const digitLengths = new Set([...byCode.keys()].filter((key) => /^\d+$/.test(key)).map((key) => key.length));
      const fixedDigits = digitLengths.size === 1 ? [...digitLengths][0]! : null;
      return { places, byCode, codeLengths, fixedDigits };
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
  // Spreadsheets drop leading zeros: "2134" is Boston's 02134, "1067" is Dresden's 01067.
  if (data.fixedDigits && /^\d+$/.test(key) && key.length < data.fixedDigits && key.length >= data.fixedDigits - 2) {
    return data.byCode.get(key.padStart(data.fixedDigits, '0')) ?? [];
  }
  return [];
}

/**
 * Places with this postal code: ("80331", "DE") → München. Prefixes and spacing
 * are ignored, and up to two lost leading zeros are restored in countries whose
 * codes are all digits of one length: ("2134", "US") → the places of 02134.
 */
export async function findPlacesByPostalCode(code: string, country: string): Promise<PostalPlace[]> {
  const data = await load(country);
  return data ? lookup(data, code).map((place) => ({ ...place })) : [];
}

/** True if the postal code exists in the country's data. */
export async function isKnownPostalCode(code: string, country: string): Promise<boolean> {
  return (await findPlacesByPostalCode(code, country)).length > 0;
}

interface CityLike { name: string; asciiName: string; alternateNames: string[]; lat: number; lng: number }
type FindCity = (name: string, options: { country: string }) => Promise<CityLike | null>;
let citiesModule: Promise<{ findCity: FindCity } | null> | null = null;

/** geodata-kit-cities, when installed. The name is in a variable so bundlers don't try to resolve it. */
function importCities(): Promise<{ findCity: FindCity } | null> {
  const name = 'geodata-kit-cities';
  citiesModule ??= import(/* webpackIgnore: true */ /* @vite-ignore */ name).catch(() => null);
  return citiesModule;
}

const kmBetween = (latA: number, lngA: number, latB: number, lngB: number): number =>
  Math.hypot(latA - latB, (lngA - lngB) * Math.cos((latA * Math.PI) / 180)) * 111.2;

/**
 * Postal codes of a place: ({ city: 'Unterhaching', country: 'DE' }) → ["82008"].
 *
 * The postal data has each place under its local name. With geodata-kit-cities
 * installed, a name in another language works too: ({ city: 'Munich', country:
 * 'DE' }) finds the codes of München. Only places within 30 km of that city
 * are taken, so a different town that shares one of its names is not mixed in.
 */
export async function findPostalCodes(options: { city: string; country: string; subdivision?: string }): Promise<string[]> {
  const data = await load(options.country);
  if (!data || typeof options.city !== 'string') return [];
  const subdivision = options.subdivision ? foldName(options.subdivision) : null;
  const collect = (keys: Set<string>, near?: CityLike): string[] => {
    const codes = new Set<string>();
    for (const place of data.places) {
      if (!keys.has(foldName(place.name))) continue;
      if (subdivision && foldName(place.subdivisionName) !== subdivision && foldName(place.subdivisionCode) !== subdivision) continue;
      if (near && kmBetween(near.lat, near.lng, place.lat, place.lng) > 30) continue;
      codes.add(place.postalCode);
    }
    return [...codes].sort();
  };
  const direct = collect(new Set([foldName(options.city)]));
  if (direct.length) return direct;
  const city = await (await importCities())?.findCity(options.city, { country: options.country }).catch(() => null);
  if (!city) return [];
  return collect(new Set([city.name, city.asciiName, ...city.alternateNames].map(foldName)), city);
}

/** Countries with postal data. */
export function listPostalCountries(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((file) => file.endsWith('.json.gz')).map((file) => file.slice(0, 2)).sort();
}

/**
 * Date of the data in this version, as YYYY-MM-DD. The data is refreshed about
 * once a month; every package of one version carries the same date.
 */
export const DATA_DATE: string = dataDate;
