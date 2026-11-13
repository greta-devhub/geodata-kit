/**
 * The generated core data, bundled into the package at build time. Kept in
 * one module so every core function shares a single parsed copy.
 *
 * The big files are imported section by section and the lookup tables are
 * built on first use, so an app's bundler keeps only the data behind the
 * functions it imports (tests/tree-shaking.test.ts guards this).
 */
import {
  aliases as aliasesAliases, display as aliasesDisplay, names as aliasesNames, subdivisions as aliasesSubdivisions,
} from '../../../../data/core/aliases.json';
import countriesJson from '../../../../data/core/countries.json';
import groupsJson from '../../../../data/core/groups.json';
import {
  aliases as languagesAliases, codeAliases as languagesCodeAliases, countries as languagesCountries,
  defaultLocales as languagesDefaultLocales, languages as languagesInfo, subdivisions as languagesSubdivisions,
} from '../../../../data/core/languages.json';
import m49Json from '../../../../data/core/m49.json';
import namesJson from '../../../../data/core/names.json';
import retiredJson from '../../../../data/core/retired.json';
import timezonesJson from '../../../../data/core/timezones.json';
import { lazy } from './util.js';
import type { CountryLanguage, GroupKind, GroupMember } from '../types.js';

export interface CountryRecord {
  code: string;
  alpha3: string;
  numeric: string;
  fips: string | null;
  name: string;
  geonameId: number;
  capital: string | null;
  area: number | null;
  population: number | null;
  continent: string;
  tld: string | null;
  callingCode: string | null;
  currencies: { code: string; from: string | null; to: string | null; tender: boolean }[];
  neighbours: string[];
  timezones: string[];
  m49: { region: string | null; subregion: string | null; intermediate: string | null; groupings: string[] };
  weekStart: string;
  weekend: [string, string];
  measurementSystem: 'metric' | 'US' | 'UK';
  paperSize: 'A4' | 'US-Letter';
  demonym: string | null;
  drivingSide: 'left' | 'right' | null;
  postal: { format: string | null; regex: string | null };
  languageTags: string[];
}

export interface GroupRecord {
  slug: string;
  name: string;
  kind: GroupKind;
  code?: string;
  definition?: string;
  members: GroupMember[];
}

export interface LanguageInfo { names: Record<string, string>; endonym: string | null; scripts: string[] }

export const COUNTRY_RECORDS = countriesJson as unknown as CountryRecord[];
export const countryByCode = /* @__PURE__ */ lazy((): ReadonlyMap<string, CountryRecord> => new Map(COUNTRY_RECORDS.map((record) => [record.code, record])));
export const countryByAlpha3 = /* @__PURE__ */ lazy((): ReadonlyMap<string, string> => new Map(COUNTRY_RECORDS.map((record) => [record.alpha3, record.code])));
export const countryByNumeric = /* @__PURE__ */ lazy((): ReadonlyMap<string, string> => new Map(COUNTRY_RECORDS.map((record) => [record.numeric, record.code])));

export const NAMES = namesJson as unknown as Record<string, Record<string, string>>;

/** Free-text country resolution: folded official names, aliases, subdivision names (England → GB) and readable aliases. */
export const ALIAS_NAMES = aliasesNames as unknown as Record<string, string>;
export const ALIAS_ALIASES = aliasesAliases as unknown as Record<string, string>;
export const ALIAS_SUBDIVISIONS = aliasesSubdivisions as unknown as Record<string, string>;
export const ALIAS_DISPLAY = aliasesDisplay as unknown as Record<string, string[]>;

export const RETIRED = retiredJson as unknown as Record<string, string[]>;
export const GROUPS = groupsJson as unknown as GroupRecord[];

export const LANGUAGE_COUNTRIES = languagesCountries as unknown as Record<string, CountryLanguage[]>;
export const LANGUAGE_SUBDIVISIONS = languagesSubdivisions as unknown as Record<string, string[]>;
export const DEFAULT_LOCALES = languagesDefaultLocales as unknown as Record<string, string>;
export const LANGUAGE_INFO = languagesInfo as unknown as Record<string, LanguageInfo>;
export const LANGUAGE_ALIASES = languagesAliases as unknown as Record<string, string>;
export const LANGUAGE_CODE_ALIASES = languagesCodeAliases as unknown as Record<string, string>;

export const M49_NAMES = m49Json as unknown as Record<string, string>;
export const TIMEZONES = timezonesJson as unknown as { zones: string[]; aliases: Record<string, string> };

/** Locales whose country names are bundled. */
export const DISPLAY_LOCALES: readonly string[] = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl'];
