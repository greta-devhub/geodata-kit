import { fold } from './fold.js';
import {
  ALIASES, COUNTRY_BY_ALPHA3, COUNTRY_BY_CODE, COUNTRY_BY_NUMERIC, COUNTRY_RECORDS, DISPLAY_LOCALES,
  NAMES, RETIRED, type CountryRecord,
} from './internal/core-data.js';
import { cleanInput, editDistance, isActive, pickLocale, toIsoDate } from './internal/util.js';
import type { Country, CountryCode, CountryMatch, Currency, DateInput } from './types.js';

/** Matches an ISO 3166-1 alpha-2 code in any case. Use isCountryCode() to also check it exists. */
export const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

/** Emoji flag from the two regional-indicator letters of the code. */
export function getFlagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '';
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function currentCurrencies(record: CountryRecord, day: string): string[] {
  return record.currencies.filter((currency) => currency.tender && isActive(currency, day)).map((currency) => currency.code);
}

const TODAY = toIsoDate(undefined);
function toCountry(record: CountryRecord): Country {
  return Object.freeze({
    code: record.code,
    alpha3: record.alpha3,
    numeric: record.numeric,
    name: record.name,
    geonameId: record.geonameId,
    capital: record.capital,
    area: record.area,
    population: record.population,
    continent: record.continent,
    tld: record.tld,
    callingCode: record.callingCode,
    currencies: currentCurrencies(record, TODAY),
    neighbours: record.neighbours,
    timezones: record.timezones,
    demonym: record.demonym,
    drivingSide: record.drivingSide,
    weekStart: record.weekStart,
    weekend: record.weekend,
    measurementSystem: record.measurementSystem,
    paperSize: record.paperSize,
    flag: getFlagEmoji(record.code),
  });
}

const COUNTRIES: ReadonlyMap<string, Country> = new Map(COUNTRY_RECORDS.map((record) => [record.code, toCountry(record)]));

/** Upper-cased, trimmed alpha-2 code if it is a known country, else null. */
export function normalizeCountryCode(value: string | null | undefined): CountryCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return COUNTRIES.has(code) ? code : null;
}

/** True for a known alpha-2 code in upper case ("DE"); use normalizeCountryCode to accept "de" or " DE ". */
export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && COUNTRIES.has(value);
}

/** Splits a list into known codes (normalised, de-duplicated, in input order) and invalid entries. */
export function normalizeCountryCodes(values: Iterable<string | null | undefined>): { codes: CountryCode[]; invalid: string[] } {
  const codes: CountryCode[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const code = normalizeCountryCode(value);
    if (!code) {
      if (value !== null && value !== undefined) invalid.push(String(value));
    } else if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return { codes, invalid };
}

/** The country for an alpha-2 code (any case), or null. */
export function getCountry(code: string): Country | null {
  const normalized = normalizeCountryCode(code);
  return normalized ? COUNTRIES.get(normalized)! : null;
}

export interface CountryFilter {
  /** Only members of this group (see listGroups), e.g. "eu" or "dach". */
  group?: string;
  /** Continent code (EU, AS, …). */
  continent?: string;
  /** Countries where this language is national (official or de facto). */
  language?: string;
  /** Countries using this ISO 4217 currency today. */
  currency?: string;
}

/** All countries, sorted by code. Filters combine with AND. */
export function listCountries(filter: CountryFilter = {}): Country[] {
  // Imported lazily to avoid a cycle: groups and languages import this module.
  let list = [...COUNTRIES.values()];
  if (filter.continent) list = list.filter((country) => country.continent === filter.continent!.toUpperCase());
  if (filter.currency) list = list.filter((country) => country.currencies.includes(filter.currency!.toUpperCase()));
  if (filter.group) {
    const members = new Set(groupMembersHook(filter.group));
    list = list.filter((country) => members.has(country.code));
  }
  if (filter.language) {
    const countries = new Set(languageCountriesHook(filter.language));
    list = list.filter((country) => countries.has(country.code));
  }
  return list;
}

// Hooks set by groups.ts / languages.ts (keeps the module graph acyclic).
let groupMembersHook: (slug: string) => string[] = () => [];
let languageCountriesHook: (language: string) => string[] = () => [];
export function _setFilterHooks(groups: typeof groupMembersHook, languages: typeof languageCountriesHook): void {
  groupMembersHook = groups;
  languageCountriesHook = languages;
}

/** Codes that replaced a retired code: "CS" → ["RS", "ME"], "UK" → ["GB"]. Empty when unknown. */
export function getSuccessorCodes(retiredCode: string): CountryCode[] {
  return RETIRED[retiredCode.trim().toUpperCase()] ?? [];
}

// ─── Names ────────────────────────────────────────────────────────────────

/**
 * Country name in one of the bundled locales (en, de, fr, es, it, nl, pt, pl).
 * Regional locales fall back to their language ("de-CH" → "de"); others to English.
 */
export function getCountryName(code: string, locale = 'en'): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  return NAMES[pickLocale(locale, DISPLAY_LOCALES)]![normalized] ?? NAMES.en![normalized] ?? null;
}

/** Readable alternative names: English variants, endonyms, common aliases ("Deutschland", "BRD", …). */
export function getCountryAliases(code: string): string[] {
  const normalized = normalizeCountryCode(code);
  return normalized ? [...(ALIASES.display[normalized] ?? [])] : [];
}

export interface FormatCountryOptions {
  locale?: string;
  /** Append the code: "Germany (DE)". */
  withCode?: boolean;
  /** Upper-case the name, as on the last line of an international postal address. */
  upperCase?: boolean;
}

/** "Germany", "Germany (DE)" or "GERMANY"; null for unknown codes. */
export function formatCountry(code: string, options: FormatCountryOptions = {}): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  let name = getCountryName(normalized, options.locale)!;
  if (options.upperCase) name = name.toLocaleUpperCase(pickLocale(options.locale, DISPLAY_LOCALES));
  return options.withCode ? `${name} (${normalized})` : name;
}

// ─── Resolution ───────────────────────────────────────────────────────────

function lookupFolded(key: string): { code: string; kind: 'name' | 'alias' | 'subdivision' } | null {
  const name = ALIASES.names[key];
  if (name) return { code: name, kind: 'name' };
  const alias = ALIASES.aliases[key];
  if (alias) return { code: alias, kind: 'alias' };
  const subdivision = ALIASES.subdivisions[key];
  if (subdivision) return { code: subdivision, kind: 'subdivision' };
  return null;
}

function resolveCleaned(text: string): Omit<CountryMatch, 'input'> | null {
  if (/^[A-Za-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    if (COUNTRIES.has(upper)) return { code: upper, matchedBy: 'alpha2' };
    const successors = RETIRED[upper];
    if (successors?.length === 1) return { code: successors[0]!, matchedBy: 'retired' };
  }
  if (/^[A-Za-z]{3}$/.test(text)) {
    const code = COUNTRY_BY_ALPHA3.get(text.toUpperCase());
    if (code) return { code, matchedBy: 'alpha3' };
  }
  if (/^\d{1,3}$/.test(text)) {
    const code = COUNTRY_BY_NUMERIC.get(text.padStart(3, '0'));
    return code ? { code, matchedBy: 'numeric' } : null;
  }
  const found = lookupFolded(fold(text));
  return found ? { code: found.code, matchedBy: found.kind } : null;
}

/**
 * Resolves free text to a country: alpha-2 ("de"), alpha-3 ("DEU"), numeric
 * ("276"), a name in many languages ("Deutschland", "Allemagne"), an alias
 * ("UK", "Holland") or a part of a country written as the country ("England").
 * No fuzzy matching: returns null rather than guess (see suggestCountries).
 */
export function resolveCountry(text: string | null | undefined): CountryMatch | null {
  if (typeof text !== 'string') return null;
  const cleaned = cleanInput(text);
  if (!cleaned) return null;
  const direct = resolveCleaned(cleaned);
  if (direct) return { ...direct, input: text };

  // Retry without a trailing parenthetical ("United Kingdom (UK)", "Germany (DE)"),
  // trailing punctuation, or a leading article.
  const variants = new Set<string>();
  const withoutParenthetical = cleaned.replace(/\s*\([^)]*\)\s*$/, '').trim();
  variants.add(withoutParenthetical);
  const insideParenthetical = /\(([^)]+)\)\s*$/.exec(cleaned)?.[1]?.trim();
  for (const variant of [...variants]) {
    variants.add(variant.replace(/[\s.,;:!?]+$/, ''));
    variants.add(variant.replace(/^the\s+/i, ''));
  }
  for (const variant of variants) {
    if (!variant || variant === cleaned) continue;
    const match = resolveCleaned(variant);
    if (match) return { ...match, input: text };
  }
  if (insideParenthetical) {
    const match = resolveCleaned(insideParenthetical);
    if (match) return { ...match, input: text };
  }
  return null;
}

/**
 * Resolves many inputs at once (e.g. a CSV column). Each distinct input is
 * resolved once; `unresolved` lists the distinct inputs that matched nothing,
 * ready to report.
 */
export function resolveCountries(texts: Iterable<string | null | undefined>): {
  resolved: Map<string, CountryMatch>;
  unresolved: string[];
} {
  const resolved = new Map<string, CountryMatch>();
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (typeof text !== 'string' || seen.has(text)) continue;
    seen.add(text);
    const match = resolveCountry(text);
    if (match) resolved.set(text, match);
    else if (cleanInput(text)) unresolved.push(text);
  }
  return { resolved, unresolved };
}

let suggestionKeys: [string, string][] | null = null;
/**
 * "Did you mean" candidates for input that resolveCountry could not match
 * (typos such as "Germnay", or ambiguous names such as "Congo"). Never applied
 * automatically.
 */
export function suggestCountries(text: string, limit = 5): Country[] {
  const key = fold(cleanInput(text));
  if (!key) return [];
  suggestionKeys ??= [
    ...Object.entries(ALIASES.names),
    ...Object.entries(ALIASES.aliases),
    ...Object.entries(ALIASES.subdivisions),
  ];
  // Allowed typos: 1 for short input, 2 up to 8 letters (a swapped pair is 2 edits), 3 above.
  const maxDistance = key.length <= 4 ? 1 : key.length <= 8 ? 2 : 3;
  const best = new Map<string, number>();
  for (const [alias, code] of suggestionKeys) {
    let score: number;
    if (alias.startsWith(`${key} `) || alias.startsWith(key)) score = 0.5;
    else if (alias.split(' ').includes(key)) score = 0.75;
    else score = editDistance(key, alias, maxDistance);
    if (score <= maxDistance && score < (best.get(code) ?? Infinity)) best.set(code, score);
  }
  return [...best.entries()]
    .sort(([codeA, a], [codeB, b]) => a - b || (COUNTRIES.get(codeB)!.population ?? 0) - (COUNTRIES.get(codeA)!.population ?? 0))
    .slice(0, limit)
    .map(([code]) => COUNTRIES.get(code)!);
}

// ─── Search for pickers ───────────────────────────────────────────────────

export interface SearchCountriesOptions {
  /** Only countries in at least one of these groups. */
  groups?: string[];
  /** Locale of the names searched and returned order (default "en"). */
  locale?: string;
  limit?: number;
}

/**
 * Ranked search for country pickers. Order: exact code, then prefix of the
 * name, code or an alias, then prefix of a word in the name, then substring;
 * ties by name. Accents and case are ignored ("osterr" finds Austria via
 * "Österreich").
 */
export function searchCountries(query: string, options: SearchCountriesOptions = {}): Country[] {
  const locale = options.locale ?? 'en';
  let candidates = [...COUNTRIES.values()];
  if (options.groups?.length) {
    const members = new Set(options.groups.flatMap((slug) => groupMembersHook(slug)));
    candidates = candidates.filter((country) => members.has(country.code));
  }
  const needle = fold(cleanInput(query));
  if (!needle) return sortCountries(candidates, locale).slice(0, options.limit);

  const scored: { country: Country; score: number; name: string }[] = [];
  for (const country of candidates) {
    const name = getCountryName(country.code, locale)!;
    const foldedName = fold(name);
    const code = country.code.toLowerCase();
    const others = [fold(country.name), country.alpha3.toLowerCase(), ...getCountryAliases(country.code).map(fold)];
    let score: number | null = null;
    if (code === needle || country.alpha3.toLowerCase() === needle) score = 0;
    else if (foldedName.startsWith(needle) || code.startsWith(needle) || others.some((other) => other.startsWith(needle))) score = 1;
    else if (foldedName.split(' ').some((word) => word.startsWith(needle))) score = 2;
    else if (foldedName.includes(needle) || others.some((other) => other.includes(needle))) score = 3;
    if (score !== null) scored.push({ country, score, name });
  }
  const collator = new Intl.Collator(pickLocale(locale, DISPLAY_LOCALES));
  scored.sort((a, b) => a.score - b.score || collator.compare(a.name, b.name));
  return scored.slice(0, options.limit).map((entry) => entry.country);
}

/** Sorts by name in the given locale, with locale-aware collation ("Österreich" next to "Oman" in German). */
export function sortCountries<T extends { code: string }>(countries: readonly T[], locale = 'en'): T[] {
  const collator = new Intl.Collator(pickLocale(locale, DISPLAY_LOCALES));
  return [...countries].sort((a, b) => collator.compare(getCountryName(a.code, locale) ?? a.code, getCountryName(b.code, locale) ?? b.code));
}

// ─── Facts ────────────────────────────────────────────────────────────────

/** Currencies of a country on a date (default today), main currency first. Includes history with `at`. */
export function getCurrencies(code: string, options: { at?: DateInput; includeNonTender?: boolean } = {}): Currency[] {
  const record = COUNTRY_BY_CODE.get(normalizeCountryCode(code) ?? '');
  if (!record) return [];
  const day = toIsoDate(options.at);
  return record.currencies
    .filter((currency) => (options.includeNonTender || currency.tender) && isActive(currency, day))
    .map((currency) => ({ ...currency }));
}

/** Main currency in use today (ISO 4217), e.g. "EUR". */
export function getCurrency(code: string): string | null {
  return getCurrencies(code)[0]?.code ?? null;
}

const fact = <K extends keyof Country>(key: K) => (code: string): Country[K] | null => getCountry(code)?.[key] ?? null;

/** Calling code without "+", e.g. "49". */
export const getCallingCode = fact('callingCode');
/** Country-code top-level domain, e.g. ".de". */
export const getTld = fact('tld');
export const getCapital = fact('capital');
/** Area in km². */
export const getArea = fact('area');
export const getPopulation = fact('population');
/** English demonym, e.g. "German". */
export const getDemonym = fact('demonym');
/** First day of the week: "mon", "sun", "sat" or "fri". */
export const getWeekStart = fact('weekStart');
export const getMeasurementSystem = fact('measurementSystem');
export const getPaperSize = fact('paperSize');
export const getDrivingSide = fact('drivingSide');

/** Bordering countries. */
export function getNeighbours(code: string): CountryCode[] {
  return getCountry(code)?.neighbours ?? [];
}

/** Every country with a given calling code ("1" → US, CA and the Caribbean +1 countries). */
export function getCountriesByCallingCode(callingCode: string): CountryCode[] {
  const digits = callingCode.replace(/\D/g, '');
  return [...COUNTRIES.values()].filter((country) => country.callingCode === digits).map((country) => country.code);
}
