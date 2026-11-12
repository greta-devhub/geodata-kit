import { normalizeCountryCode } from './countries.js';
import { fold } from './fold.js';
import { DISPLAY_LOCALES, LANGUAGES } from './internal/core-data.js';
import { cleanInput, languageBase, pickLocale } from './internal/util.js';
import type { CountryCode, CountryLanguage, LanguageCode, LanguageStatus } from './types.js';

const NATIONAL: ReadonlySet<LanguageStatus> = new Set(['official', 'de_facto_official']);

function listFor(code: string): CountryLanguage[] {
  const normalized = normalizeCountryCode(code);
  return normalized ? LANGUAGES.countries[normalized] ?? [] : [];
}

const copy = (language: CountryLanguage): CountryLanguage => ({ ...language, ...(language.regions ? { regions: [...language.regions] } : {}) });

/**
 * National languages: official or de facto official, most spoken first.
 * Switzerland → de, fr, it, gsw (Swiss German, de facto). This is the list to
 * pick a correspondence language from.
 */
export function getNationalLanguages(code: string): CountryLanguage[] {
  return listFor(code).filter((language) => NATIONAL.has(language.status)).map(copy);
}

export interface CountryLanguagesOptions {
  /** Only languages spoken by at least this share of the population (percent). */
  minShare?: number;
  /** Only these statuses; 'national' means official + de facto official. */
  status?: LanguageStatus | 'national' | (LanguageStatus | 'national')[];
}

function statusMatches(language: CountryLanguage, status: CountryLanguagesOptions['status']): boolean {
  if (!status) return true;
  const wanted = Array.isArray(status) ? status : [status];
  return wanted.some((entry) => (entry === 'national' ? NATIONAL.has(language.status) : language.status === entry));
}

/** Every language spoken in the country (CLDR), national first, then by share. */
export function getCountryLanguages(code: string, options: CountryLanguagesOptions = {}): CountryLanguage[] {
  return listFor(code)
    .filter((language) => statusMatches(language, options.status)
      && (options.minShare === undefined || (language.share ?? 0) >= options.minShare))
    .map(copy);
}

/**
 * The first national language by share, as a plain code: CH → "de", BE → "nl",
 * CA → "en". Skips de facto spoken varieties that are not written as standard
 * (e.g. Swiss German) when an official language exists.
 */
export function getPrimaryLanguage(code: string): LanguageCode | null {
  const national = listFor(code).filter((language) => NATIONAL.has(language.status));
  const official = national.filter((language) => language.status === 'official');
  return (official[0] ?? national[0])?.code ?? null;
}

/** Languages official only in some subdivisions, with the ISO 3166-2 codes where they apply. */
export function getRegionalLanguages(code: string): CountryLanguage[] {
  return listFor(code).filter((language) => language.status === 'official_regional').map(copy);
}

/**
 * Official languages of a subdivision (ISO 3166-2), e.g. "ES-CT" → ca, es.
 * Falls back to the country's national languages when nothing specific is known.
 */
export function getLanguagesOfSubdivision(subdivision: string): CountryLanguage[] {
  const iso = subdivision.trim().toUpperCase();
  const country = iso.slice(0, 2);
  const countryList = listFor(country);
  const codes = LANGUAGES.subdivisions[iso];
  if (!codes?.length) return getNationalLanguages(country);
  return codes
    .map((code) => countryList.find((language) => language.code === code) ?? { code, status: 'official_regional' as const, share: null, speakers: null })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1))
    .map(copy);
}

/** Default locale of a country: CH → "de-CH", RS → "sr-Cyrl-RS", US → "en-US". */
export function getDefaultLocale(code: string): string | null {
  const normalized = normalizeCountryCode(code);
  return normalized ? LANGUAGES.defaultLocales[normalized] ?? null : null;
}

/**
 * Countries where a language is used, by status: getCountriesByLanguage('de', { status: 'official' })
 * → AT, BE, CH, DE, LI, LU. Sorted by share, highest first.
 */
export function getCountriesByLanguage(
  language: string,
  options: CountryLanguagesOptions = {},
): { country: CountryCode; status: LanguageStatus; share: number | null }[] {
  const code = resolveLanguage(language) ?? language;
  const result: { country: CountryCode; status: LanguageStatus; share: number | null }[] = [];
  for (const [country, list] of Object.entries(LANGUAGES.countries)) {
    const entry = list.find((item) => item.code === code);
    if (!entry || !statusMatches(entry, options.status)) continue;
    if (options.minShare !== undefined && (entry.share ?? 0) < options.minShare) continue;
    result.push({ country, status: entry.status, share: entry.share });
  }
  return result.sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || (a.country < b.country ? -1 : 1));
}

/** True if the language is official in the country, or in the given subdivision ("IT-32" for German in Trentino). */
export function isOfficialLanguage(language: string, country: string, options: { subdivision?: string } = {}): boolean {
  const code = resolveLanguage(language);
  if (!code) return false;
  if (getNationalLanguages(country).some((entry) => entry.code === code)) return true;
  if (options.subdivision) return getLanguagesOfSubdivision(options.subdivision).some((entry) => entry.code === code);
  return false;
}

/**
 * Turns a language name or code into a code: "German", "deutsch", "allemand",
 * "deu", "ger", "de-CH" → "de"; "Swiss German" → "gsw"; "zh-Hant-TW" → "zh-Hant".
 */
export function resolveLanguage(text: string | null | undefined): LanguageCode | null {
  if (typeof text !== 'string') return null;
  const cleaned = cleanInput(text);
  if (!cleaned) return null;
  if (/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(cleaned)) {
    const base = languageBase(cleaned);
    if (LANGUAGES.languages[base]) return base;
    const primary = base.split('-')[0]!;
    if (LANGUAGES.languages[primary]) return primary;
    const aliased = LANGUAGES.codeAliases[primary];
    if (aliased) return aliased;
  }
  return LANGUAGES.aliases[fold(cleaned)] ?? null;
}

/** Name of a language in a bundled locale (en, de, fr, es, it, nl, pt, pl); "endonym" for its own name. */
export function getLanguageName(code: string, locale: string = 'en'): string | null {
  const resolved = resolveLanguage(code);
  if (!resolved) return null;
  const info = LANGUAGES.languages[resolved];
  if (!info) return null;
  if (locale === 'endonym') return info.endonym ?? info.names.en ?? null;
  return info.names[pickLocale(locale, DISPLAY_LOCALES)] ?? info.names.en ?? null;
}

/** Scripts a language is written in (ISO 15924), e.g. "sr" → ["Cyrl", "Latn"]. */
export function getLanguageScripts(code: string): string[] {
  const resolved = resolveLanguage(code);
  return resolved ? [...(LANGUAGES.languages[resolved]?.scripts ?? [])] : [];
}
