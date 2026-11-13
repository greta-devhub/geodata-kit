/**
 * Countries core: data/core/countries.json, names.json, retired.json, timezones.json, m49.json.
 *
 * Sources: GeoNames countryInfo (capital, area, population, continent, tld,
 * neighbours, postal format), CLDR (alpha-3/numeric checks, display names,
 * currencies with dates, retired codes, M49 tree, week data, measurement
 * system), IANA tzdata (zones per country, legacy aliases), libphonenumber
 * (calling codes), Wikidata (demonyms, driving side).
 */
import { readFileSync } from 'node:fs';

import { localeDisplayNames, supplemental } from '../lib/cldr.js';
import { compareStrings, readJson, readTsv, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';

/** Locales whose country names ship with the package (getCountryName). */
export const DISPLAY_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl'] as const;

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

interface Corrections {
  dropCountries: Record<string, string>;
  countryTimezones: Record<string, { timezones: string[] }>;
}

interface WikidataSnapshot { rows: Record<string, string>[] }

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Zones per country from tzdata zone.tab, plus every canonical zone and the backward links. */
function readTzdata(): { byCountry: Map<string, string[]>; canonical: Set<string>; links: Record<string, string> } {
  const byCountry = new Map<string, string[]>();
  const canonical = new Set<string>(['UTC']);
  for (const line of readFileSync(cachePath('tzdata', 'zone.tab'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [country, , zone] = line.split('\t');
    if (!country || !zone) continue;
    byCountry.set(country, [...(byCountry.get(country) ?? []), zone]);
    canonical.add(zone);
  }
  for (const file of ['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica', 'southamerica', 'etcetera']) {
    for (const line of readFileSync(cachePath('tzdata', file), 'utf8').split('\n')) {
      const match = /^Zone\s+(\S+)/.exec(line);
      if (match) canonical.add(match[1]!);
    }
  }
  const links: Record<string, string> = {};
  for (const file of ['backward', 'africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica', 'southamerica', 'etcetera']) {
    for (const line of readFileSync(cachePath('tzdata', file), 'utf8').split('\n')) {
      const match = /^Link\s+(\S+)\s+(\S+)/.exec(line);
      if (match && !canonical.has(match[2]!)) links[match[2]!] = match[1]!;
    }
  }
  // Resolve chains (a link pointing at another link).
  for (const [alias, target] of Object.entries(links)) {
    let resolved = target;
    for (let depth = 0; links[resolved] && depth < 5; depth++) resolved = links[resolved]!;
    links[alias] = resolved;
  }
  return { byCountry, canonical, links };
}

function readCallingCodes(): Map<string, string> {
  const xml = readFileSync(cachePath('PhoneNumberMetadata.xml'), 'utf8');
  const codes = new Map<string, string>();
  // Attributes can span several lines and come in any order.
  for (const match of xml.matchAll(/<territory\s([^>]*)>/g)) {
    const id = /\bid="([A-Z0-9]+)"/.exec(match[1]!)?.[1];
    const countryCode = /\bcountryCode="(\d+)"/.exec(match[1]!)?.[1];
    if (id && countryCode) codes.set(id, countryCode);
  }
  return codes;
}

/** Non-grouping M49 parent of every territory and region, from CLDR territoryContainment. */
function readM49(): { parent: Map<string, string>; groupings: Map<string, string[]> } {
  const containment = supplemental<Record<string, { _contains: string[]; _grouping?: string }>>('territoryContainment', 'territoryContainment');
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const groupingKeys: string[] = [];
  for (const [key, value] of Object.entries(containment)) {
    if (key.includes('-status-')) continue;
    if (value._grouping) {
      if (/^\d{3}$/.test(key)) groupingKeys.push(key);
      children.set(key, value._contains);
      continue;
    }
    children.set(key, value._contains);
    for (const child of value._contains) parent.set(child, key);
  }
  // Groupings (e.g. 419 Latin America, 202 Sub-Saharan Africa) contain regions,
  // so expand them down to countries.
  const expand = (code: string, depth = 0): string[] => {
    if (/^[A-Z]{2}$/.test(code)) return [code];
    if (depth > 5) return [];
    return (children.get(code) ?? []).flatMap((child) => expand(child, depth + 1));
  };
  const groupings = new Map<string, string[]>();
  for (const key of groupingKeys) {
    for (const country of expand(key)) groupings.set(country, [...(groupings.get(country) ?? []), key]);
  }
  return { parent, groupings };
}

export async function buildCountries(): Promise<CountryRecord[]> {
  const corrections = readJson<Corrections>(overlayPath('corrections.json'));
  const nameOverrides = readJson<{ en: Record<string, { name: string }> }>(overlayPath('names.json'));
  const codeMappings = supplemental<Record<string, { _alpha3?: string; _numeric?: string; _fips10?: string }>>('codeMappings', 'codeMappings');
  const currencyData = supplemental<{ region: Record<string, Record<string, { _from?: string; _to?: string; _tender?: string }>[]> }>('currencyData', 'currencyData');
  const weekData = supplemental<Record<string, Record<string, string>>>('weekData', 'weekData');
  const measurement = supplemental<Record<string, Record<string, string>>>('measurementData', 'measurementData');
  const territoryAlias = supplemental<{ alias: { territoryAlias: Record<string, { _reason: string; _replacement: string }> } }>('aliases', 'metadata').alias.territoryAlias;
  const facts = readJson<WikidataSnapshot>(overlayPath('wikidata', 'countryFacts.json')).rows;
  const tz = readTzdata();
  const callingCodes = readCallingCodes();
  const m49 = readM49();
  const englishNames = localeDisplayNames('en', 'territories')!;

  const countries: CountryRecord[] = [];
  for await (const c of readTsv(cachePath('countryInfo.txt'))) {
    const code = c[0]!;
    if (corrections.dropCountries[code]) continue;
    const mapping = codeMappings[code] ?? {};
    const alpha3 = c[1]!;
    if (mapping._alpha3 && mapping._alpha3 !== alpha3 && code !== 'XK') {
      throw new Error(`alpha-3 mismatch for ${code}: GeoNames ${alpha3}, CLDR ${mapping._alpha3}`);
    }

    const currencies = (currencyData.region[code] ?? [])
      .map((entry) => {
        const [currency, info] = Object.entries(entry)[0]!;
        return { code: currency, from: info._from ?? null, to: info._to ?? null, tender: info._tender !== 'false' };
      })
      .sort((a, b) => compareStrings(b.from ?? '', a.from ?? ''));

    const subregion = m49.parent.get(code) ?? null;
    const region = subregion ? m49.parent.get(subregion) ?? null : null;
    // CLDR puts intermediate regions (e.g. 029 Caribbean) directly under the continent;
    // if the grandparent is not a continent-level region, shift one level up.
    const topLevel = region && m49.parent.get(region) && m49.parent.get(region) !== '001' ? m49.parent.get(region)! : region;
    const factRows = facts.filter((row) => row.country === code);
    const demonym = factRows.map((row) => row.demonym).filter(Boolean).sort()[0] ?? null;
    const side = factRows.map((row) => row.drivingSide).find(Boolean)?.toLowerCase() ?? null;
    // libphonenumber first; Wikidata P474 for territories it doesn't list (e.g. PN +64).
    const wikidataCallingCode = factRows.map((row) => row.callingCode?.replace(/[^\d]/g, '')).find((value) => value && value.length <= 4) ?? null;

    countries.push({
      code,
      alpha3,
      numeric: c[2]!.padStart(3, '0'),
      fips: emptyToNull(c[3]),
      name: nameOverrides.en[code]?.name ?? englishNames[code] ?? c[4]!,
      geonameId: Number(c[16]),
      capital: emptyToNull(c[5]),
      area: c[6] ? Number(c[6]) : null,
      population: c[7] ? Number(c[7]) : null,
      continent: c[8]!,
      tld: emptyToNull(c[9]),
      callingCode: callingCodes.get(code) ?? wikidataCallingCode,
      currencies,
      neighbours: emptyToNull(c[17])?.split(',').filter((n) => !corrections.dropCountries[n]).sort() ?? [],
      timezones: corrections.countryTimezones[code]?.timezones ?? tz.byCountry.get(code) ?? [],
      m49: {
        region: topLevel,
        subregion: topLevel === region ? subregion : region,
        intermediate: topLevel === region ? null : subregion,
        groupings: (m49.groupings.get(code) ?? []).sort(),
      },
      weekStart: weekData.firstDay![code] ?? weekData.firstDay!['001']!,
      weekend: [weekData.weekendStart![code] ?? weekData.weekendStart!['001']!, weekData.weekendEnd![code] ?? weekData.weekendEnd!['001']!],
      measurementSystem: (measurement.measurementSystem![code] ?? 'metric') as CountryRecord['measurementSystem'],
      paperSize: (measurement.paperSize![code] ?? 'A4') as CountryRecord['paperSize'],
      demonym,
      drivingSide: side === 'left' || side === 'right' ? side : null,
      postal: { format: emptyToNull(c[13]), regex: emptyToNull(c[14]) },
      languageTags: emptyToNull(c[15])?.split(',') ?? [],
    });
  }
  countries.sort((a, b) => compareStrings(a.code, b.code));

  // Display names in the bundled locales (CLDR; English with the small override list).
  const names: Record<string, Record<string, string>> = {};
  for (const locale of DISPLAY_LOCALES) {
    const territories = localeDisplayNames(locale, 'territories')!;
    names[locale] = Object.fromEntries(countries.map((country) => [
      country.code,
      locale === 'en' ? country.name : territories[country.code] ?? country.name,
    ]));
  }

  // Retired codes → successors (CLDR territoryAlias, 2-letter only).
  const codes = new Set(countries.map((country) => country.code));
  const retired: Record<string, string[]> = {};
  for (const [alias, info] of Object.entries(territoryAlias).sort(([a], [b]) => compareStrings(a, b))) {
    if (!/^[A-Z]{2}$/.test(alias) || codes.has(alias)) continue;
    const successors = info._replacement.split(' ').filter((successor) => codes.has(successor));
    if (successors.length) retired[alias] = successors;
  }

  // M49 region names.
  const m49Names: Record<string, string> = {};
  for (const country of countries) {
    for (const regionCode of [country.m49.region, country.m49.subregion, country.m49.intermediate, ...country.m49.groupings]) {
      if (regionCode) m49Names[regionCode] = englishNames[regionCode] ?? regionCode;
    }
  }

  // Timezones: canonical list (validated against Intl) and legacy aliases.
  const supported = new Set(Intl.supportedValuesOf('timeZone'));
  const invalid = [...tz.canonical].filter((zone) => !supported.has(zone) && !isValidZone(zone));
  if (invalid.length) console.warn(`  timezones not known to this Node's Intl: ${invalid.join(', ')}`);
  for (const country of countries) {
    for (const zone of country.timezones) {
      if (!tz.canonical.has(zone)) throw new Error(`${country.code}: zone ${zone} is not canonical in tzdata`);
    }
  }

  writeJson(dataPath('core', 'countries.json'), countries);
  writeJson(dataPath('core', 'names.json'), names, 'lines');
  writeJson(dataPath('core', 'retired.json'), retired, 'lines');
  writeJson(dataPath('core', 'm49.json'), Object.fromEntries(Object.entries(m49Names).sort(([a], [b]) => compareStrings(a, b))), 'lines');
  writeJson(dataPath('core', 'timezones.json'), {
    zones: [...tz.canonical].sort(compareStrings),
    aliases: Object.fromEntries(Object.entries(tz.links).sort(([a], [b]) => compareStrings(a, b))),
  }, 'lines');

  console.log(`  countries: ${countries.length}, retired codes: ${Object.keys(retired).length}, zones: ${tz.canonical.size}, zone aliases: ${Object.keys(tz.links).length}`);
  return countries;
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
