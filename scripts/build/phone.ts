/**
 * Phone-number metadata from libphonenumber (Apache-2.0), converted to compact
 * JSON: data/phone/metadata.json.
 *
 * Per region: calling code, international prefix, national prefix and the
 * parsing/transform rules, possible lengths, a pattern and example per number
 * type, and the formatting rules (pattern, format, last leading-digits pattern,
 * national-prefix formatting rule, international format).
 *
 * overlays/phone.json adds digits a country dropped that old records still
 * carry after the calling code (`droppedPrefix`: Mexico's mobile "1").
 */
import { readFileSync } from 'node:fs';

import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';

export const NUMBER_TYPES = [
  'fixedLine', 'mobile', 'tollFree', 'premiumRate', 'sharedCost', 'personalNumber', 'voip', 'pager', 'uan', 'voicemail', 'noInternationalDialling',
] as const;

interface TypeDesc { pattern: string; lengths: number[]; localLengths?: number[]; example?: string }
export interface RegionMetadata {
  callingCode: string;
  internationalPrefix: string | null;
  preferredInternationalPrefix?: string;
  nationalPrefix?: string;
  nationalPrefixForParsing?: string;
  nationalPrefixTransformRule?: string;
  leadingDigits?: string;
  main?: true;
  preferredExtnPrefix?: string;
  /** Digits dropped from the country's numbers that old records still carry after the calling code (Mexico's mobile "1"). */
  droppedPrefix?: string;
  general: { pattern: string; lengths: number[]; localLengths: number[] };
  types: Partial<Record<(typeof NUMBER_TYPES)[number], TypeDesc>>;
  formats: { pattern: string; format: string; leadingDigits?: string; nationalPrefixRule?: string; nationalPrefixOptional?: true; intlFormat?: string }[];
}

const stripSpace = (value: string): string => value.replace(/\s+/g, '');
const decode = (value: string): string => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function attributes(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of text.matchAll(/(\w+)="([^"]*)"/g)) result[match[1]!] = decode(match[2]!);
  return result;
}

/** "[4-6],8" → [4, 5, 6, 8]; "-1" → []. */
function parseLengths(value: string | undefined): number[] {
  if (!value || value === '-1') return [];
  const lengths: number[] = [];
  for (const part of value.split(',')) {
    const range = /^\[(\d+)-(\d+)\]$/.exec(part.trim());
    if (range) for (let n = Number(range[1]); n <= Number(range[2]); n++) lengths.push(n);
    else if (/^\d+$/.test(part.trim())) lengths.push(Number(part.trim()));
  }
  return lengths;
}

function element(body: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(body);
  return match ? match[2]! : null;
}

export async function buildPhone(): Promise<void> {
  const xml = readFileSync(cachePath('PhoneNumberMetadata.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const regions: Record<string, RegionMetadata> = {};
  const byCallingCode: Record<string, string[]> = {};
  const dropped = readJson<{ droppedPrefixes: Record<string, string> }>(overlayPath('phone.json')).droppedPrefixes;

  for (const match of xml.matchAll(/<territory\s([^>]*)>([\s\S]*?)<\/territory>/g)) {
    const attrs = attributes(match[1]!);
    const body = match[2]!;
    const id = attrs.id!;
    const types: RegionMetadata['types'] = {};
    const allLengths = new Set<number>();
    const allLocal = new Set<number>();
    for (const type of NUMBER_TYPES) {
      const desc = element(body, type);
      if (desc === null) continue;
      const pattern = element(desc, 'nationalNumberPattern');
      const lengthsTag = /<possibleLengths\s([^>]*)\/>/.exec(desc);
      const lengthAttrs = lengthsTag ? attributes(lengthsTag[1]!) : {};
      const lengths = parseLengths(lengthAttrs.national);
      const localLengths = parseLengths(lengthAttrs.localOnly);
      if (!pattern || !lengths.length) continue;
      const entry: TypeDesc = { pattern: stripSpace(pattern), lengths };
      if (localLengths.length) entry.localLengths = localLengths;
      const example = element(desc, 'exampleNumber');
      if (example) entry.example = example.trim();
      types[type] = entry;
      if (type !== 'noInternationalDialling') {
        for (const length of lengths) allLengths.add(length);
        for (const length of localLengths) allLocal.add(length);
      }
    }
    const generalPattern = element(element(body, 'generalDesc') ?? '', 'nationalNumberPattern');

    const formats: RegionMetadata['formats'] = [];
    const formatsBody = element(body, 'availableFormats') ?? '';
    for (const formatMatch of formatsBody.matchAll(/<numberFormat\s([^>]*)>([\s\S]*?)<\/numberFormat>/g)) {
      const formatAttrs = attributes(formatMatch[1]!);
      const formatBody = formatMatch[2]!;
      const leading = [...formatBody.matchAll(/<leadingDigits>([\s\S]*?)<\/leadingDigits>/g)].map((m) => stripSpace(m[1]!));
      const entry: RegionMetadata['formats'][number] = {
        pattern: stripSpace(formatAttrs.pattern!),
        format: element(formatBody, 'format')!.trim(),
      };
      // libphonenumber matches only the last (most specific) leading-digits pattern.
      if (leading.length) entry.leadingDigits = leading[leading.length - 1]!;
      const rule = formatAttrs.nationalPrefixFormattingRule ?? attrs.nationalPrefixFormattingRule;
      if (rule) entry.nationalPrefixRule = rule;
      if ((formatAttrs.nationalPrefixOptionalWhenFormatting ?? attrs.nationalPrefixOptionalWhenFormatting) === 'true') entry.nationalPrefixOptional = true;
      const intl = element(formatBody, 'intlFormat');
      if (intl !== null) entry.intlFormat = intl.trim();
      formats.push(entry);
    }

    const region: RegionMetadata = {
      callingCode: attrs.countryCode!,
      internationalPrefix: attrs.internationalPrefix ? stripSpace(attrs.internationalPrefix) : null,
      general: { pattern: stripSpace(generalPattern ?? ''), lengths: [...allLengths].sort((a, b) => a - b), localLengths: [...allLocal].sort((a, b) => a - b) },
      types,
      formats,
    };
    if (attrs.preferredInternationalPrefix) region.preferredInternationalPrefix = attrs.preferredInternationalPrefix;
    if (attrs.nationalPrefix) region.nationalPrefix = attrs.nationalPrefix;
    if (attrs.nationalPrefixForParsing) region.nationalPrefixForParsing = stripSpace(attrs.nationalPrefixForParsing);
    if (attrs.nationalPrefixTransformRule) region.nationalPrefixTransformRule = attrs.nationalPrefixTransformRule;
    if (attrs.leadingDigits) region.leadingDigits = stripSpace(attrs.leadingDigits);
    if (attrs.mainCountryForCode === 'true') region.main = true;
    if (attrs.preferredExtnPrefix) region.preferredExtnPrefix = attrs.preferredExtnPrefix;
    if (dropped[id]) region.droppedPrefix = dropped[id];

    // Non-geographic entities (+800, +882, …) share the id "001"; key them by calling code.
    const key = id === '001' ? `001-${region.callingCode}` : id;
    regions[key] = region;
    const list = byCallingCode[region.callingCode] ?? [];
    if (region.main) list.unshift(key); else list.push(key);
    byCallingCode[region.callingCode] = list;
  }

  writeJson(dataPath('phone', 'metadata.json'), {
    regions: Object.fromEntries(Object.entries(regions).sort(([a], [b]) => compareStrings(a, b))),
    byCallingCode: Object.fromEntries(Object.entries(byCallingCode).sort(([a], [b]) => Number(a) - Number(b))),
  }, 'lines');
  console.log(`  phone: ${Object.keys(regions).length} regions, ${Object.keys(byCallingCode).length} calling codes`);
}
