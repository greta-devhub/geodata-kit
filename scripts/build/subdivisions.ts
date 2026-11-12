/**
 * Subdivisions on four levels (GeoNames admin1–admin4):
 *   data/subdivisions/level1.json        level 1 with ISO 3166-2, names and aliases
 *   data/subdivisions/deep/{CC}.json      levels 2–4 per country
 *   data/subdivisions/iso.json            every valid ISO 3166-2 code (CLDR) with its English name
 *
 * ISO 3166-2 for level 1, in order: Wikidata (GeoNames id P1566 → ISO P300),
 * Natural Earth admin-1 (gn_id → iso_3166_2), then an exact name match against
 * CLDR's English subdivision names. A code is accepted only if CLDR lists it.
 */
import { fold } from '../../packages/geodata-kit/src/fold.js';
import { cldrSubdivisionToIso, subdivisionNames, supplemental } from '../lib/cldr.js';
import { compareStrings, readJson, readTsv, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';
import { DISPLAY_LOCALES, type CountryRecord } from './countries.js';
import type { CountryLanguage } from './languages.js';

export interface Level1Record {
  country: string;
  code: string;
  iso: string | null;
  name: string;
  asciiName: string;
  geonameId: number;
  population: number | null;
  /** Alternative names: CLDR English, local and bundled-locale names, abbreviations. */
  aliases: string[];
}

/**
 * Deep levels: [code-path, name, geonameId, population, aliases?] where code-path
 * is "A1.A2[.A3[.A4]]". Aliases (local and translated names) exist for level 2 only.
 */
export type DeepRow = [string, string, number, number] | [string, string, number, number, string[]];

export async function buildSubdivisions(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const countryCodes = new Set(countries.map((country) => country.code));
  const languages = readJson<{ countries: Record<string, CountryLanguage[]> }>(dataPath('core', 'languages.json'));

  // Valid ISO 3166-2 codes (all levels) and English names from CLDR.
  const containment = supplemental<Record<string, { _contains: string[] }>>('subdivisionContainment', 'subdivisionContainment');
  const validIso = new Set<string>();
  for (const [parent, value] of Object.entries(containment)) {
    for (const child of value._contains) validIso.add(cldrSubdivisionToIso(child));
    if (!/^[A-Z]{2}$/.test(parent)) validIso.add(cldrSubdivisionToIso(parent));
  }
  const englishNames = subdivisionNames('en');
  const isoNames: Record<string, string> = {};
  for (const iso of [...validIso].sort(compareStrings)) {
    const name = englishNames[iso.replace('-', '').toLowerCase()];
    if (name) isoNames[iso] = name;
  }
  // Countries' first-level ISO codes (direct children of the country in CLDR).
  const firstLevelIso = new Map<string, Set<string>>();
  for (const [parent, value] of Object.entries(containment)) {
    if (/^[A-Z]{2}$/.test(parent)) firstLevelIso.set(parent, new Set(value._contains.map(cldrSubdivisionToIso)));
  }

  // GeoNames level 1 and level 2 names.
  const level1 = new Map<number, Level1Record>();
  for await (const [key, name, asciiName, geonameId] of readTsv(cachePath('admin1CodesASCII.txt'))) {
    const [country, code] = key!.split('.');
    if (!countryCodes.has(country!)) continue;
    level1.set(Number(geonameId), {
      country: country!, code: code!, iso: null, name: name!, asciiName: asciiName!, geonameId: Number(geonameId), population: null, aliases: [],
    });
  }

  // Populations and deeper levels from allCountries (work/admin.tsv).
  const deep = new Map<string, { 2: DeepRow[]; 3: DeepRow[]; 4: DeepRow[] }>();
  const level2Names = new Map<string, [string, number]>();
  for await (const [key, name, , geonameId] of readTsv(cachePath('admin2Codes.txt'))) {
    level2Names.set(key!, [name!, Number(geonameId)]);
  }
  const populationById = new Map<number, number>();
  for await (const c of readTsv(cachePath('work', 'admin.tsv'))) {
    // id, name, ascii, code, population, lat, lng, cc, a1, a2, a3, a4, tz
    const [id, name, , featureCode, population, , , country, a1, a2, a3, a4] = c;
    const pop = Number(population) || 0;
    populationById.set(Number(id), pop);
    if (!countryCodes.has(country!)) continue;
    const entry = deep.get(country!) ?? { 2: [], 3: [], 4: [] };
    if (featureCode === 'ADM3' && a1 && a2 !== undefined && a3) entry[3].push([`${a1}.${a2}.${a3}`, name!, Number(id), pop]);
    else if (featureCode === 'ADM4' && a1 && a4) entry[4].push([`${a1}.${a2}.${a3}.${a4}`, name!, Number(id), pop]);
    else continue;
    deep.set(country!, entry);
  }
  for (const [key, [name, geonameId]] of level2Names) {
    const [country, a1, a2] = key.split('.');
    if (!countryCodes.has(country!)) continue;
    const entry = deep.get(country!) ?? { 2: [], 3: [], 4: [] };
    entry[2].push([`${a1}.${a2}`, name, geonameId, populationById.get(geonameId) ?? 0]);
    deep.set(country!, entry);
  }
  for (const record of level1.values()) record.population = populationById.get(record.geonameId) ?? null;

  // ISO 3166-2 join.
  const accept = (country: string, iso: string | undefined): string | null => {
    if (!iso) return null;
    const upper = iso.trim().toUpperCase();
    return upper.startsWith(`${country}-`) && validIso.has(upper) ? upper : null;
  };
  const wikidata = new Map<number, string[]>();
  for (const row of readJson<{ rows: { iso: string; geonames?: string }[] }>(overlayPath('wikidata', 'subdivisions.json')).rows) {
    const id = Number(row.geonames);
    if (id) wikidata.set(id, [...(wikidata.get(id) ?? []), row.iso]);
  }
  const naturalEarth = new Map<number, string>();
  const neJson = readJson<{ features: { properties: Record<string, unknown> }[] }>(cachePath('ne_10m_admin_1_states_provinces.geojson'));
  for (const feature of neJson.features) {
    const id = Number(feature.properties.gn_id);
    const iso = feature.properties.iso_3166_2 as string | undefined;
    if (id > 0 && iso && !iso.includes('~')) naturalEarth.set(id, iso);
  }
  const stats = { wikidata: 0, naturalEarth: 0, name: 0, none: 0 };
  const usedIso = new Set<string>();
  const pickFirstLevel = (country: string, candidates: string[]): string | null => {
    const valid = candidates.map((iso) => accept(country, iso)).filter((iso): iso is string => iso !== null && !usedIso.has(iso));
    const first = firstLevelIso.get(country);
    return valid.find((iso) => first?.has(iso)) ?? valid.sort(compareStrings)[0] ?? null;
  };
  const sorted = [...level1.values()].sort((a, b) => compareStrings(`${a.country}.${a.code}`, `${b.country}.${b.code}`));
  for (const record of sorted) {
    const fromWikidata = pickFirstLevel(record.country, wikidata.get(record.geonameId) ?? []);
    if (fromWikidata) { record.iso = fromWikidata; stats.wikidata++; usedIso.add(fromWikidata); continue; }
    const fromNe = pickFirstLevel(record.country, [naturalEarth.get(record.geonameId) ?? '']);
    if (fromNe) { record.iso = fromNe; stats.naturalEarth++; usedIso.add(fromNe); }
  }
  for (const record of sorted) {
    if (record.iso) continue;
    const candidates = Object.entries(isoNames).filter(([iso, name]) => iso.startsWith(`${record.country}-`)
      && !usedIso.has(iso) && (fold(name) === fold(record.name) || fold(name) === fold(record.asciiName)));
    if (candidates.length === 1) {
      record.iso = candidates[0]![0]; stats.name++; usedIso.add(record.iso);
    } else {
      stats.none++;
    }
  }

  // Aliases: CLDR English name, GeoNames alternate names in relevant languages, abbreviations.
  const relevantLanguages = new Map<string, Set<string>>();
  for (const country of countries) {
    const set = new Set<string>(DISPLAY_LOCALES);
    for (const language of languages.countries[country.code] ?? []) if (language.status !== 'spoken') set.add(language.code.split('-')[0]!);
    set.add(''); set.add('abbr');
    relevantLanguages.set(country.code, set);
  }
  const aliasSets = new Map<number, Map<string, string>>();
  const addAlias = (id: number, alias: string): void => {
    const key = fold(alias);
    if (!key) return;
    const map = aliasSets.get(id) ?? new Map<string, string>();
    if (!map.has(key)) map.set(key, alias);
    aliasSets.set(id, map);
  };
  for (const record of level1.values()) {
    addAlias(record.geonameId, record.name);
    addAlias(record.geonameId, record.asciiName);
    if (record.iso && isoNames[record.iso]) addAlias(record.geonameId, isoNames[record.iso]!);
  }
  const level2Country = new Map<number, string>();
  for (const [country, levels] of deep) for (const row of levels[2]) level2Country.set(row[2], country);
  for await (const [id, language, name, , , colloquial, historic] of readTsv(cachePath('work', 'altnames.tsv'))) {
    const numericId = Number(id);
    const country = level1.get(numericId)?.country ?? level2Country.get(numericId);
    if (!country || !name || colloquial === '1' || historic === '1') continue;
    const lang = (language ?? '').split('-')[0]!;
    if (['iata', 'icao', 'unlc', 'wkdt'].includes(lang)) continue;
    if (!relevantLanguages.get(country)!.has(lang)) continue;
    addAlias(numericId, name);
  }
  for (const levels of deep.values()) {
    levels[2] = levels[2].map((row) => {
      const map = aliasSets.get(row[2]);
      if (!map) return row;
      map.delete(fold(row[1]));
      return map.size ? [row[0], row[1], row[2], row[3], [...map.values()].sort(compareStrings)] : row;
    });
  }
  for (const record of level1.values()) {
    const map = aliasSets.get(record.geonameId)!;
    map.delete(fold(record.name));
    record.aliases = [...map.values()].sort(compareStrings);
  }

  writeJson(dataPath('subdivisions', 'level1.json'), sorted);
  writeJson(dataPath('subdivisions', 'iso.json'), isoNames, 'lines');
  let deepRows = 0;
  for (const [country, levels] of [...deep.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    for (const level of [2, 3, 4] as const) levels[level].sort((a, b) => compareStrings(a[0], b[0]) || a[2] - b[2]);
    deepRows += levels[2].length + levels[3].length + levels[4].length;
    writeJson(dataPath('subdivisions', 'deep', `${country}.json`), levels, 'compact');
  }
  writeJson(dataPath('reports', 'subdivisions.json'), {
    level1: sorted.length,
    isoMatchedBy: stats,
    isoMatchRate: `${(((sorted.length - stats.none) / sorted.length) * 100).toFixed(1)}%`,
    withoutIso: sorted.filter((record) => !record.iso).map((record) => `${record.country}.${record.code} ${record.name}`),
  });
  console.log(`  subdivisions: level1 ${sorted.length} (ISO: wikidata ${stats.wikidata}, naturalEarth ${stats.naturalEarth}, name ${stats.name}, none ${stats.none}); deep rows ${deepRows} in ${deep.size} countries`);
}
