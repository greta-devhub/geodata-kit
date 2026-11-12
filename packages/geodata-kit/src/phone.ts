/**
 * geodata-kit/phone — parse, validate, classify and format phone numbers with
 * libphonenumber's metadata (Apache-2.0). The parsing rules follow
 * libphonenumber: calling-code and international-prefix extraction, national
 * prefix stripping with transform rules, region choice for shared calling
 * codes (+1, +7, +44, …) and number types.
 */
import metadataJson from '../../../data/phone/metadata.json';

export type PhoneNumberType =
  | 'fixed_line' | 'mobile' | 'fixed_line_or_mobile' | 'toll_free' | 'premium_rate' | 'shared_cost'
  | 'voip' | 'personal_number' | 'pager' | 'uan' | 'voicemail' | 'unknown';

export type PhoneFormat = 'E164' | 'INTERNATIONAL' | 'NATIONAL' | 'RFC3966';

export interface PhoneNumber {
  /** "+49891234567" */
  e164: string;
  /** Region of the number ("DE"), or null for non-geographic numbers (+800, …) and unknown numbers. */
  country: string | null;
  callingCode: string;
  /** National significant number, without national prefix: "891234567". */
  nationalNumber: string;
  extension: string | null;
  type: PhoneNumberType;
  isValid: boolean;
  /** Length is possible for the calling code (looser than isValid). */
  isPossible: boolean;
}

type TypeKey = 'fixedLine' | 'mobile' | 'tollFree' | 'premiumRate' | 'sharedCost' | 'personalNumber' | 'voip' | 'pager' | 'uan' | 'voicemail' | 'noInternationalDialling';
interface TypeDesc { pattern: string; lengths: number[]; localLengths?: number[]; example?: string }
interface Format { pattern: string; format: string; leadingDigits?: string; nationalPrefixRule?: string; nationalPrefixOptional?: true; intlFormat?: string }
interface RegionMetadata {
  callingCode: string;
  internationalPrefix: string | null;
  preferredInternationalPrefix?: string;
  nationalPrefix?: string;
  nationalPrefixForParsing?: string;
  nationalPrefixTransformRule?: string;
  leadingDigits?: string;
  main?: true;
  preferredExtnPrefix?: string;
  general: { pattern: string; lengths: number[]; localLengths: number[] };
  types: Partial<Record<TypeKey, TypeDesc>>;
  formats: Format[];
}

const METADATA = metadataJson as unknown as { regions: Record<string, RegionMetadata>; byCallingCode: Record<string, string[]> };

// ─── Regex cache ──────────────────────────────────────────────────────────

const regexCache = new Map<string, RegExp>();
function full(pattern: string): RegExp {
  const key = `F${pattern}`;
  let regex = regexCache.get(key);
  if (!regex) { regex = new RegExp(`^(?:${pattern})$`); regexCache.set(key, regex); }
  return regex;
}
function prefix(pattern: string): RegExp {
  const key = `P${pattern}`;
  let regex = regexCache.get(key);
  if (!regex) { regex = new RegExp(`^(?:${pattern})`); regexCache.set(key, regex); }
  return regex;
}

// ─── Input normalisation ─────────────────────────────────────────────────

const EXTENSION = /(?:;ext=|[\s,]*(?:#|x|xtn|ext\.?|extension|extn|ext:|доб\.?|anexo)[\s.:]*)(\d{1,7})#?\s*$/i;

function toAsciiDigits(text: string): string {
  return text.normalize('NFKC').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function prepare(text: string): { digits: string; plus: boolean; extension: string | null } | null {
  let value = toAsciiDigits(text).trim();
  // "tel:+49-89-1234567;ext=12"
  value = value.replace(/^tel:/i, '');
  let extension: string | null = null;
  const ext = EXTENSION.exec(value);
  if (ext) { extension = ext[1]!; value = value.slice(0, ext.index); }
  const start = value.search(/[+\d]/);
  if (start < 0) return null;
  value = value.slice(start);
  const plus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 2 || digits.length > 17) return null;
  return { digits, plus, extension };
}

// ─── Core rules ───────────────────────────────────────────────────────────

function regionsFor(callingCode: string): string[] {
  return METADATA.byCallingCode[callingCode] ?? [];
}

function mainMetadata(callingCode: string): RegionMetadata | null {
  const region = regionsFor(callingCode)[0];
  return region ? METADATA.regions[region]! : null;
}

function extractCallingCode(digits: string): { callingCode: string; rest: string } | null {
  if (digits.startsWith('0')) return null;
  for (let length = 1; length <= 3 && length <= digits.length; length++) {
    const candidate = digits.slice(0, length);
    if (METADATA.byCallingCode[candidate]) return { callingCode: candidate, rest: digits.slice(length) };
  }
  return null;
}

function matchesDesc(nationalNumber: string, desc: { pattern: string; lengths: number[] } | undefined): boolean {
  if (!desc || !desc.pattern) return false;
  if (desc.lengths.length && !desc.lengths.includes(nationalNumber.length)) return false;
  return full(desc.pattern).test(nationalNumber);
}

/** Strips the national prefix (and applies the transform rule) the way libphonenumber does. */
function stripNationalPrefix(nationalNumber: string, metadata: RegionMetadata): string {
  const prefixPattern = metadata.nationalPrefixForParsing ?? metadata.nationalPrefix;
  if (!prefixPattern) return nationalNumber;
  const match = prefix(prefixPattern).exec(nationalNumber);
  if (!match) return nationalNumber;
  const generalPattern = metadata.general.pattern;
  const viableOriginal = full(generalPattern).test(nationalNumber);
  const groups = match.length - 1;
  const transform = metadata.nationalPrefixTransformRule;
  let result: string;
  if (!transform || groups === 0 || match[groups] === undefined) {
    result = nationalNumber.slice(match[0].length);
  } else {
    result = transform.replace(/\$(\d)/g, (_, index: string) => match[Number(index)] ?? '') + nationalNumber.slice(match[0].length);
  }
  if (viableOriginal && !full(generalPattern).test(result)) return nationalNumber;
  // Don't strip when what remains is too short to be a number of the region.
  const minimum = Math.min(...metadata.general.lengths, ...metadata.general.localLengths);
  if (result.length < Math.max(2, Number.isFinite(minimum) ? minimum : 2)) return nationalNumber;
  return result;
}

const TYPE_ORDER: [TypeKey, PhoneNumberType][] = [
  ['premiumRate', 'premium_rate'], ['tollFree', 'toll_free'], ['sharedCost', 'shared_cost'], ['voip', 'voip'],
  ['personalNumber', 'personal_number'], ['pager', 'pager'], ['uan', 'uan'], ['voicemail', 'voicemail'],
];

function typeFor(nationalNumber: string, metadata: RegionMetadata): PhoneNumberType {
  if (!matchesDesc(nationalNumber, metadata.general)) return 'unknown';
  for (const [key, type] of TYPE_ORDER) if (matchesDesc(nationalNumber, metadata.types[key])) return type;
  const fixed = metadata.types.fixedLine;
  const mobile = metadata.types.mobile;
  if (matchesDesc(nationalNumber, fixed)) {
    if (fixed && mobile && fixed.pattern === mobile.pattern) return 'fixed_line_or_mobile';
    return matchesDesc(nationalNumber, mobile) ? 'fixed_line_or_mobile' : 'fixed_line';
  }
  if (!(fixed && mobile && fixed.pattern === mobile.pattern) && matchesDesc(nationalNumber, mobile)) return 'mobile';
  return 'unknown';
}

function regionFor(callingCode: string, nationalNumber: string): string | null {
  const regions = regionsFor(callingCode);
  if (regions.length === 1) return typeFor(nationalNumber, METADATA.regions[regions[0]!]!) !== 'unknown' ? regions[0]! : null;
  for (const region of regions) {
    const metadata = METADATA.regions[region]!;
    if (metadata.leadingDigits) {
      if (prefix(metadata.leadingDigits).test(nationalNumber)) return region;
    } else if (typeFor(nationalNumber, metadata) !== 'unknown') {
      return region;
    }
  }
  return null;
}

function build(callingCode: string, nationalNumber: string, extension: string | null): PhoneNumber {
  const region = regionFor(callingCode, nationalNumber);
  const metadata = region ? METADATA.regions[region]! : mainMetadata(callingCode)!;
  const type = region ? typeFor(nationalNumber, metadata) : 'unknown';
  const main = mainMetadata(callingCode)!;
  const length = nationalNumber.length;
  const isPossible = main.general.lengths.includes(length) || main.general.localLengths.includes(length);
  return {
    e164: `+${callingCode}${nationalNumber}`,
    country: region && !region.startsWith('001') ? region : null,
    callingCode,
    nationalNumber,
    extension,
    type,
    isValid: type !== 'unknown',
    isPossible,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Parses a phone number. Numbers without "+" or an international prefix need
 * the country they are written in: parsePhoneNumber('089 1234567', 'DE').
 * Returns null when no number can be read; check `isValid` for validity.
 */
export function parsePhoneNumber(text: string | null | undefined, defaultCountry?: string): PhoneNumber | null {
  if (typeof text !== 'string') return null;
  const prepared = prepare(text);
  if (!prepared) return null;
  const { digits, plus, extension } = prepared;
  const defaultRegion = defaultCountry?.trim().toUpperCase();
  const defaultMetadata = defaultRegion ? METADATA.regions[defaultRegion] : undefined;

  let callingCode: string;
  let national: string;
  if (plus) {
    const extracted = extractCallingCode(digits);
    if (!extracted) return null;
    ({ callingCode, rest: national } = extracted);
  } else {
    const internationalPrefix = defaultMetadata?.internationalPrefix;
    const afterPrefix = internationalPrefix ? prefix(internationalPrefix).exec(digits) : null;
    const extracted = afterPrefix && !digits.slice(afterPrefix[0].length).startsWith('0') ? extractCallingCode(digits.slice(afterPrefix[0].length)) : null;
    if (extracted) {
      ({ callingCode, rest: national } = extracted);
    } else if (defaultMetadata) {
      callingCode = defaultMetadata.callingCode;
      national = digits;
      // "49 89 1234567" written without "+" in Germany: strip the calling code if that makes it valid.
      if (digits.startsWith(callingCode)) {
        const withoutCode = stripNationalPrefix(digits.slice(callingCode.length), defaultMetadata);
        const asIs = stripNationalPrefix(digits, defaultMetadata);
        if (typeFor(asIs, defaultMetadata) === 'unknown' && typeFor(withoutCode, defaultMetadata) !== 'unknown') national = digits.slice(callingCode.length);
      }
    } else {
      return null;
    }
  }
  const metadata = (defaultMetadata && defaultMetadata.callingCode === callingCode ? defaultMetadata : null) ?? mainMetadata(callingCode);
  if (!metadata) return null;
  national = stripNationalPrefix(national, metadata);
  if (national.length < 2 || national.length > 17) return null;
  return build(callingCode, national, extension);
}

/**
 * Parses free-text fields with several numbers: "+49 89 1234567, 030 987654",
 * JSON arrays ('["+4989…","+4930…"]') or one number per line. Invalid parts are skipped.
 */
export function parsePhoneNumbers(text: string | null | undefined, defaultCountry?: string): PhoneNumber[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  let parts: string[];
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    try {
      parts = (JSON.parse(trimmed) as unknown[]).map(String);
    } catch {
      parts = trimmed.replace(/^\[|\]$/g, '').split(/[,;\n|]/);
    }
  } else {
    parts = trimmed.split(/\s*(?:[,;\n|]|\s\/\s|\s{3,})\s*/);
  }
  const seen = new Set<string>();
  const result: PhoneNumber[] = [];
  for (const part of parts) {
    const number = parsePhoneNumber(part.replace(/^["']|["']$/g, ''), defaultCountry);
    if (number && number.isPossible && !seen.has(number.e164)) {
      seen.add(number.e164);
      result.push(number);
    }
  }
  return result;
}

/** True when the number is valid (known pattern for its region). */
export function isValidPhoneNumber(text: string, defaultCountry?: string): boolean {
  return parsePhoneNumber(text, defaultCountry)?.isValid ?? false;
}

/** True when the length is possible for the calling code (no pattern check). */
export function isPossiblePhoneNumber(text: string, defaultCountry?: string): boolean {
  return parsePhoneNumber(text, defaultCountry)?.isPossible ?? false;
}

/** Number type: mobile, fixed_line, toll_free, … ('unknown' when invalid). */
export function getPhoneNumberType(number: string | PhoneNumber, defaultCountry?: string): PhoneNumberType {
  const parsed = typeof number === 'string' ? parsePhoneNumber(number, defaultCountry) : number;
  return parsed?.type ?? 'unknown';
}

function chooseFormat(formats: Format[], nationalNumber: string): Format | null {
  for (const format of formats) {
    if (format.leadingDigits && !prefix(format.leadingDigits).test(nationalNumber)) continue;
    if (full(format.pattern).test(nationalNumber)) return format;
  }
  return null;
}

/**
 * Formats a number: E164 "+49891234567", INTERNATIONAL "+49 89 1234567",
 * NATIONAL "089 1234567", RFC3966 "tel:+49-89-1234567".
 */
export function formatPhoneNumber(number: string | PhoneNumber, format: PhoneFormat = 'INTERNATIONAL', defaultCountry?: string): string | null {
  const parsed = typeof number === 'string' ? parsePhoneNumber(number, defaultCountry) : number;
  if (!parsed) return null;
  const { callingCode, nationalNumber, extension } = parsed;
  if (format === 'E164') return parsed.e164;
  // Like libphonenumber, every number of a calling code is formatted with the
  // main region's rules (+1 territories such as AG have no formats of their own).
  const metadata = mainMetadata(callingCode);
  let formatted = nationalNumber;
  if (metadata) {
    if (format === 'NATIONAL') {
      const chosen = chooseFormat(metadata.formats, nationalNumber);
      if (chosen) {
        let template = chosen.format;
        if (chosen.nationalPrefixRule) {
          // $FG is the first group the format uses ("$2" in "$2 15-$3-$4"), not always $1.
          template = template.replace(/\$\d/, (firstGroup) => chosen.nationalPrefixRule!.replace('$NP', metadata.nationalPrefix ?? '').replace('$FG', firstGroup));
        }
        formatted = nationalNumber.replace(full(chosen.pattern), template);
      }
    } else {
      const hasIntl = metadata.formats.some((entry) => entry.intlFormat !== undefined);
      const formats = hasIntl
        ? metadata.formats.filter((entry) => entry.intlFormat !== 'NA').map((entry) => ({ ...entry, format: entry.intlFormat ?? entry.format }))
        : metadata.formats;
      const chosen = chooseFormat(formats, nationalNumber);
      if (chosen) formatted = nationalNumber.replace(full(chosen.pattern), chosen.format);
      // International style separates groups with spaces only ("+1 800 212 3456"),
      // as libphonenumber-js does and ITU-T E.123 recommends.
      formatted = formatted.replace(/[-\u2010-\u2015\u2212\u30FC\uFF0D-\uFF0F \u00A0\u00AD\u200B\u2060\u3000()\uFF08\uFF09\uFF3B\uFF3D.\[\]/~\u2053\u223C\uFF5E]+/g, ' ').trim();
    }
  }
  const extensionText = extension ? `${format === 'RFC3966' ? ';ext=' : ` ${metadata?.preferredExtnPrefix?.trim() ?? 'ext.'} `}${extension}` : '';
  if (format === 'NATIONAL') return `${formatted}${extensionText}`;
  if (format === 'RFC3966') return `tel:+${callingCode}-${formatted.replace(/[^\d]+/g, '-')}${extensionText}`;
  return `+${callingCode} ${formatted}${extensionText}`;
}

/** Example number of a region and type (from libphonenumber), e.g. getExamplePhoneNumber('DE', 'mobile'). */
export function getExamplePhoneNumber(country: string, type: Exclude<PhoneNumberType, 'unknown' | 'fixed_line_or_mobile'> = 'fixed_line'): PhoneNumber | null {
  const metadata = METADATA.regions[country.trim().toUpperCase()];
  if (!metadata) return null;
  const key = type.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase()) as TypeKey;
  const example = metadata.types[key]?.example;
  return example ? build(metadata.callingCode, example, null) : null;
}

/** Regions (and non-geographic "001-xxx" entities) with phone metadata. */
export function listPhoneRegions(): string[] {
  return Object.keys(METADATA.regions);
}
