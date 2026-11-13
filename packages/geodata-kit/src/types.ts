/** ISO 3166-1 alpha-2 code, upper case (plus "XK" for Kosovo). */
export type CountryCode = string;
/** BCP 47 language tag without region, e.g. "de", "gsw", "zh-Hant". */
export type LanguageCode = string;
/** Date as "YYYY-MM-DD" or a Date. */
export type DateInput = string | Date;

export interface Currency {
  /** ISO 4217 code. */
  code: string;
  /** First day in use, "YYYY-MM-DD", or null if unknown. */
  from: string | null;
  /** Last day in use, or null while current. */
  to: string | null;
  /** False for non-tender funds codes such as USN or CHE. */
  tender: boolean;
}

export interface M49Area {
  code: string;
  name: string;
}

export interface Country {
  code: CountryCode;
  alpha3: string;
  numeric: string;
  /** English display name. Use getCountryName(code, locale) for other languages. */
  name: string;
  geonameId: number;
  capital: string | null;
  /** km². */
  area: number | null;
  population: number | null;
  /** Continent code: AF AN AS EU NA OC SA. */
  continent: string;
  tld: string | null;
  /** Country calling code without "+", e.g. "49". */
  callingCode: string | null;
  /** Currencies in use today (tender only), main currency first. */
  currencies: string[];
  neighbours: CountryCode[];
  /** IANA timezones of the country. */
  timezones: string[];
  demonym: string | null;
  drivingSide: 'left' | 'right' | null;
  weekStart: string;
  weekend: [string, string];
  measurementSystem: 'metric' | 'US' | 'UK';
  paperSize: 'A4' | 'US-Letter';
  flag: string;
}

/**
 * How resolveCountry matched: 'retired' is a code that was assigned and later
 * withdrawn ("DD" → DE); 'alias' includes codes ISO only reserves ("UK" → GB).
 */
export type CountryMatchKind = 'alpha2' | 'alpha3' | 'numeric' | 'name' | 'alias' | 'subdivision' | 'retired';

export interface CountryMatch {
  code: CountryCode;
  matchedBy: CountryMatchKind;
  /** The input as given. */
  input: string;
}

export type GroupKind = 'continent' | 'un' | 'political' | 'business';

export interface GroupMember {
  code: CountryCode;
  from?: string;
  to?: string;
}

export interface Group {
  slug: string;
  name: string;
  kind: GroupKind;
  /** UN M49 code for 'un' groups, continent code for continents. */
  code?: string;
  definition?: string;
  /** All members ever, with dates for political groups. */
  members: GroupMember[];
}

export type LanguageStatus = 'official' | 'de_facto_official' | 'official_regional' | 'spoken';

export interface CountryLanguage {
  code: LanguageCode;
  status: LanguageStatus;
  /** Share of the population that speaks it, in percent. */
  share: number | null;
  /** Population × share. */
  speakers: number | null;
  writingShare?: number;
  literacyShare?: number;
  /** ISO 3166-2 subdivisions where a regional language is official. */
  regions?: string[];
  /** Locale tag used in this country, e.g. "de-CH". */
  locale?: string;
}
