/**
 * geodata-kit-address — address formats, required fields, regions and
 * postal-code rules for every country, plus formatting and parsing.
 *
 * Data licences and credits: see NOTICE.
 * postal formats. With the optional geodata-kit-postal package installed,
 * parseAddress also checks the city against the postal code.
 */
import formatsJson from '../../../data/address/formats.json';
import { cleanText, editDistance, fold, formatCountry, normalizeCountryCode, resolveCountry } from 'geodata-kit';

export type AddressField = 'name' | 'organization' | 'addressLines' | 'dependentLocality' | 'city' | 'region' | 'postalCode' | 'sortingCode';

interface FormatRecord {
  format: string;
  latinFormat: string | null;
  required: string;
  upperCase: string;
  postal: { pattern: string | null; secondaryPattern: string | null; layouts: string[]; examples: string[]; prefixes: string[]; label: string } | null;
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
  /** ISO 3166-2, where known. */
  iso?: string;
  /** Postal codes of this region start with this pattern. */
  postalPattern?: string;
}

const FORMATS = formatsJson as unknown as Record<string, FormatRecord>;
const FIELD_BY_LETTER: Record<string, AddressField> = {
  N: 'name', O: 'organization', A: 'addressLines', D: 'dependentLocality', C: 'city', S: 'region', Z: 'postalCode', X: 'sortingCode',
};

function record(country: string): FormatRecord | null {
  const code = normalizeCountryCode(country);
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
  return (record(country)?.regions ?? []).map((region) => ({ ...region }));
}

/** The region key for a name, key or ISO code: ("California", "US") → "CA". */
export function resolveRegion(value: string, country: string): Region | null {
  const key = fold(cleanText(value));
  if (!key) return null;
  const upper = cleanText(value).toUpperCase();
  return listRegions(country).find((region) => region.key.toUpperCase() === upper || region.iso === upper
    || fold(region.name) === key || (region.latinName && fold(region.latinName) === key)) ?? null;
}

/** True when the value is a known region of the country, by key, name or ISO code. */
export function isValidRegion(value: string, country: string): boolean {
  return resolveRegion(value, country) !== null;
}

// ─── Postal codes ─────────────────────────────────────────────────────────

export interface PostalCodeRules {
  /** Anchored, case-insensitive pattern a normalised code must match. */
  pattern: RegExp;
  /** Layouts: '#' digit, '@' letter ("@# #@@" …). */
  layouts: string[];
  examples: string[];
  /** Prefixes accepted in front of the code ("D-", "CH-"). */
  prefixes: string[];
  label: string;
}

const patternCache = new Map<string, RegExp[]>();
function patterns(country: string, format: FormatRecord): RegExp[] {
  let cached = patternCache.get(country);
  if (!cached) {
    cached = [];
    if (format.postal?.pattern) cached.push(new RegExp(`^(?:${format.postal.pattern})$`, 'i'));
    if (format.postal?.secondaryPattern) {
      try {
        const secondary = format.postal.secondaryPattern;
        cached.push(new RegExp(secondary.startsWith('^') ? `^(?:${secondary.slice(1, secondary.endsWith('$') ? -1 : undefined)})$` : `^(?:${secondary})$`, 'i'));
      } catch {
        // A few secondary patterns use syntax JavaScript does not accept; the main pattern is enough then.
      }
    }
    patternCache.set(country, cached);
  }
  return cached;
}

/** Postal-code rules of a country, or null when it has no postal codes. */
export function getPostalCodeRules(country: string): PostalCodeRules | null {
  const code = normalizeCountryCode(country);
  const format = code ? FORMATS[code] : undefined;
  if (!code || !format?.postal) return null;
  return {
    pattern: patterns(code, format)[0]!,
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
 */
export function normalizePostalCode(value: string, country: string): string | null {
  const code = normalizeCountryCode(country);
  const format = code ? FORMATS[code] : undefined;
  if (!code || !format?.postal || typeof value !== 'string') return null;
  let text = cleanText(value).toUpperCase().replace(/^〒\s*/, '');
  for (const prefix of [...format.postal.prefixes].sort((a, b) => b.length - a.length)) {
    if (text.startsWith(prefix) && text.length > prefix.length) { text = text.slice(prefix.length).trim(); break; }
  }
  const valid = (candidate: string): boolean => patterns(code, format).some((pattern) => pattern.test(candidate));
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

/** Lines of an address in the destination country's layout, ready for an envelope. */
export function formatAddress(address: PostalAddress, options: FormatAddressOptions = {}): string[] {
  const country = normalizeCountryCode(address.country) ?? resolveCountry(address.country)?.code ?? null;
  if (!country) throw new Error(`Unknown country: ${address.country}`);
  const format = FORMATS[country]!;
  const pattern = options.latin && format.latinFormat ? format.latinFormat : format.format;
  const upper = new Set(fieldsOf(format.upperCase));
  const region = address.region ? resolveRegion(address.region, country)?.key ?? address.region : '';
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
  const sender = options.from ? normalizeCountryCode(options.from) ?? resolveCountry(options.from)?.code : null;
  if (options.includeCountry || (sender && sender !== country)) lines.push(formatCountry(country, { upperCase: true })!);
  return lines;
}

// ─── Parsing ──────────────────────────────────────────────────────────────

export interface ParsedAddress {
  /** Lines before the city line (name, organisation, street). */
  lines: string[];
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  /** With geodata-kit-postal: whether the city matches the postal code. */
  postalCheck: 'confirmed' | 'corrected' | 'unknown' | 'not-checked';
}

type PostalModule = { findPlacesByPostalCode: (code: string, country: string) => Promise<{ name: string }[]> };
let postalModule: Promise<PostalModule | null> | null = null;
function importPostal(): Promise<PostalModule | null> {
  const name = 'geodata-kit-postal';
  postalModule ??= import(/* webpackIgnore: true */ /* @vite-ignore */ name).catch(() => null);
  return postalModule;
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

/**
 * Splits a free-text address into lines, postal code, city, region and country.
 * Handles one-line ("Hauptstr. 1, D-80331 München, Deutschland") and multi-line
 * input, prefixes such as "D-" and "CH-", and layouts where the region follows
 * the city ("San Francisco CA 94103").
 */
export async function parseAddress(text: string, options: { country?: string } = {}): Promise<ParsedAddress> {
  const result: ParsedAddress = { lines: [], postalCode: null, city: null, region: null, country: null, postalCheck: 'not-checked' };
  if (typeof text !== 'string') return result;
  const multiline = text.includes('\n');
  let lines = (multiline ? text.split(/\r?\n/) : text.split(/\s*,\s*/)).map(cleanText).filter(Boolean);
  if (!lines.length) return result;

  // 1. Country on the last line.
  let country = options.country ? normalizeCountryCode(options.country) ?? resolveCountry(options.country)?.code ?? null : null;
  const lastCountry = resolveCountry(lines[lines.length - 1]!);
  if (lastCountry && lines.length > 1 && (!country || lastCountry.code === country)) {
    country = lastCountry.code;
    lines = lines.slice(0, -1);
  }
  result.country = country;
  if (!country) { result.lines = lines; return result; }
  const format = FORMATS[country]!;
  const regionAfterCity = /%C[^%]*%S/.test(format.format);

  // 2. Postal code, searched from the bottom.
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

  // 3. City (and a trailing region).
  if (cityLineIndex >= 0) {
    let cityText = lines[cityLineIndex]!;
    if (format.regions.length || regionAfterCity) {
      const words = cityText.split(/\s+/);
      for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
        const candidate = words.slice(-take).join(' ').replace(/^,|,$/g, '');
        const region = resolveRegion(candidate, country);
        if (region) {
          result.region = region.key;
          cityText = words.slice(0, -take).join(' ').replace(/[,\s]+$/, '');
          break;
        }
      }
    }
    result.city = cityText || null;
    lines.splice(cityLineIndex, 1);
  }
  result.lines = lines;

  // 4. Cross-check with geodata-kit-postal.
  if (result.postalCode) {
    const postal = await importPostal();
    if (postal) {
      const places = await postal.findPlacesByPostalCode(result.postalCode, country);
      if (!places.length) {
        result.postalCheck = 'unknown';
      } else if (result.city && places.some((place) => fold(place.name) === fold(result.city!) || fold(place.name).startsWith(`${fold(result.city!)} `))) {
        result.postalCheck = 'confirmed';
      } else {
        // Correct only a missing city or a near-spelling ("Muenchn" → "München"); a
        // different name (GB postal data lists localities, not post towns) stays as written.
        // Compared with German transliterations undone too ("Muenchen" = "München").
        const loose = (value: string): string => fold(value).replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
        const cityKey = result.city ? loose(result.city) : '';
        const allowed = Math.max(1, Math.min(2, Math.floor(cityKey.length / 4)));
        const close = places.find((place) => !cityKey || editDistance(loose(place.name), cityKey, allowed) <= allowed);
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
