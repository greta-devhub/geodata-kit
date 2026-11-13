/**
 * geodata-kit-address — address formats, required fields, regions and
 * postal-code rules for every country, plus formatting and parsing.
 *
 * Every function takes the country as a code or a name ("DE", "Germany",
 * "Deutschland") and returns null or an empty list for one it does not know;
 * none of them throws.
 *
 * With the optional geodata-kit-postal and geodata-kit-cities packages
 * installed, parseAddress also checks the city against the postal code and
 * can tell the street from the city in text without separators.
 *
 * Data licences and credits: see NOTICE.
 */
import { dataDate } from '../../../data/meta.json';
import formatsJson from '../../../data/address/formats.json';
import { cleanText, editDistance, fold, formatCountry, normalizeCountryCode, resolveCountry } from 'geodata-kit';

export type AddressField = 'name' | 'organization' | 'addressLines' | 'dependentLocality' | 'city' | 'region' | 'postalCode' | 'sortingCode';

interface FormatRecord {
  format: string;
  latinFormat: string | null;
  required: string;
  upperCase: string;
  postal: {
    pattern: string | null;
    secondaryPattern: string | null;
    /** How the two patterns decide (set by the data build from real codes): the first alone when absent. */
    match?: 'either' | 'both';
    /** A code must start with the range of one of the regions. */
    byRegion?: true;
    layouts: string[];
    examples: string[];
    prefixes: string[];
    label: string;
  } | null;
  regionLabel: string;
  localityLabel: string;
  sublocalityLabel: string;
  postalCountryName: string | null;
  regions: Region[];
}

export interface Region {
  /** What goes on the envelope: "CA" for California, "AG" for Agrigento. */
  key: string;
  name: string;
  latinName?: string;
  /** Other names it is known by, such as the English one: "Rome" for Roma, "Washington DC" for the District of Columbia. */
  aliases?: string[];
  /** ISO 3166-2, where known. */
  iso?: string;
  /** Postal codes of this region start with this pattern. */
  postalPattern?: string;
}

const FORMATS = formatsJson as unknown as Record<string, FormatRecord>;
const FIELD_BY_LETTER: Record<string, AddressField> = {
  N: 'name', O: 'organization', A: 'addressLines', D: 'dependentLocality', C: 'city', S: 'region', Z: 'postalCode', X: 'sortingCode',
};

/** The one way every function reads its country argument: a code or a name in any bundled language, else null. */
function countryCode(country: string | null | undefined): string | null {
  if (typeof country !== 'string' || !country.trim()) return null;
  return normalizeCountryCode(country) ?? resolveCountry(country)?.code ?? null;
}

function record(country: string | null | undefined): FormatRecord | null {
  const code = countryCode(country);
  return code ? FORMATS[code] ?? null : null;
}

const fieldsOf = (letters: string): AddressField[] => [...letters].map((letter) => FIELD_BY_LETTER[letter]).filter((field): field is AddressField => Boolean(field));

export interface AddressFormat {
  /** Fields per line, in envelope order: [['name'], ['organization'], ['addressLines'], ['postalCode', 'city']]. */
  lines: AddressField[][];
  /** Raw format string (%N, %O, %A, %D, %C, %S, %Z, %X, %n). */
  pattern: string;
  /** Latin-script variant for countries that write addresses big-endian locally (JP, CN, KR, …). */
  latinPattern: string | null;
  required: AddressField[];
  upperCase: AddressField[];
  /** How the region is called locally: state, province, canton, county, prefecture, … */
  regionLabel: string;
  /** city, post_town, suburb, district, … */
  localityLabel: string;
  /** postal, zip, pin, eircode */
  postalLabel: string | null;
}

/** Address layout and field rules of a country. */
export function getAddressFormat(country: string): AddressFormat | null {
  const format = record(country);
  if (!format) return null;
  return {
    lines: format.format.split('%n').map((line) => [...line.matchAll(/%([A-Z])/g)].map((match) => FIELD_BY_LETTER[match[1]!]).filter((field): field is AddressField => Boolean(field))).filter((line) => line.length),
    pattern: format.format,
    latinPattern: format.latinFormat,
    required: fieldsOf(format.required),
    upperCase: fieldsOf(format.upperCase),
    regionLabel: format.regionLabel,
    localityLabel: format.localityLabel,
    postalLabel: format.postal?.label ?? null,
  };
}

/** Fields an address needs to be deliverable: US → addressLines, city, region, postalCode. */
export function getRequiredAddressFields(country: string): AddressField[] {
  return getAddressFormat(country)?.required ?? [];
}

/** Regions used in addresses (states, provinces, …), where the country's addresses contain one. */
export function listRegions(country: string): Region[] {
  return (record(country)?.regions ?? []).map((region) => ({ ...region, ...(region.aliases ? { aliases: [...region.aliases] } : {}) }));
}

/** Names are compared without spaces or punctuation, so "Washington, D.C." equals "Washington DC". */
const compactKey = (text: string): string => fold(text).replace(/ /g, '');

interface RegionIndex {
  byKey: Map<string, Region>;
  byName: Map<string, Region>;
  /** Names without the word all regions of the country start with ("Co. Dublin" → "dublin"). */
  byBaseName: Map<string, Region>;
  /** Words that only say what kind of region it is: the country's label ("county", "state"), the shared first word, "of". */
  typeWords: Set<string>;
}
const regionIndexes = new Map<string, RegionIndex>();

function regionIndex(code: string): RegionIndex {
  let index = regionIndexes.get(code);
  if (!index) {
    const format = FORMATS[code]!;
    index = { byKey: new Map(), byName: new Map(), byBaseName: new Map(), typeWords: new Set(['of', ...fold(format.regionLabel.replace(/_/g, ' ')).split(' ')]) };
    const firstWords = new Set(format.regions.map((region) => fold(region.name).split(' ')[0]!));
    const shared = format.regions.length >= 3 && firstWords.size === 1 ? [...firstWords][0]! : null;
    if (shared) index.typeWords.add(shared);
    const add = (map: Map<string, Region>, key: string, region: Region): void => { if (key && !map.has(key)) map.set(key, region); };
    for (const region of format.regions) {
      add(index.byKey, region.key.toUpperCase(), region);
      if (region.iso) add(index.byKey, region.iso, region);
    }
    // Own names first, so an alias never takes a name that belongs to another region.
    for (const region of format.regions) {
      add(index.byName, compactKey(region.name), region);
      if (region.latinName) add(index.byName, compactKey(region.latinName), region);
    }
    for (const region of format.regions) {
      for (const alias of region.aliases ?? []) add(index.byName, compactKey(alias), region);
    }
    for (const region of format.regions) {
      for (const name of [region.name, region.latinName, ...(region.aliases ?? [])]) {
        if (!name) continue;
        const words = fold(name).split(' ').filter((word) => !index!.typeWords.has(word));
        add(index.byBaseName, words.join(''), region);
      }
    }
    regionIndexes.set(code, index);
  }
  return index;
}

/** A region of a known country, and whether the text was its key / ISO code or one of its names. */
function findRegion(value: string, code: string): { region: Region; by: 'key' | 'name' } | null {
  const text = cleanText(value);
  if (!text || !FORMATS[code]?.regions.length) return null;
  const index = regionIndex(code);
  const byKey = index.byKey.get(text.toUpperCase());
  if (byKey) return { region: byKey, by: 'key' };
  const byName = index.byName.get(compactKey(text));
  if (byName) return { region: byName, by: 'name' };
  // "County Dublin", "State of California", "Dublin" for "Co. Dublin": the same name without the type words.
  const base = fold(text).split(' ').filter((word) => !index.typeWords.has(word)).join('');
  const byBase = base ? index.byBaseName.get(base) : undefined;
  return byBase ? { region: byBase, by: 'name' } : null;
}

/**
 * The region for a key, ISO code or name: ("California", "US") → CA.
 * Names can be the local one, the Latin one or the English one ("Rome" → RM,
 * "Washington, D.C." → DC), with or without the word for the kind of region
 * ("County Dublin", "State of California", "Dublin" → "Co. Dublin").
 */
export function resolveRegion(value: string, country: string): Region | null {
  const code = countryCode(country);
  if (!code || typeof value !== 'string') return null;
  const found = findRegion(value, code);
  return found ? { ...found.region } : null;
}

/** True when the value is a known region of the country, by key, name or ISO code. */
export function isValidRegion(value: string, country: string): boolean {
  return resolveRegion(value, country) !== null;
}

// ─── Postal codes ─────────────────────────────────────────────────────────

export interface PostalCodeRules {
  /**
   * Anchored, case-insensitive pattern of a normalised code. It describes the
   * shape; isValidPostalCode also applies the number ranges, where they are known.
   */
  pattern: RegExp;
  /** Layouts: '#' digit, '@' letter ("@# #@@" …). */
  layouts: string[];
  examples: string[];
  /** Prefixes accepted in front of the code ("D-", "CH-"). */
  prefixes: string[];
  label: string;
}

interface PostalChecks { main: RegExp | null; second: RegExp | null; ranges: RegExp | null }
const checkCache = new Map<string, PostalChecks>();

function anchored(source: string | null): RegExp | null {
  if (!source) return null;
  try {
    return new RegExp(`^(?:${source.replace(/^\^/, '').replace(/\$$/, '')})$`, 'i');
  } catch {
    return null; // a few second patterns use syntax JavaScript does not accept
  }
}

function checks(country: string, format: FormatRecord): PostalChecks {
  let cached = checkCache.get(country);
  if (!cached) {
    const postal = format.postal;
    cached = {
      main: anchored(postal?.pattern ?? null),
      second: anchored(postal?.secondaryPattern ?? null),
      ranges: postal?.byRegion ? new RegExp(`^(?:${format.regions.map((region) => region.postalPattern).join('|')})`, 'i') : null,
    };
    checkCache.set(country, cached);
  }
  return cached;
}

/**
 * True when a code in canonical spelling is valid for the country.
 *
 * The country's pattern decides. Its second pattern is used only where real
 * postal codes showed how: 'either' where real codes need it (Argentina's old
 * 4-digit codes), 'both' where every real code passes both, which makes the
 * stricter one safe (Armenia's 4 digits, without the old "37" in front).
 * Where the data has the code ranges of every region and all real codes are
 * inside them, a code must start with one of the ranges (Spain: 01 to 52).
 */
function isValidCode(candidate: string, country: string, format: FormatRecord): boolean {
  const { main, second, ranges } = checks(country, format);
  const mode = format.postal?.match;
  let valid: boolean;
  if (!main) valid = Boolean(second?.test(candidate));
  else if (mode === 'either') valid = main.test(candidate) || Boolean(second?.test(candidate));
  else if (mode === 'both') valid = main.test(candidate) && (second ? second.test(candidate) : true);
  else valid = main.test(candidate);
  return valid && (!ranges || ranges.test(candidate.replace(/[\s-]/g, '')));
}

/** Postal-code rules of a country, or null when it has no postal codes. */
export function getPostalCodeRules(country: string): PostalCodeRules | null {
  const code = countryCode(country);
  const format = code ? FORMATS[code] : undefined;
  if (!code || !format?.postal) return null;
  const { main, second } = checks(code, format);
  return {
    pattern: (main ?? second)!,
    layouts: [...format.postal.layouts],
    examples: [...format.postal.examples],
    prefixes: [...format.postal.prefixes],
    label: format.postal.label,
  };
}

function renderLayout(layout: string, compact: string): string | null {
  const slots = layout.replace(/[^#@A-Z0-9]/g, '');
  if (slots.length !== compact.length) return null;
  let index = 0;
  let output = '';
  for (const symbol of layout) {
    if (symbol === '#' || symbol === '@' || /[A-Z0-9]/.test(symbol)) {
      const character = compact[index++]!;
      if (symbol === '#' && !/\d/.test(character)) return null;
      if (symbol === '@' && !/[A-Z]/.test(character)) return null;
      if (/[A-Z0-9]/.test(symbol) && symbol !== character) return null;
      output += character;
    } else {
      output += symbol;
    }
  }
  return output;
}

/**
 * Canonical form of a postal code, or null if it is not valid for the country:
 * ("D-80331", "DE") → "80331", ("sw1a1aa", "GB") → "SW1A 1AA",
 * ("1234ab", "NL") → "1234 AB", ("k1a0b1", "CA") → "K1A 0B1", ("11455", "SE") → "114 55".
 *
 * Valid means more than the right shape where the data knows more: a Dutch
 * code cannot start with 0, a Spanish one starts with 01 to 52, an Indian one
 * with the digits of one of its states. For many countries only the shape is
 * known; use geodata-kit-postal's isKnownPostalCode to check that a code exists.
 */
export function normalizePostalCode(value: string, country: string): string | null {
  const code = countryCode(country);
  const format = code ? FORMATS[code] : undefined;
  if (!code || !format?.postal || typeof value !== 'string') return null;
  let text = cleanText(value).toUpperCase().replace(/^〒\s*/, '');
  for (const prefix of [...format.postal.prefixes].sort((a, b) => b.length - a.length)) {
    if (text.startsWith(prefix) && text.length > prefix.length) { text = text.slice(prefix.length).trim(); break; }
  }
  const valid = (candidate: string): boolean => isValidCode(candidate, code, format);
  const compact = text.replace(/[\s-]/g, '');
  for (const layout of format.postal.layouts) {
    const rendered = renderLayout(layout, compact);
    if (rendered && valid(rendered)) return rendered;
  }
  // Spacing taken from the official examples ("A65 F4E2" → a space after 3 characters).
  for (const example of format.postal.examples) {
    const exampleCompact = example.replace(/[\s-]/g, '');
    if (exampleCompact.length !== compact.length) continue;
    let rendered = '';
    let index = 0;
    for (const character of example) rendered += /[\s-]/.test(character) ? character : compact[index++]!;
    if (valid(rendered)) return rendered;
  }
  if (valid(text)) return text;
  if (valid(compact)) return compact;
  return null;
}

/** True if the value is (or normalises to) a valid postal code of the country. */
export function isValidPostalCode(value: string, country: string): boolean {
  return normalizePostalCode(value, country) !== null;
}

// ─── Formatting ───────────────────────────────────────────────────────────

export interface PostalAddress {
  name?: string | null;
  organization?: string | null;
  /** Street lines; or use line1/line2. */
  addressLines?: (string | null | undefined)[];
  line1?: string | null;
  line2?: string | null;
  dependentLocality?: string | null;
  city?: string | null;
  /** Name, key or ISO code; written as the key ("CA") where the country uses keys. */
  region?: string | null;
  postalCode?: string | null;
  sortingCode?: string | null;
  /** Destination country (code or name). */
  country: string;
}

export interface FormatAddressOptions {
  /** Sender's country: when it differs from the destination, the country line is added (upper case, English). */
  from?: string;
  /** Always add the country line. */
  includeCountry?: boolean;
  /** Use the Latin-script layout where one exists (JP, CN, KR, …). */
  latin?: boolean;
}

/**
 * Lines of an address in the destination country's layout, ready for an
 * envelope. An unknown country gives an empty list (no error), like every
 * function of this package.
 */
export function formatAddress(address: PostalAddress, options: FormatAddressOptions = {}): string[] {
  const country = countryCode(address?.country);
  if (!country) return [];
  const format = FORMATS[country]!;
  const pattern = options.latin && format.latinFormat ? format.latinFormat : format.format;
  const upper = new Set(fieldsOf(format.upperCase));
  const region = address.region ? findRegion(address.region, country)?.region.key ?? address.region : '';
  const postalCode = address.postalCode ? normalizePostalCode(address.postalCode, country) ?? address.postalCode : '';
  const streetLines = (address.addressLines ?? [address.line1, address.line2]).filter((line): line is string => Boolean(line && line.trim()));
  const values: Record<AddressField, string> = {
    name: address.name ?? '',
    organization: address.organization ?? '',
    addressLines: streetLines.join('\n'),
    dependentLocality: address.dependentLocality ?? '',
    city: address.city ?? '',
    region,
    postalCode,
    sortingCode: address.sortingCode ?? '',
  };
  const lines: string[] = [];
  for (const template of pattern.split('%n')) {
    let line = template.replace(/%([A-Z])/g, (_, letter: string) => {
      const field = FIELD_BY_LETTER[letter];
      if (!field) return '';
      const value = values[field].trim();
      return upper.has(field) ? value.toLocaleUpperCase() : value;
    });
    // Drop separators left by empty fields: "City,  94103" → "City 94103", "CH- " → "".
    line = line.replace(/\s+,/g, ',').replace(/,\s*$/, '').replace(/^\s*[,-]\s*/, '').replace(/[ \t]{2,}/g, ' ').trim();
    if (!line || line === '-' || /^[A-Z]{1,3}-$/.test(line) || line === '〒') continue;
    lines.push(...line.split('\n').map((part) => part.trim()).filter(Boolean));
  }
  const sender = countryCode(options.from);
  if (options.includeCountry || (sender && sender !== country)) lines.push(formatCountry(country, { upperCase: true })!);
  return lines;
}

// ─── Parsing ──────────────────────────────────────────────────────────────

export interface ParsedAddress {
  /** Lines before the city line (name, organisation, street). */
  lines: string[];
  postalCode: string | null;
  city: string | null;
  /** Region key ("CA", "ON"), where the address has a region. */
  region: string | null;
  country: string | null;
  /** With geodata-kit-postal: whether the city matches the postal code. */
  postalCheck: 'confirmed' | 'corrected' | 'unknown' | 'not-checked';
}

type PostalModule = { findPlacesByPostalCode: (code: string, country: string) => Promise<{ name: string }[]> };
type CitiesModule = { findCity: (name: string, options: { country: string; subdivision?: string }) => Promise<{ name: string } | null> };
const optionalModules = new Map<string, Promise<unknown>>();

/** An optional package of the family, or null when it is not installed. The name is a variable so bundlers don't try to resolve it. */
function importOptional<T>(name: string): Promise<T | null> {
  let module = optionalModules.get(name);
  if (!module) {
    module = import(/* webpackIgnore: true */ /* @vite-ignore */ name).catch(() => null);
    optionalModules.set(name, module);
  }
  return module as Promise<T | null>;
}

/** Unanchored postal-code search inside a line, with optional prefix. */
function findPostalCode(line: string, country: string): { code: string; start: number; end: number } | null {
  const format = FORMATS[country];
  if (!format?.postal) return null;
  const sources = [format.postal.pattern, format.postal.secondaryPattern?.replace(/^\^/, '').replace(/\$$/, '')].filter((source): source is string => Boolean(source));
  const prefixes = format.postal.prefixes.map((prefix) => prefix.replace(/[-]/g, '\\-')).join('|');
  for (const source of sources) {
    let regex: RegExp;
    try {
      regex = new RegExp(`(?:^|[\\s,])(?:(?:${prefixes})\\s?)?(${source})(?=$|[\\s,])`, 'i');
    } catch {
      continue;
    }
    const match = regex.exec(line);
    if (match) {
      const code = normalizePostalCode(match[1]!, country);
      if (code) return { code, start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

interface Extracted {
  lines: string[];
  postalCode: string | null;
  city: string | null;
  region: Region | null;
  /** Where the street part of an unsplit city line goes back, if it is split later. */
  cityIndex: number;
}

/**
 * Postal code, region and city of an address in a known country. No data
 * outside this package is used, so it is also what the country detection runs
 * for every candidate country.
 */
function extract(input: string[], country: string): Extracted {
  const format = FORMATS[country]!;
  const lines = [...input];
  const result: Extracted = { lines, postalCode: null, city: null, region: null, cityIndex: 0 };

  // Postal code, searched from the bottom.
  let cityLineIndex = -1;
  for (let index = lines.length - 1; index >= 0; index--) {
    const found = findPostalCode(lines[index]!, country);
    if (!found) continue;
    result.postalCode = found.code;
    const rest = cleanText(`${lines[index]!.slice(0, found.start)} ${lines[index]!.slice(found.end)}`).replace(/^[,\s-]+|[,\s-]+$/g, '');
    if (rest) {
      lines[index] = rest;
      cityLineIndex = index;
    } else {
      lines.splice(index, 1);
      cityLineIndex = index - 1; // GB style: postcode on its own line under the town
    }
    break;
  }
  if (cityLineIndex < 0 && lines.length > 1) cityLineIndex = lines.length - 1;
  if (cityLineIndex < 0) return result;

  let cityText: string | null = lines[cityLineIndex]!;
  if (format.regions.length) {
    // Where the region is written right before the postal code, on its line (US "City, ST ZIP")
    // or on the line above (Ireland: county, then Eircode), text split on commas or lines
    // leaves the region alone: "…, San Francisco, CA 94103". The city is then the part
    // before it, unless that part is a street (it has a number).
    const regionBeforePostal = /%S(?:[^%]|%n)*%Z/.test(format.format);
    const whole = regionBeforePostal ? findRegion(cityText, country) : null;
    const before = cityLineIndex > 0 ? lines[cityLineIndex - 1]! : null;
    if (whole && before !== null && !/\d/.test(before)) {
      result.region = whole.region;
      lines.splice(cityLineIndex, 1);
      cityLineIndex -= 1;
      cityText = lines[cityLineIndex]!;
    } else if (whole?.by === 'key') {
      result.region = whole.region;
      cityText = null;
    } else {
      // The region as the last words of the city line: "San Francisco CA", "Austin, Texas".
      // When the whole text is also a region name but nothing before it can be the city,
      // it is the city itself ("350 Fifth Ave, New York 10118"); only a region key at
      // its end still counts ("WASHINGTON, DC": Washington DC is a name of the District).
      const words = cityText.split(/\s+/);
      for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
        const found = findRegion(words.slice(-take).join(' ').replace(/^,|,$/g, ''), country);
        // What is left must be a name: "Co." in front of "Carlow" is part of the region, not a city.
        const left = fold(words.slice(0, -take).join(' ')).split(' ').filter((word) => word && !regionIndex(country).typeWords.has(word));
        if (found && left.length && (!whole || found.by === 'key')) {
          result.region = found.region;
          cityText = words.slice(0, -take).join(' ').replace(/[,\s]+$/, '');
          break;
        }
      }
    }
  }
  result.city = cityText || null;
  lines.splice(cityLineIndex, 1);
  result.cityIndex = cityLineIndex;
  return result;
}

/** Countries by a postal prefix that ends in a dash: "CH-" → CH, "D-" → DE, "A-" → AT. */
let prefixCountries: Map<string, string> | null = null;
function countryOfPrefix(prefix: string): string | null {
  if (!prefixCountries) {
    prefixCountries = new Map();
    for (const [code, format] of Object.entries(FORMATS)) {
      for (const entry of format.postal?.prefixes ?? []) {
        if (entry.endsWith('-') && !prefixCountries.has(entry.toUpperCase())) prefixCountries.set(entry.toUpperCase(), code);
      }
    }
  }
  return prefixCountries.get(prefix.toUpperCase()) ?? null;
}

/** Countries whose addresses carry a region and whose data knows the postal ranges of regions. */
let regionCountries: string[] | null = null;

/**
 * The country of an address that does not name it, from what the address
 * itself shows:
 *  1. a postal prefix in front of a code that is valid for that country
 *     ("CH-8001", "D-80331");
 *  2. a region next to a postal code from that region's range ("CA 94103" is
 *     California, "ON K1M 1M4" is Ontario). Exactly one country must fit.
 * A bare postal code is never enough: "80331" fits dozens of countries.
 */
function detectCountry(lines: string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!;
    for (const match of line.matchAll(/(?:^|[\s,(])([A-Za-z]{1,3}-)(?=[A-Za-z0-9])/g)) {
      const country = countryOfPrefix(match[1]!);
      if (!country) continue;
      const found = findPostalCode(line.slice(match.index + match[0].length - match[1]!.length), country);
      if (found && found.start === 0) return country;
    }
  }
  regionCountries ??= Object.entries(FORMATS)
    .filter(([, format]) => format.postal && format.format.includes('%S') && format.regions.some((region) => region.postalPattern))
    .map(([code]) => code);
  const fitting = regionCountries.filter((country) => {
    const { region, postalCode } = extract(lines, country);
    if (!region?.postalPattern || !postalCode) return false;
    return new RegExp(`^(?:${region.postalPattern})`, 'i').test(postalCode.replace(/[\s-]/g, ''));
  });
  return fitting.length === 1 ? fitting[0]! : null;
}

/**
 * Splits "350 Fifth Avenue New York" into street and city, for text that has
 * no separator between them. The city is the longest ending that is a place
 * of the postal code (geodata-kit-postal) or a city of the country
 * (geodata-kit-cities). Null when neither package is installed or knows it.
 */
async function splitStreetAndCity(text: string, country: string, postalCode: string | null, region: Region | null): Promise<{ street: string; city: string } | null> {
  const words = text.split(/\s+/);
  if (words.length < 2) return null;
  const postal = await importOptional<PostalModule>('geodata-kit-postal');
  const cities = await importOptional<CitiesModule>('geodata-kit-cities');
  const places = postal && postalCode ? new Set((await postal.findPlacesByPostalCode(postalCode, country)).map((place) => fold(place.name))) : new Set<string>();
  for (let take = Math.min(4, words.length - 1); take >= 1; take--) {
    const candidate = words.slice(-take).join(' ');
    const known = places.has(fold(candidate))
      || (cities ? Boolean(await cities.findCity(candidate, { country, ...(region?.iso ? { subdivision: region.iso } : {}) }).catch(() => null)) : false);
    if (known) return { street: words.slice(0, -take).join(' ').replace(/[,\s]+$/, ''), city: candidate };
  }
  return null;
}

/**
 * Splits a free-text address into lines, postal code, city, region and country.
 *
 * Handles one-line ("Hauptstr. 1, D-80331 München, Deutschland") and
 * multi-line input, prefixes such as "D-" and "CH-", and layouts where the
 * region follows the city ("San Francisco CA 94103", "Austin, Texas 78701").
 *
 * The country is taken from the `country` option, else from a country name on
 * the last line, else from the address itself: a postal prefix ("CH-8001
 * Zürich") or a region next to a postal code of that region ("San Francisco,
 * CA 94103" → US, "Ottawa ON K1M 1M4" → CA). Without any of these every field
 * is null and `lines` has the input.
 *
 * Text without separators ("350 Fifth Avenue New York NY 10118") needs
 * geodata-kit-postal or geodata-kit-cities to tell the street from the city;
 * without them the street stays in `city`.
 */
export async function parseAddress(text: string, options: { country?: string } = {}): Promise<ParsedAddress> {
  const result: ParsedAddress = { lines: [], postalCode: null, city: null, region: null, country: null, postalCheck: 'not-checked' };
  if (typeof text !== 'string') return result;
  const multiline = text.includes('\n');
  let lines = (multiline ? text.split(/\r?\n/) : text.split(/\s*,\s*/)).map(cleanText).filter(Boolean);
  if (!lines.length) return result;

  // 1. Country: given, named on the last line, or shown by the address itself.
  let country = countryCode(options.country);
  const lastCountry = resolveCountry(lines[lines.length - 1]!);
  if (lastCountry && lines.length > 1 && (!country || lastCountry.code === country)) {
    country = lastCountry.code;
    lines = lines.slice(0, -1);
  }
  country ??= detectCountry(lines);
  result.country = country;
  if (!country) { result.lines = lines; return result; }

  // 2. Postal code, region and city.
  const extracted = extract(lines, country);
  result.postalCode = extracted.postalCode;
  result.region = extracted.region?.key ?? null;
  result.city = extracted.city;
  result.lines = extracted.lines;

  // 3. A city that starts with a number still has the street in front of it.
  if (result.city && /^\d/.test(result.city)) {
    const split = await splitStreetAndCity(result.city, country, result.postalCode, extracted.region);
    if (split) {
      result.city = split.city;
      if (split.street) result.lines.splice(extracted.cityIndex, 0, split.street);
    }
  }

  // 4. Cross-check with geodata-kit-postal.
  if (result.postalCode) {
    const postal = await importOptional<PostalModule>('geodata-kit-postal');
    if (postal) {
      const places = await postal.findPlacesByPostalCode(result.postalCode, country);
      const cityKey = result.city ? fold(result.city) : '';
      const same = places.find((place) => fold(place.name) === cityKey) ?? places.find((place) => cityKey && fold(place.name).startsWith(`${cityKey} `));
      if (!places.length) {
        result.postalCheck = 'unknown';
      } else if (result.city && same) {
        result.postalCheck = 'confirmed';
        // An envelope line is often upper case ("WASHINGTON, DC 20500"): give the city its normal spelling back.
        if (fold(same.name) === cityKey && result.city === result.city.toUpperCase() && result.city !== result.city.toLowerCase()) result.city = same.name;
      } else {
        // Correct only a missing city or a near-spelling ("Muenchn" → "München"); a
        // different name (GB postal data lists localities, not post towns) stays as written.
        // Compared with German transliterations undone too ("Muenchen" = "München").
        const loose = (value: string): string => fold(value).replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
        const looseKey = result.city ? loose(result.city) : '';
        const allowed = Math.max(1, Math.min(2, Math.floor(looseKey.length / 4)));
        const close = places.find((place) => !looseKey || editDistance(loose(place.name), looseKey, allowed) <= allowed);
        if (close) {
          result.city = close.name;
          result.postalCheck = 'corrected';
        } else {
          result.postalCheck = 'unknown';
        }
      }
    }
  }
  return result;
}

/**
 * Date of the data in this version, as YYYY-MM-DD. The data is refreshed about
 * once a month; every package of one version carries the same date.
 */
export const DATA_DATE: string = dataDate;
