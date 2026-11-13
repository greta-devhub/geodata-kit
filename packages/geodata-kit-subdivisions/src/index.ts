/**
 * geodata-kit-subdivisions — states, provinces, cantons, Länder and the levels
 * below them. "Subdivision" is the ISO 3166-2 / CLDR term; level 1 is
 * GeoNames' admin1 (Bavaria), level 2 admin2 (Upper Bavaria), level 3 admin3
 * (Landkreis München), level 4 admin4 (Gemeinde Unterhaching).
 *
 * Level 1 is bundled and synchronous. Levels 2–4 load per country on first use.
 */
import isoJson from '../../../data/subdivisions/iso.json';
import level1Json from '../../../data/subdivisions/level1.json';
import { cleanText, fold, normalizeCountryCode } from 'geodata-kit';

import { SUBDIVISION_LOADERS } from './loaders.generated.js';

export type SubdivisionLevel = 1 | 2 | 3 | 4;

export interface Subdivision {
  country: string;
  level: SubdivisionLevel;
  /** GeoNames code on this level ("02" for Bavaria, "091" for Upper Bavaria). */
  code: string;
  /** Codes from level 1 down to this one, joined with ".": "02.091.09162". */
  path: string;
  /** ISO 3166-2 code, for level 1 where one exists ("DE-BY"). */
  iso: string | null;
  name: string;
  geonameId: number;
  population: number | null;
  /** Other names (levels 1 and 2): local and translated names, abbreviations. */
  aliases: string[];
}

interface Level1Record {
  country: string; code: string; iso: string | null; name: string; asciiName: string;
  geonameId: number; population: number | null; aliases: string[];
}
type DeepRow = [string, string, number, number] | [string, string, number, number, string[]];

const ISO_NAMES = isoJson as unknown as Record<string, string>;
const LEVEL1 = (level1Json as unknown as Level1Record[]).map((record): Subdivision => Object.freeze({
  country: record.country,
  level: 1,
  code: record.code,
  path: record.code,
  iso: record.iso,
  name: record.name,
  geonameId: record.geonameId,
  population: record.population,
  aliases: record.aliases,
}));
const LEVEL1_BY_COUNTRY = new Map<string, Subdivision[]>();
for (const subdivision of LEVEL1) {
  LEVEL1_BY_COUNTRY.set(subdivision.country, [...(LEVEL1_BY_COUNTRY.get(subdivision.country) ?? []), subdivision]);
}
const LEVEL1_BY_ISO = new Map(LEVEL1.filter((subdivision) => subdivision.iso).map((subdivision) => [subdivision.iso!, subdivision]));

/** Folded name/alias → subdivision, per country. Built on first use. */
const indexCache = new Map<string, Map<string, Subdivision>>();
function level1Index(country: string): Map<string, Subdivision> {
  let index = indexCache.get(country);
  if (index) return index;
  index = new Map();
  const list = [...(LEVEL1_BY_COUNTRY.get(country) ?? [])].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  // Names first, then aliases, so a main name always beats someone else's alias.
  for (const subdivision of list) {
    const key = fold(subdivision.name);
    if (key && !index.has(key)) index.set(key, subdivision);
  }
  for (const subdivision of list) {
    for (const alias of subdivision.aliases) {
      const key = fold(alias);
      if (key && !index.has(key)) index.set(key, subdivision);
    }
  }
  indexCache.set(country, index);
  return index;
}

/** Level-1 subdivisions of a country, sorted by name. */
export function listSubdivisions(country: string): Subdivision[] {
  const code = normalizeCountryCode(country);
  if (!code) return [];
  return [...(LEVEL1_BY_COUNTRY.get(code) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A level-1 subdivision by ISO 3166-2 code ("DE-BY") or GeoNames key ("DE.02").
 * Use findSubdivision for names and lower levels.
 */
export function getSubdivision(code: string): Subdivision | null {
  const upper = code.trim().toUpperCase();
  const byIso = LEVEL1_BY_ISO.get(upper);
  if (byIso) return byIso;
  const geonames = /^([A-Z]{2})\.(.+)$/.exec(code.trim());
  if (geonames) return LEVEL1_BY_COUNTRY.get(geonames[1]!.toUpperCase())?.find((subdivision) => subdivision.code === geonames[2]) ?? null;
  return null;
}

/** True for a valid ISO 3166-2 code on any level ("DE-BY", "FR-75C"), per the CLDR list. */
export function isSubdivisionCode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() in ISO_NAMES;
}

/** English name of any ISO 3166-2 code ("FR-75C" → "Paris"). */
export function getSubdivisionName(iso: string): string | null {
  return ISO_NAMES[iso.trim().toUpperCase()] ?? LEVEL1_BY_ISO.get(iso.trim().toUpperCase())?.name ?? null;
}

/**
 * Resolves free text to a level-1 subdivision of a country: "Bayern",
 * "Bavaria", "BY", "DE-BY", "Freistaat Bayern" → Bavaria. Without a country only
 * full ISO codes resolve.
 */
export function resolveSubdivision(text: string | null | undefined, country?: string): Subdivision | null {
  if (typeof text !== 'string') return null;
  const cleaned = cleanText(text);
  if (!cleaned) return null;
  const byIso = LEVEL1_BY_ISO.get(cleaned.toUpperCase());
  if (byIso && (!country || byIso.country === normalizeCountryCode(country))) return byIso;
  const code = country ? normalizeCountryCode(country) : null;
  if (!code) return null;
  const withIso = LEVEL1_BY_ISO.get(`${code}-${cleaned.toUpperCase()}`);
  if (withIso) return withIso;
  const byGeonamesCode = LEVEL1_BY_COUNTRY.get(code)?.find((subdivision) => subdivision.code.toUpperCase() === cleaned.toUpperCase());
  if (byGeonamesCode) return byGeonamesCode;
  return level1Index(code).get(fold(cleaned)) ?? null;
}

// ─── Levels 2–4 ────────────────────────────────────────────────────────────

const deepCache = new Map<string, Promise<Record<'2' | '3' | '4', DeepRow[]> | null>>();
function loadDeep(country: string): Promise<Record<'2' | '3' | '4', DeepRow[]> | null> {
  let promise = deepCache.get(country);
  if (!promise) {
    const loader = (SUBDIVISION_LOADERS as Record<string, () => Promise<{ default: unknown }>>)[country];
    promise = loader ? loader().then((module) => module.default as Record<'2' | '3' | '4', DeepRow[]>) : Promise.resolve(null);
    deepCache.set(country, promise);
  }
  return promise;
}

function fromRow(country: string, level: SubdivisionLevel, row: DeepRow): Subdivision {
  const parts = row[0].split('.');
  return { country, level, code: parts[parts.length - 1]!, path: row[0], iso: null, name: row[1], geonameId: row[2], population: row[3] || null, aliases: row[4] ?? [] };
}

/**
 * Subdivisions of a country on any level, optionally under a parent (an ISO
 * code like "DE-BY" or a Subdivision): loadSubdivisions('DE', { level: 3, parent: 'DE-BY' }).
 */
export async function loadSubdivisions(
  country: string,
  options: { level?: SubdivisionLevel; parent?: string | Subdivision } = {},
): Promise<Subdivision[]> {
  const code = normalizeCountryCode(country);
  if (!code) return [];
  const level = options.level ?? 1;
  let parentPath: string | null = null;
  if (options.parent) {
    const parent = typeof options.parent === 'string' ? getSubdivision(options.parent) ?? resolveSubdivision(options.parent, code) : options.parent;
    if (!parent) return [];
    parentPath = parent.path;
  }
  if (level === 1) return listSubdivisions(code);
  const deep = await loadDeep(code);
  const rows = deep?.[String(level) as '2' | '3' | '4'] ?? [];
  return rows
    .filter((row) => !parentPath || row[0].startsWith(`${parentPath}.`))
    .map((row) => fromRow(code, level, row))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Finds a subdivision by name on any level (level 1 first, then 2, 3, 4; the
 * most populous wins on a tie): findSubdivision('Oberbayern', 'DE').
 */
export async function findSubdivision(
  text: string,
  country: string,
  options: { level?: SubdivisionLevel } = {},
): Promise<Subdivision | null> {
  const code = normalizeCountryCode(country);
  if (!code) return null;
  if (!options.level || options.level === 1) {
    const level1 = resolveSubdivision(text, code);
    if (level1 || options.level === 1) return level1;
  }
  const key = fold(cleanText(text));
  if (!key) return null;
  const deep = await loadDeep(code);
  if (!deep) return null;
  for (const level of (options.level ? [options.level] : [2, 3, 4]) as SubdivisionLevel[]) {
    const rows = deep[String(level) as '2' | '3' | '4'] ?? [];
    let matches = rows.filter((row) => fold(row[1]) === key);
    if (!matches.length) matches = rows.filter((row) => row[4]?.some((alias) => fold(alias) === key));
    if (matches.length) {
      matches.sort((a, b) => b[3] - a[3] || a[2] - b[2]);
      return fromRow(code, level, matches[0]!);
    }
  }
  return null;
}

/** Anything that carries GeoNames admin codes, such as a City. */
export interface PlaceWithSubdivisionCodes {
  country: string;
  admin1?: string | null;
  admin2?: string | null;
  admin3?: string | null;
  admin4?: string | null;
}

/** The chain of subdivisions a place lies in, from level 1 down: Bayern → Oberbayern → Landkreis München → Unterhaching. */
export async function getSubdivisionChain(place: PlaceWithSubdivisionCodes): Promise<Subdivision[]> {
  const code = normalizeCountryCode(place.country);
  if (!code || !place.admin1) return [];
  const chain: Subdivision[] = [];
  const level1 = getSubdivision(`${code}.${place.admin1}`);
  if (level1) chain.push(level1);
  const parts = [place.admin1, place.admin2, place.admin3, place.admin4];
  if (!place.admin2) return chain;
  const deep = await loadDeep(code);
  if (!deep) return chain;
  for (const level of [2, 3, 4] as const) {
    if (!parts[level - 1]) break;
    const path = parts.slice(0, level).map((part) => part ?? '').join('.');
    const row = deep[String(level) as '2' | '3' | '4'].find((candidate) => candidate[0] === path);
    if (row) chain.push(fromRow(code, level, row));
  }
  return chain;
}
