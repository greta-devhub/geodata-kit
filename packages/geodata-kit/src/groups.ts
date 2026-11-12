import { _setFilterHooks, normalizeCountryCode, resolveCountry } from './countries.js';
import { COUNTRY_BY_CODE, GROUPS, M49_NAMES, type GroupRecord } from './internal/core-data.js';
import { isActive, toIsoDate } from './internal/util.js';
import type { CountryCode, DateInput, Group, GroupKind, M49Area } from './types.js';

const BY_SLUG: ReadonlyMap<string, GroupRecord> = new Map(GROUPS.map((group) => [group.slug, group]));

function copy(group: GroupRecord): Group {
  return { ...group, members: group.members.map((member) => ({ ...member })) };
}

/**
 * All groups, optionally of one kind:
 *  - 'continent': continent_europe, continent_asia, … (GeoNames)
 *  - 'un': UN M49 regions, e.g. un_western_europe, un_latin_america
 *  - 'political': eu, eurozone, schengen, efta, eea (with dates)
 *  - 'business': dach, benelux, nordic, baltic, cee, eastern_europe, emea, mena, apac, north_america, latin_america, caribbean, central_asia
 */
export function listGroups(kind?: GroupKind): Group[] {
  return GROUPS.filter((group) => !kind || group.kind === kind).map(copy);
}

export function getGroup(slug: string): Group | null {
  const group = BY_SLUG.get(slug.trim().toLowerCase());
  return group ? copy(group) : null;
}

/** Member codes on a date (default today): GB is in "eu" at 2019-01-01, not today. */
export function getCountriesInGroup(slug: string, options: { at?: DateInput } = {}): CountryCode[] {
  const group = BY_SLUG.get(slug.trim().toLowerCase());
  if (!group) return [];
  const day = toIsoDate(options.at);
  return group.members.filter((member) => isActive(member, day)).map((member) => member.code);
}

/** Groups a country belongs to on a date (default today). */
export function getGroupsOfCountry(code: string, options: { at?: DateInput; kind?: GroupKind } = {}): Group[] {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return [];
  const day = toIsoDate(options.at);
  return GROUPS
    .filter((group) => (!options.kind || group.kind === options.kind)
      && group.members.some((member) => member.code === normalized && isActive(member, day)))
    .map(copy);
}

export function isInGroup(code: string, slug: string, options: { at?: DateInput } = {}): boolean {
  const normalized = normalizeCountryCode(code);
  return normalized !== null && getCountriesInGroup(slug, options).includes(normalized);
}

/**
 * Turns a mixed list of group slugs, codes and country names into distinct
 * country codes: ['dach', 'FR', 'Polska'] → ['DE', 'AT', 'CH', 'LI', 'FR', 'PL'].
 * Unknown entries are ignored; use resolveCountries for reporting.
 */
export function expandGroups(items: Iterable<string>, options: { at?: DateInput } = {}): CountryCode[] {
  const result: CountryCode[] = [];
  const seen = new Set<string>();
  const push = (code: string): void => {
    if (!seen.has(code)) { seen.add(code); result.push(code); }
  };
  for (const item of items) {
    if (BY_SLUG.has(item.trim().toLowerCase())) {
      for (const code of getCountriesInGroup(item, options)) push(code);
    } else {
      const match = resolveCountry(item);
      if (match) push(match.code);
    }
  }
  return result;
}

// ─── Continents and UN M49 ────────────────────────────────────────────────

export interface Continent { code: string; name: string; slug: string }

/** The seven GeoNames continents: AF, AN, AS, EU, NA, OC, SA. */
export function listContinents(): Continent[] {
  return GROUPS.filter((group) => group.kind === 'continent').map((group) => ({ code: group.code!, name: group.name, slug: group.slug }));
}

/** Continent of a country. */
export function getContinent(code: string): Continent | null {
  const record = COUNTRY_BY_CODE.get(normalizeCountryCode(code) ?? '');
  return record ? listContinents().find((continent) => continent.code === record.continent) ?? null : null;
}

export interface M49Region {
  region: M49Area | null;
  subregion: M49Area | null;
  intermediate: M49Area | null;
  /** Statistical groupings such as 419 Latin America and the Caribbean, 202 Sub-Saharan Africa. */
  groupings: M49Area[];
}

/** UN M49 region chain of a country: Germany → Europe / Western Europe. */
export function getM49Region(code: string): M49Region | null {
  const record = COUNTRY_BY_CODE.get(normalizeCountryCode(code) ?? '');
  if (!record) return null;
  const area = (value: string | null): M49Area | null => (value ? { code: value, name: M49_NAMES[value] ?? value } : null);
  return {
    region: area(record.m49.region),
    subregion: area(record.m49.subregion),
    intermediate: area(record.m49.intermediate),
    groupings: record.m49.groupings.map((value) => area(value)!),
  };
}

// Lets listCountries({ group }) work without a circular import.
import { getCountriesByLanguage } from './languages.js';
_setFilterHooks(
  (slug) => getCountriesInGroup(slug),
  (language) => getCountriesByLanguage(language, { status: 'national' }).map((entry) => entry.country),
);
