/**
 * The generated core data, bundled into the package at build time. Kept in
 * one module so every core function shares a single parsed copy.
 */
import aliasesJson from '../../../../data/core/aliases.json';
import countriesJson from '../../../../data/core/countries.json';
import groupsJson from '../../../../data/core/groups.json';
import languagesJson from '../../../../data/core/languages.json';
import m49Json from '../../../../data/core/m49.json';
import namesJson from '../../../../data/core/names.json';
import retiredJson from '../../../../data/core/retired.json';
import timezonesJson from '../../../../data/core/timezones.json';
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

export interface LanguagesData {
  countries: Record<string, CountryLanguage[]>;
  subdivisions: Record<string, string[]>;
  defaultLocales: Record<string, string>;
  languages: Record<string, { names: Record<string, string>; endonym: string | null; scripts: string[] }>;
  aliases: Record<string, string>;
  codeAliases: Record<string, string>;
}

export const COUNTRY_RECORDS = countriesJson as unknown as CountryRecord[];
export const COUNTRY_BY_CODE: ReadonlyMap<string, CountryRecord> = new Map(COUNTRY_RECORDS.map((record) => [record.code, record]));
export const COUNTRY_BY_ALPHA3: ReadonlyMap<string, string> = new Map(COUNTRY_RECORDS.map((record) => [record.alpha3, record.code]));
export const COUNTRY_BY_NUMERIC: ReadonlyMap<string, string> = new Map(COUNTRY_RECORDS.map((record) => [record.numeric, record.code]));

export const NAMES = namesJson as unknown as Record<string, Record<string, string>>;
export const ALIASES = aliasesJson as unknown as {
  names: Record<string, string>;
  aliases: Record<string, string>;
  subdivisions: Record<string, string>;
  display: Record<string, string[]>;
};
export const RETIRED = retiredJson as unknown as Record<string, string[]>;
export const GROUPS = groupsJson as unknown as GroupRecord[];
export const LANGUAGES = languagesJson as unknown as LanguagesData;
export const M49_NAMES = m49Json as unknown as Record<string, string>;
export const TIMEZONES = timezonesJson as unknown as { zones: string[]; aliases: Record<string, string> };

/** Locales whose country names are bundled. */
export const DISPLAY_LOCALES = Object.keys(NAMES);
