/**
 * geodata-kit-cities — every GeoNames populated place with 500+ inhabitants
 * (cities500, 237k places) and, with the optional geodata-kit-localities
 * package, 4.9M more villages, hamlets and city districts.
 *
 * Data loads per country and per tier on first use, so all functions are async.
 *
 * Tiers (GeoNames' own cut-offs; each includes the bigger ones):
 *   15000  cities with 15,000+ inhabitants or capitals        (34k)
 *    5000  5,000+ or seats of first-level subdivisions        (70k)
 *    1000  1,000+ or seats down to third-level subdivisions   (172k)
 *     500  500+ or seats down to fourth-level subdivisions    (237k, default)
 *   'all' cities500 + localities (needs geodata-kit-localities)
 */
import { cleanText, fold, getCountry, getPrimaryTimezone, normalizeCountryCode, resolveCountry } from 'geodata-kit';
import { resolveSubdivision, type Subdivision } from 'geodata-kit-subdivisions';

import { CITY_LOADERS, loadIndex } from './loaders.generated.js';

export type Tier = 15000 | 5000 | 1000 | 500 | 'all';
type Band = 15000 | 5000 | 1000 | 500;
const BANDS: readonly Band[] = [15000, 5000, 1000, 500];

export interface City {
  geonameId: number;
  name: string;
  asciiName: string;
  country: string;
  /** GeoNames subdivision codes (level 1–4); see geodata-kit-subdivisions. */
  admin1: string;
  admin2: string;
  admin3: string;
  admin4: string;
  /** GeoNames feature code: PPLC capital, PPLA seat of a first-level subdivision, PPL place, PPLX district, … */
  featureCode: string;
  population: number;
  lat: number;
  lng: number;
  timezone: string;
  /** Smallest tier the place belongs to; 'locality' for places from geodata-kit-localities. */
  tier: Band | 'locality';
  kind: 'city' | 'locality' | 'neighbourhood';
  /** UN/LOCODE, e.g. "DEHAM". */
  unlocode: string | null;
  wikidataId: string | null;
  /** Other names (Latin script): "München", "Munique" for Munich. */
  alternateNames: string[];
  /** For neighbourhoods: the city they belong to. */
  parentId: number | null;
}

type Row = [number, string, string | 0, string, number, number, number, string, string, string, string, number, string[] | 0, string | 0, string | 0];
interface BandFile { tz: string[]; rows: Row[] }
type LocalityRow = [number, string, string | 0, string, number, number, number, string, string, string, string, number, number | 0];

const TIER_RANK: Record<Band | 'locality', number> = { 15000: 0, 5000: 1, 1000: 2, 500: 3, locality: 4 };
const FEATURE_RANK: Record<string, number> = {
  PPLC: 0, PPLG: 1, PPLA: 2, PPLA2: 3, PPLA3: 4, PPLA4: 5, PPLA5: 6, PPL: 7, PPLS: 8, PPLF: 9, PPLR: 9, PPLL: 10, PPLX: 11,
};

function compareCities(a: City, b: City): number {
  return b.population - a.population
    || (FEATURE_RANK[a.featureCode] ?? 12) - (FEATURE_RANK[b.featureCode] ?? 12)
    || a.geonameId - b.geonameId;
}

function inTier(city: City, tier: Tier): boolean {
  if (tier === 'all') return true;
  return TIER_RANK[city.tier] <= TIER_RANK[tier];
}

// ─── Loading ──────────────────────────────────────────────────────────────

interface CountryStore {
  bands: Set<Band>;
  cities: City[];
  byId: Map<number, City>;
  main: Map<string, City[]>;
  alternate: Map<string, City[]>;
  pending: Map<Band, Promise<void>>;
}

const stores = new Map<string, CountryStore>();

function store(country: string): CountryStore {
  let entry = stores.get(country);
  if (!entry) {
    entry = { bands: new Set(), cities: [], byId: new Map(), main: new Map(), alternate: new Map(), pending: new Map() };
    stores.set(country, entry);
  }
  return entry;
}

function addToIndex(index: Map<string, City[]>, key: string, city: City): void {
  if (!key) return;
  const list = index.get(key);
  if (list) list.push(city); else index.set(key, [city]);
}

function rebuildAlternateIndex(entry: CountryStore): void {
  // Alternate names only fill keys that no city in the country uses as its
  // main name, so a town really called "Monaco" is never hidden by an alias.
  entry.alternate = new Map();
  for (const city of entry.cities) {
    for (const name of city.alternateNames) {
      const key = fold(name);
      if (!entry.main.has(key)) addToIndex(entry.alternate, key, city);
    }
  }
}

async function loadBand(country: string, band: Band): Promise<void> {
  const entry = store(country);
  if (entry.bands.has(band)) return;
  let pending = entry.pending.get(band);
  if (!pending) {
    const loader = (CITY_LOADERS as Record<string, Record<string, () => Promise<{ default: unknown }>>>)[country]?.[String(band)];
    pending = (async () => {
      if (!loader) { entry.bands.add(band); return; }
      const file = (await loader()).default as BandFile;
      for (const row of file.rows) {
        const city: City = {
          geonameId: row[0], name: row[1], asciiName: row[2] || row[1], country,
          admin1: row[7], admin2: row[8], admin3: row[9], admin4: row[10],
          featureCode: row[3], population: row[4], lat: row[5], lng: row[6], timezone: file.tz[row[11]]!,
          tier: band, kind: 'city', unlocode: row[13] || null, wikidataId: row[14] || null,
          alternateNames: row[12] || [], parentId: null,
        };
        entry.cities.push(city);
        entry.byId.set(city.geonameId, city);
        addToIndex(entry.main, fold(city.name), city);
        if (city.asciiName !== city.name) addToIndex(entry.main, fold(city.asciiName), city);
      }
      entry.bands.add(band);
      rebuildAlternateIndex(entry);
    })();
    entry.pending.set(band, pending);
  }
  await pending;
}

async function loadCountry(country: string, tier: Tier): Promise<CountryStore> {
  const wanted = tier === 'all' ? BANDS : BANDS.slice(0, BANDS.indexOf(tier) + 1);
  await Promise.all(wanted.map((band) => loadBand(country, band)));
  return store(country);
}

/** Loads cities for these countries now, e.g. at server start. */
export async function preloadCities(countries: Iterable<string>, options: { tier?: Tier } = {}): Promise<void> {
  await Promise.all([...countries].map((code) => {
    const country = normalizeCountryCode(code);
    return country ? loadCountry(country, options.tier ?? 500) : undefined;
  }));
}

function allCountryCodes(): string[] {
  return Object.keys(CITY_LOADERS as Record<string, unknown>);
}

// ─── Optional localities package ──────────────────────────────────────────

interface LocalityStore { cities: City[]; main: Map<string, City[]> }
const localityStores = new Map<string, Promise<LocalityStore | null>>();
let localitiesModule: Promise<{ loadLocalities: (country: string) => Promise<{ tz: string[]; rows: LocalityRow[] } | null> } | null> | null = null;

/** True when geodata-kit-localities is installed. */
export async function hasLocalities(): Promise<boolean> {
  return (await importLocalities()) !== null;
}

function importLocalities(): Promise<{ loadLocalities: (country: string) => Promise<{ tz: string[]; rows: LocalityRow[] } | null> } | null> {
  // The package name is in a variable so bundlers don't try to resolve it when it isn't installed.
  const name = 'geodata-kit-localities';
  localitiesModule ??= import(/* webpackIgnore: true */ /* @vite-ignore */ name).catch(() => null);
  return localitiesModule;
}

function loadLocalityStore(country: string): Promise<LocalityStore | null> {
  let promise = localityStores.get(country);
  if (!promise) {
    promise = (async () => {
      const module = await importLocalities();
      const data = module ? await module.loadLocalities(country) : null;
      if (!data) return null;
      const result: LocalityStore = { cities: [], main: new Map() };
      for (const row of data.rows) {
        const city: City = {
          geonameId: row[0], name: row[1], asciiName: row[2] || row[1], country,
          admin1: row[7], admin2: row[8], admin3: row[9], admin4: row[10],
          featureCode: row[3], population: row[4], lat: row[5], lng: row[6], timezone: data.tz[row[11]]!,
          tier: 'locality', kind: row[3] === 'PPLX' ? 'neighbourhood' : 'locality',
          unlocode: null, wikidataId: null, alternateNames: [], parentId: row[12] || null,
        };
        result.cities.push(city);
        addToIndex(result.main, fold(city.name), city);
        if (city.asciiName !== city.name) addToIndex(result.main, fold(city.asciiName), city);
      }
      return result;
    })();
    localityStores.set(country, promise);
  }
  return promise;
}

// ─── Lookups ──────────────────────────────────────────────────────────────

function toCountryCode(country: string | undefined | null): string | null {
  if (!country) return null;
  return normalizeCountryCode(country) ?? resolveCountry(country)?.code ?? null;
}

/** Subdivision filter: ISO code ("US-MO"), name ("Missouri", "Bayern") or a Subdivision. */
type SubdivisionInput = string | Subdivision;

function subdivisionFilter(country: string, subdivision: SubdivisionInput | undefined): ((city: City) => boolean) | null {
  if (!subdivision) return null;
  const resolved = typeof subdivision === 'string' ? resolveSubdivision(subdivision, country) : subdivision;
  if (!resolved || resolved.country !== country) return () => false;
  const parts = resolved.path.split('.');
  return (city) => [city.admin1, city.admin2, city.admin3, city.admin4].slice(0, parts.length).join('.') === resolved.path;
}

/** Removes postal codes and similar noise around a city name: "80331 München", "D-80331 München", "Paris 75008". */
function cleanCityName(text: string): string {
  return cleanText(text)
    .replace(/\b[A-Z]{1,3}-\d{3,6}\b/g, ' ')
    .replace(/(^|\s)\d{3,6}(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FindCityOptions {
  /** Country code or name (required). */
  country: string;
  /** Limit to a subdivision: "US-MO", "Missouri", "Bayern". */
  subdivision?: SubdivisionInput;
  /** Default 500. 'all' also searches geodata-kit-localities when installed. */
  tier?: Tier;
}

/**
 * The best match for a place name in a country: exact name or ASCII name first,
 * then alternate names (München → Munich); several matches are ranked by
 * population, then capital/seat status. "Springfield" + subdivision "US-MO"
 * picks Springfield, Missouri.
 */
export async function findCity(name: string, options: FindCityOptions): Promise<City | null> {
  return (await findCityCandidates(name, options))[0] ?? null;
}

async function findCityCandidates(name: string, options: FindCityOptions): Promise<City[]> {
  const country = toCountryCode(options.country);
  if (!country || typeof name !== 'string') return [];
  const tier = options.tier ?? 500;
  const key = fold(cleanCityName(name));
  if (!key) return [];
  const filter = subdivisionFilter(country, options.subdivision);
  const entry = await loadCountry(country, tier);
  const pick = (list: City[] | undefined): City[] =>
    (list ?? []).filter((city) => inTier(city, tier) && (!filter || filter(city))).sort(compareCities);

  let matches = pick(entry.main.get(key));
  if (!matches.length) matches = pick(entry.alternate.get(key));
  if (!matches.length && tier === 'all') {
    const localities = await loadLocalityStore(country);
    if (localities) matches = (localities.main.get(key) ?? []).filter((city) => !filter || filter(city)).sort(compareCities);
  }
  return matches;
}

export interface SearchCitiesOptions {
  /** Without a country, every country is loaded (fine on a server, heavy in a browser). */
  country?: string;
  subdivision?: SubdivisionInput;
  minPopulation?: number;
  tier?: Tier;
  limit?: number;
}

/** Autocomplete-style search: names (and alternate names) starting with the query, biggest first. */
export async function searchCities(query: string, options: SearchCitiesOptions = {}): Promise<City[]> {
  const key = fold(cleanText(query));
  if (!key) return [];
  const tier = options.tier ?? 500;
  const countries = options.country ? [toCountryCode(options.country)].filter((code): code is string => code !== null) : allCountryCodes();
  const results = new Map<number, City>();
  for (const country of countries) {
    const entry = await loadCountry(country, tier);
    const filter = subdivisionFilter(country, options.subdivision);
    for (const index of [entry.main, entry.alternate]) {
      for (const [name, list] of index) {
        if (!name.startsWith(key) && !name.includes(` ${key}`)) continue;
        for (const city of list) {
          if (!inTier(city, tier) || (filter && !filter(city))) continue;
          if (options.minPopulation !== undefined && city.population < options.minPopulation) continue;
          results.set(city.geonameId, city);
        }
      }
    }
  }
  const exact = (city: City): number => (fold(city.name) === key || fold(city.asciiName) === key ? 0 : 1);
  return [...results.values()].sort((a, b) => exact(a) - exact(b) || compareCities(a, b)).slice(0, options.limit ?? 10);
}

/** All cities of a country (optionally in a subdivision), biggest first. */
export async function listCities(options: { country: string; subdivision?: SubdivisionInput; minPopulation?: number; tier?: Tier }): Promise<City[]> {
  const country = toCountryCode(options.country);
  if (!country) return [];
  const tier = options.tier ?? 500;
  const entry = await loadCountry(country, tier);
  const filter = subdivisionFilter(country, options.subdivision);
  return entry.cities
    .filter((city) => inTier(city, tier) && (!filter || filter(city)) && (options.minPopulation === undefined || city.population >= options.minPopulation))
    .sort(compareCities);
}

let idIndex: Promise<{ byId: Map<number, string>; wikidata: Record<string, string> }> | null = null;
function loadIdIndex(): Promise<{ byId: Map<number, string>; wikidata: Record<string, string> }> {
  idIndex ??= loadIndex().then((module) => {
    const data = module.default as { ids: Record<string, number[]>; wikidata: Record<string, string> };
    const byId = new Map<number, string>();
    for (const [country, deltas] of Object.entries(data.ids)) {
      let id = 0;
      for (const delta of deltas) { id += delta; byId.set(id, country); }
    }
    return { byId, wikidata: data.wikidata };
  });
  return idIndex;
}

/** A city by GeoNames id (cities500 only). */
export async function getCity(geonameId: number): Promise<City | null> {
  const country = (await loadIdIndex()).byId.get(geonameId);
  if (!country) return null;
  return (await loadCountry(country, 500)).byId.get(geonameId) ?? null;
}

/** A city by UN/LOCODE: "DEHAM" → Hamburg. */
export async function getCityByUnlocode(code: string): Promise<City | null> {
  const upper = code.replace(/\s+/g, '').toUpperCase();
  const country = normalizeCountryCode(upper.slice(0, 2));
  if (!country || upper.length !== 5) return null;
  const entry = await loadCountry(country, 500);
  return entry.cities.filter((city) => city.unlocode === upper).sort(compareCities)[0] ?? null;
}

/** A city by Wikidata id: "Q64" → Berlin. */
export async function getPlaceByWikidataId(id: string): Promise<City | null> {
  const country = (await loadIdIndex()).wikidata[id.trim().toUpperCase()];
  if (!country) return null;
  const entry = await loadCountry(country, 500);
  return entry.cities.find((city) => city.wikidataId === id.trim().toUpperCase()) ?? null;
}

// ─── Free-text locations ──────────────────────────────────────────────────

export interface ParsedLocation {
  city: City | null;
  subdivision: Subdivision | null;
  country: string | null;
}

function splitLocation(text: string): string[] {
  return cleanText(text)
    .split(/\s*[,;|/]\s*|\s+-\s+|\s*\(\s*|\s*\)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Splits free text such as "Berlin, Germany", "München (DE)", "San Francisco, CA",
 * "Zürich Switzerland" or "80331 München" into city, subdivision and country.
 * A known country can be passed in when the text has none.
 */
export async function parseLocation(text: string, options: { country?: string; tier?: Tier } = {}): Promise<ParsedLocation> {
  const empty: ParsedLocation = { city: null, subdivision: null, country: toCountryCode(options.country) };
  if (typeof text !== 'string' || !cleanText(text)) return empty;
  let parts = splitLocation(text);
  const tier = options.tier ?? 500;

  const attempt = async (country: string, rest: string[]): Promise<ParsedLocation | null> => {
    // Tokens after the first may be a subdivision ("CA", "Bayern") or repeat the country.
    let subdivision: Subdivision | null = null;
    const cityParts: string[] = [];
    rest.forEach((part, index) => {
      if (index > 0 && !subdivision) {
        const found = resolveSubdivision(part, country);
        if (found) { subdivision = found; return; }
      }
      if (index > 0 && resolveCountry(part)?.code === country) return;
      cityParts.push(part);
    });
    for (const candidate of [cityParts[0], cityParts.join(' ')]) {
      if (!candidate) continue;
      const city = await findCity(candidate, { country, subdivision: subdivision ?? undefined, tier })
        ?? (subdivision ? null : await findCity(candidate, { country, tier }));
      if (city) return { city, subdivision: subdivision ?? (city.admin1 ? resolveSubdivision(city.admin1, country) : null), country };
    }
    return subdivision ? { city: null, subdivision, country } : null;
  };

  const given = toCountryCode(options.country);
  if (given) return (await attempt(given, parts)) ?? { ...empty, country: given };

  // Single part without separators: try trailing words as the country ("Zürich Switzerland").
  if (parts.length === 1 && parts[0]!.includes(' ')) {
    const words = parts[0]!.split(' ');
    for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
      const country = resolveCountry(words.slice(-take).join(' '));
      if (country && country.matchedBy !== 'alpha2') {
        parts = [words.slice(0, -take).join(' '), words.slice(-take).join(' ')];
        break;
      }
    }
  }

  if (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    const country = resolveCountry(last);
    if (country) {
      const result = await attempt(country.code, parts.slice(0, -1));
      if (result?.city || country.matchedBy !== 'alpha2') return result ?? { ...empty, country: country.code };
    }
    // "San Francisco, CA": the last part may be a subdivision; try countries where it is one.
    for (const code of ['US', 'CA', 'AU', 'BR', 'MX', 'IN', 'DE', 'AT', 'CH', 'IT', 'ES', 'GB', 'FR', 'NL', 'BE']) {
      if (!resolveSubdivision(last, code)) continue;
      const result = await attempt(code, parts);
      if (result?.city) return result;
    }
    if (country) return { ...empty, country: country.code };
  }
  const onlyCountry = resolveCountry(parts[0]!);
  return onlyCountry && parts.length === 1 ? { ...empty, country: onlyCountry.code } : empty;
}

// ─── Timezones ────────────────────────────────────────────────────────────

export interface CityTimezoneInput {
  city?: string | null;
  /** Subdivision of the city ("CA", "Bayern", "US-TX"); also used when the city isn't found. */
  subdivision?: string | null;
  /** Country code or name. Optional when `city` includes it ("Berlin, Germany"). */
  country?: string | null;
}

export interface CityTimezone {
  timezone: string;
  matchedBy: 'city' | 'locality' | 'subdivision' | 'country';
  /** The place whose timezone was used. */
  place: City | null;
}

/**
 * IANA timezone for a company or person location. Tries, in order:
 *  1. the city in the country (and subdivision if given), with alternate names and folding;
 *  2. villages and districts from geodata-kit-localities, if installed;
 *  3. the most populous city of the subdivision (right for multi-zone countries such as the US);
 *  4. the country's most populous city.
 * Returns null without a resolvable country.
 */
export async function resolveCityTimezone(input: CityTimezoneInput, options: { tier?: Tier } = {}): Promise<CityTimezone | null> {
  const tier = options.tier ?? 'all';
  let country = toCountryCode(input.country ?? undefined);
  let cityName = input.city ? cleanText(input.city) : '';
  let subdivisionInput: string | Subdivision | undefined = input.subdivision ?? undefined;

  if (cityName && (/[,;(/|]/.test(cityName) || !country)) {
    const parsed = await parseLocation(cityName, { country: country ?? undefined, tier });
    country ??= parsed.country;
    if (parsed.city) {
      return { timezone: parsed.city.timezone, matchedBy: parsed.city.kind === 'city' ? 'city' : 'locality', place: parsed.city };
    }
    subdivisionInput ??= parsed.subdivision ?? undefined;
    cityName = splitLocation(cityName)[0] ?? '';
  }
  if (!country || !getCountry(country)) return null;

  if (cityName) {
    const city = (await findCity(cityName, { country, subdivision: subdivisionInput, tier }))
      ?? (subdivisionInput ? await findCity(cityName, { country, tier }) : null);
    if (city) return { timezone: city.timezone, matchedBy: city.kind === 'city' ? 'city' : 'locality', place: city };
  }

  if (subdivisionInput) {
    const subdivision = typeof subdivisionInput === 'string' ? resolveSubdivision(subdivisionInput, country) : subdivisionInput;
    if (subdivision) {
      const biggest = (await listCities({ country, subdivision, tier: 500 }))[0];
      if (biggest) return { timezone: biggest.timezone, matchedBy: 'subdivision', place: biggest };
    }
  }

  const timezone = getPrimaryTimezone(country);
  return timezone ? { timezone, matchedBy: 'country', place: null } : null;
}

// ─── Coordinates ──────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088;
/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Nearest cities to a point, closest first, with their distance. Without a
 * country every country is loaded for the tier (default 15000 here, to keep a
 * worldwide lookup light).
 */
export async function findNearestCities(
  lat: number,
  lng: number,
  options: { country?: string; tier?: Tier; limit?: number; maxDistanceKm?: number } = {},
): Promise<(City & { distanceKm: number })[]> {
  const tier = options.tier ?? (options.country ? 500 : 15000);
  const countries = options.country ? [toCountryCode(options.country)].filter((code): code is string => code !== null) : allCountryCodes();
  const point = { lat, lng };
  const results: (City & { distanceKm: number })[] = [];
  for (const country of countries) {
    const entry = await loadCountry(country, tier);
    for (const city of entry.cities) {
      if (!inTier(city, tier)) continue;
      if (Math.abs(city.lat - lat) > 10) continue; // cheap prefilter before the trigonometry
      const distance = distanceKm(point, city);
      if (options.maxDistanceKm === undefined || distance <= options.maxDistanceKm) results.push({ ...city, distanceKm: Math.round(distance * 100) / 100 });
    }
  }
  return results.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, options.limit ?? 5);
}
