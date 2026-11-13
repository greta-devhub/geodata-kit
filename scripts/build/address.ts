/**
 * Address formats and postal-code rules per country: data/address/formats.json.
 *
 * Sources: Google libaddressinput address metadata (CC BY 4.0) for the line
 * format, required and upper-case fields, postal pattern, examples, prefix and
 * region lists; GeoNames countryInfo for the postal layout ('#' digit,
 * '@' letter) and a second pattern; overlays/postal.json for legacy prefixes.
 *
 * Region aliases come from the subdivision data (joined by ISO 3166-2 code):
 * the English ISO name ("Rome" for IT-RM, "Washington DC" for US-DC) and the
 * subdivision's own name. Their many nicknames and translations stay in
 * geodata-kit-subdivisions.
 *
 * Postal rules are checked against the real codes of data/postal, so a rule
 * is only tightened where the sources agree with reality (see `match` and
 * `byRegion`). The decisions are written to data/reports/address.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { fold } from '../../packages/geodata-kit/src/fold.js';

import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';
import type { CountryRecord } from './countries.js';
import type { Level1Record } from './subdivisions.js';

export interface AddressFormatRecord {
  /** Google format: %N name, %O organisation, %A address lines, %D dependent locality, %C city, %S region, %Z postal code, %X sorting code, %n new line. */
  format: string;
  /** Latin-script format where the local one differs (e.g. JP, CN). */
  latinFormat: string | null;
  required: string;
  upperCase: string;
  postal: {
    pattern: string | null;
    secondaryPattern: string | null;
    /**
     * How the two patterns decide: 'pattern' (the first one alone, the default),
     * 'either' (real codes exist that only the second pattern accepts: Argentina's
     * old 4-digit codes) or 'both' (every real code passes both, so the stricter
     * second pattern is safe: Armenia's 4 digits without the old "37").
     */
    match?: 'either' | 'both';
    /** True when a code must start with the range of one of the regions (every real code does). */
    byRegion?: true;
    /**
     * Words real codes carry after a valid code, with an optional office
     * number: "CEDEX" in "75008 CEDEX 08" (French business mail).
     */
    suffixes?: string[];
    layouts: string[];
    examples: string[];
    prefixes: string[];
    label: string;
  } | null;
  regionLabel: string;
  localityLabel: string;
  sublocalityLabel: string;
  /** Country name as written on the last line of international mail (Google, upper case). */
  postalCountryName: string | null;
  regions: { key: string; name: string; latinName?: string; aliases?: string[]; iso?: string; postalPattern?: string }[];
}

const DEFAULT_FORMAT = '%N%n%O%n%A%n%C';

function split(value: string | undefined): string[] {
  return value ? value.split('~') : [];
}

/** Names are compared without spaces, so "Washington, D.C." equals "Washington DC". */
const compactKey = (text: string): string => fold(text).replace(/ /g, '');

function anchored(source: string | null): RegExp | null {
  if (!source) return null;
  try {
    const inner = source.replace(/^\^/, '').replace(/\$$/, '');
    return new RegExp(`^(?:${inner})$`, 'i');
  } catch {
    return null; // a few second patterns use syntax JavaScript does not accept
  }
}

/** Real postal codes of a country (data/postal), upper case, without the country's prefixes. */
function realCodes(country: string, prefixes: string[]): string[] {
  const path = dataPath('postal', `${country}.json.gz`);
  if (!existsSync(path)) return [];
  const rows = (JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as { rows: [string, ...unknown[]][] }).rows;
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  return [...new Set(rows.map((row) => {
    const code = row[0].toUpperCase().trim();
    const prefix = sorted.find((entry) => code.startsWith(entry) && code.length > entry.length);
    return prefix ? code.slice(prefix.length).trim() : code;
  }))];
}

/** A code written in a layout ('#' digit, '@' letter, anything else literal), or null when it does not fit. */
function renderLayout(layout: string, compact: string): string | null {
  if (layout.replace(/[^#@A-Z0-9]/g, '').length !== compact.length) return null;
  let index = 0;
  let output = '';
  for (const symbol of layout) {
    if (!/[#@A-Z0-9]/.test(symbol)) { output += symbol; continue; }
    const character = compact[index++]!;
    if ((symbol === '#' && !/\d/.test(character)) || (symbol === '@' && !/[A-Z]/.test(character)) || (/[A-Z0-9]/.test(symbol) && symbol !== character)) return null;
    output += character;
  }
  return output;
}

/** Fewer real codes than this prove nothing about a rule. */
const MIN_EVIDENCE = 5;

export async function buildAddress(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const prefixOverlay = readJson<{ prefixes: Record<string, string[]> }>(overlayPath('postal.json')).prefixes;
  if (!existsSync(dataPath('postal'))) throw new Error('data/postal is missing: run `npm run generate -- postal` first (the postal rules are checked against it)');
  const isoNames = readJson<Record<string, string>>(dataPath('subdivisions', 'iso.json'));
  const level1ByIso = new Map(readJson<Level1Record[]>(dataPath('subdivisions', 'level1.json')).filter((record) => record.iso).map((record) => [record.iso!, record]));
  const formats: Record<string, AddressFormatRecord> = {};
  const report: Record<string, string> = {};
  let withRegions = 0;

  for (const country of countries) {
    const path = cachePath('address', `${country.code}.json`);
    const google = existsSync(path) ? readJson<Record<string, string>>(path) : {};
    const zip = google.zip ?? null;
    const geonamesPattern = country.postal.regex;
    const layouts = country.postal.format ? country.postal.format.split('|').map((layout) => layout.trim()).filter(Boolean) : [];
    // Google is the authority when it has a record for the country: no `zip`
    // there means no postal codes (GeoNames lists a pattern for the UAE, which has none).
    const hasGoogleRecord = Boolean(google.fmt || google.name);
    const hasPostal = Boolean(zip || (!hasGoogleRecord && geonamesPattern));
    const prefixes = [...new Set([...(google.postprefix ? [google.postprefix] : []), ...(prefixOverlay[country.code] ?? []), `${country.code}-`])];

    const keys = split(google.sub_keys);
    const names = split(google.sub_names);
    const latinNames = split(google.sub_lnames);
    const isoIds = split(google.sub_isoids);
    const zips = split(google.sub_zips);
    const regions = keys.map((key, index) => {
      const region: AddressFormatRecord['regions'][number] = { key, name: names[index] || key };
      if (latinNames[index]) region.latinName = latinNames[index];
      if (isoIds[index]) region.iso = `${country.code}-${isoIds[index]}`;
      if (zips[index]) region.postalPattern = zips[index];
      return region;
    });
    if (regions.length) withRegions++;

    // Aliases from the subdivision data. An alias that could mean two regions of
    // the country, or that is another region's own name, is dropped.
    const taken = new Map<string, number>();
    const claim = (text: string | undefined): void => { if (text) taken.set(compactKey(text), (taken.get(compactKey(text)) ?? 0) + 1); };
    for (const region of regions) { claim(region.key); if (compactKey(region.name) !== compactKey(region.key)) claim(region.name); if (region.latinName) claim(region.latinName); }
    const candidates = regions.map((region) => {
      if (!region.iso) return [];
      const level1 = level1ByIso.get(region.iso);
      const names = [isoNames[region.iso], level1?.name, level1?.asciiName].filter((name): name is string => Boolean(name));
      const own = new Set([region.key, region.name, region.latinName ?? ''].map(compactKey));
      const unique = new Map<string, string>();
      for (const name of names) {
        const key = compactKey(name);
        if (key.length >= 3 && !own.has(key) && !unique.has(key)) unique.set(key, name);
      }
      return [...unique.entries()];
    });
    const aliasCount = new Map<string, number>();
    for (const list of candidates) for (const [key] of list) aliasCount.set(key, (aliasCount.get(key) ?? 0) + 1);
    regions.forEach((region, index) => {
      const aliases = candidates[index]!.filter(([key]) => !taken.has(key) && aliasCount.get(key) === 1).map(([, name]) => name).sort(compareStrings);
      if (aliases.length) region.aliases = aliases;
    });

    // Postal rules, decided by the real codes of the country.
    const main = anchored(zip);
    const second = anchored(geonamesPattern);
    const codes = hasPostal ? realCodes(country.code, prefixes) : [];
    let match: 'either' | 'both' | undefined;
    let byRegion: true | undefined;
    if (hasPostal && main && second) {
      const onlySecond = codes.filter((code) => !main.test(code) && second.test(code));
      const passMain = codes.filter((code) => main.test(code));
      // Partial codes (GB "SW1A", CA "K1A", NL "1234") pass neither as full codes; they are no evidence.
      const partial = codes.length > 0 && passMain.length === 0 && onlySecond.length === 0;
      if (!partial && onlySecond.length) match = 'either';
      else if (passMain.length >= MIN_EVIDENCE && passMain.every((code) => second.test(code))) match = 'both';
      // When the second pattern rejects every official example, the two sources describe
      // different code systems (Serbia's 6-digit address codes next to its 5-digit postal
      // codes), and the real codes we have cover only one of them: the first pattern stays alone.
      if (match === 'both') {
        const official = split(google.zipex?.replace(/,/g, '~')).map((example) => example.toUpperCase());
        const fits = (example: string): boolean => {
          const compact = example.replace(/[\s-]/g, '');
          return [...layouts.map((layout) => renderLayout(layout, compact)), example, compact].some((form) => form !== null && main.test(form) && second.test(form));
        };
        if (official.length && !official.some(fits)) {
          match = undefined;
          report[country.code] = 'patterns: the second one rejects every official example, so the first one decides alone';
        }
      }
    }
    const accepts = (code: string): boolean => {
      if (!main) return Boolean(second?.test(code));
      if (match === 'either') return main.test(code) || Boolean(second?.test(code));
      if (match === 'both') return main.test(code) && Boolean(second?.test(code));
      return main.test(code);
    };
    const complete = regions.length > 0 && regions.every((region) => region.postalPattern);
    if (hasPostal && complete) {
      const ranges = new RegExp(`^(?:${regions.map((region) => region.postalPattern).join('|')})`, 'i');
      const valid = codes.filter(accepts);
      const outside = valid.filter((code) => !ranges.test(code.replace(/[\s-]/g, '')));
      if (valid.length >= MIN_EVIDENCE && outside.length === 0) byRegion = true;
      report[country.code] = byRegion
        ? `region ranges enforced (${valid.length} real codes agree)`
        : valid.length < MIN_EVIDENCE
          ? 'region ranges not enforced: no real codes to check them against'
          : `region ranges not enforced: ${outside.length} of ${valid.length} real codes are outside them (e.g. ${outside.slice(0, 3).join(', ')})`;
    } else if (hasPostal && regions.some((region) => region.postalPattern)) {
      report[country.code] = `region ranges not enforced: ${regions.filter((region) => !region.postalPattern).length} of ${regions.length} regions have no range`;
    }
    if (match) report[country.code] = `${report[country.code] ? `${report[country.code]}; ` : ''}patterns: ${match === 'both' ? 'both must match' : 'either may match (real codes need the second one)'}`;
    const ranges = byRegion ? new RegExp(`^(?:${regions.map((region) => region.postalPattern).join('|')})`, 'i') : null;
    const valid = (code: string): boolean => accepts(code) && (!ranges || ranges.test(code.replace(/[\s-]/g, '')));

    // Suffixes: a word that real codes carry after a valid code, often enough to be a rule.
    const suffixCounts = new Map<string, number>();
    for (const code of codes) {
      const found = /^(.+?) ([A-Z]{3,})(?: \d{1,2})?$/.exec(code);
      if (found && !valid(code) && valid(found[1]!)) suffixCounts.set(found[2]!, (suffixCounts.get(found[2]!) ?? 0) + 1);
    }
    const suffixes = [...suffixCounts].filter(([, count]) => count >= MIN_EVIDENCE).map(([word]) => word).sort(compareStrings);
    if (suffixes.length) report[country.code] = `${report[country.code] ? `${report[country.code]}; ` : ''}suffixes: ${suffixes.map((word) => `${word} (${suffixCounts.get(word)} real codes)`).join(', ')}`;

    // Examples that the final rule rejects are legacy forms (Armenia's "375010"); they are dropped.
    // An example counts as it would be normalised: written in a layout, as given, or without separators.
    const acceptable = (example: string): boolean => {
      const text = example.toUpperCase();
      const compact = text.replace(/[\s-]/g, '');
      return [...layouts.map((layout) => renderLayout(layout, compact)), text, compact].some((form) => form !== null && valid(form));
    };
    const examples = split(google.zipex?.replace(/,/g, '~')).filter((example) => !hasPostal || acceptable(example));
    // A literal layout takes the spacing of its official example: "GIR0AA" → "GIR 0AA".
    const spaced = new Map(examples.map((example) => [example.replace(/[\s-]/g, ''), example]));
    const finalLayouts = layouts.map((layout) => (/[#@]/.test(layout) ? layout : spaced.get(layout.replace(/[\s-]/g, '')) ?? layout));

    formats[country.code] = {
      format: google.fmt ?? DEFAULT_FORMAT,
      latinFormat: google.lfmt ?? null,
      required: google.require ?? 'AC',
      // Only what the country itself asks for; Google's global default upper-cases the
      // city everywhere, which is wrong for domestic mail in e.g. Germany.
      upperCase: google.upper ?? '',
      postal: hasPostal ? {
        pattern: zip,
        secondaryPattern: geonamesPattern,
        ...(match ? { match } : {}),
        ...(byRegion ? { byRegion } : {}),
        ...(suffixes.length ? { suffixes } : {}),
        layouts: finalLayouts,
        examples,
        prefixes,
        label: google.zip_name_type ?? 'postal',
      } : null,
      regionLabel: google.state_name_type ?? 'province',
      localityLabel: google.locality_name_type ?? 'city',
      sublocalityLabel: google.sublocality_name_type ?? 'suburb',
      postalCountryName: google.name ?? null,
      regions,
    };
  }

  writeJson(dataPath('address', 'formats.json'), Object.fromEntries(Object.entries(formats).sort(([a], [b]) => compareStrings(a, b))), 'lines');
  writeJson(dataPath('reports', 'address.json'), Object.fromEntries(Object.entries(report).sort(([a], [b]) => compareStrings(a, b))), 'lines');
  console.log(`  address: ${Object.keys(formats).length} countries (${Object.values(formats).filter((format) => format.postal).length} with postal codes, ${withRegions} with region lists)`);
}
