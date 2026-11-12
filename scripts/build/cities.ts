/**
 * Cities from GeoNames cities500 (which contains every smaller tier), written
 * per country in tier bands so nothing is stored twice:
 *
 *   data/cities/{CC}/15000.json   cities in cities15000
 *   data/cities/{CC}/5000.json    in cities5000 but not cities15000
 *   data/cities/{CC}/1000.json    in cities1000 but not cities5000
 *   data/cities/{CC}/500.json     the rest of cities500
 *   data/cities/index.json        geonameid → country and Wikidata id → country (for getCity / getPlaceByWikidataId)
 *   data/core/primary-timezones.json   timezone of each country's most populous city
 *
 * Each band file: { tz: string[], rows: Row[] } with
 *   Row = [geonameid, name, asciiName|0, featureCode, population, lat, lng, a1, a2, a3, a4, tzIndex, alternateNames|0, unlocode|0, wikidataId|0]
 */
import { fold } from '../../packages/geodata-kit/src/fold.js';
import { COL, comparePlaces, parsePlace, PLACE_CODES, type GeoNamesPlace } from '../lib/geonames.js';
import { compareStrings, readJson, readTsv, roundCoordinate, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';
import { DISPLAY_LOCALES, type CountryRecord } from './countries.js';
import type { CountryLanguage } from './languages.js';

export const BANDS = [15000, 5000, 1000, 500] as const;
export type Band = (typeof BANDS)[number];

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{M}'’ʻ`´.-]+$/u;

interface CityBuild extends GeoNamesPlace {
  band: Band;
  alternateNames: Map<string, string>;
  unlocode: string | null;
  wikidataId: string | null;
}

async function readIds(zip: string, entry: string): Promise<Set<number>> {
  const ids = new Set<number>();
  for await (const columns of readTsv(cachePath(zip), entry)) ids.add(Number(columns[COL.geonameId]));
  return ids;
}

export async function buildCities(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const countryCodes = new Set(countries.map((country) => country.code));
  const languages = readJson<{ countries: Record<string, CountryLanguage[]> }>(dataPath('core', 'languages.json'));
  const tiers = {
    15000: await readIds('cities15000.zip', 'cities15000.txt'),
    5000: await readIds('cities5000.zip', 'cities5000.txt'),
    1000: await readIds('cities1000.zip', 'cities1000.txt'),
  };

  const cities = new Map<number, CityBuild>();
  let skipped = 0;
  for await (const columns of readTsv(cachePath('cities500.zip'), 'cities500.txt')) {
    const place = parsePlace(columns);
    if (!place || !countryCodes.has(place.country) || !place.timezone || !place.name) { skipped++; continue; }
    const band: Band = tiers[15000].has(place.id) ? 15000 : tiers[5000].has(place.id) ? 5000 : tiers[1000].has(place.id) ? 1000 : 500;
    cities.set(place.id, { ...place, band, alternateNames: new Map(), unlocode: null, wikidataId: null });
  }

  // Alternate names and identifiers.
  const relevant = new Map<string, Set<string>>();
  for (const country of countries) {
    const set = new Set<string>(['', ...DISPLAY_LOCALES]);
    for (const language of languages.countries[country.code] ?? []) if (language.status !== 'spoken') set.add(language.code.split('-')[0]!);
    relevant.set(country.code, set);
  }
  for await (const [id, language, name, , , colloquial, historic] of readTsv(cachePath('work', 'altnames.tsv'))) {
    const city = cities.get(Number(id));
    if (!city || !name) continue;
    if (language === 'unlc') { if (!city.unlocode && /^[A-Z]{2}[A-Z0-9]{3}$/.test(name)) city.unlocode = name; continue; }
    if (language === 'wkdt') { if (!city.wikidataId && /^Q\d+$/.test(name)) city.wikidataId = name; continue; }
    if (colloquial === '1' || historic === '1') continue;
    const lang = (language ?? '').split('-')[0]!;
    if (lang.length > 3 || !relevant.get(city.country)!.has(lang)) continue;
    if (!LATIN.test(name)) continue;
    const key = fold(name);
    if (key.replace(/ /g, '').length < 3 || key === fold(city.name) || key === fold(city.asciiName)) continue;
    if (!city.alternateNames.has(key)) city.alternateNames.set(key, name);
  }

  // Per country and band.
  const byCountry = new Map<string, CityBuild[]>();
  for (const city of cities.values()) byCountry.set(city.country, [...(byCountry.get(city.country) ?? []), city]);

  const primary: Record<string, string> = {};
  const idIndex: Record<string, number[]> = {};
  const wikidataIndex: Record<string, string> = {};
  const bandCounts: Record<Band, number> = { 15000: 0, 5000: 0, 1000: 0, 500: 0 };
  let bytes = 0;

  for (const [country, list] of [...byCountry.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    list.sort(comparePlaces);
    const mostPopulous = list.find((city) => PLACE_CODES.has(city.featureCode)) ?? list[0]!;
    primary[country] = mostPopulous.timezone;
    idIndex[country] = list.map((city) => city.id).sort((a, b) => a - b);
    for (const city of list) if (city.wikidataId) wikidataIndex[city.wikidataId] = country;

    for (const band of BANDS) {
      const inBand = list.filter((city) => city.band === band);
      if (!inBand.length) continue;
      bandCounts[band] += inBand.length;
      const zones = [...new Set(inBand.map((city) => city.timezone))].sort(compareStrings);
      const zoneIndex = new Map(zones.map((zone, index) => [zone, index]));
      const rows = inBand.map((city) => [
        city.id,
        city.name,
        city.asciiName && city.asciiName !== city.name ? city.asciiName : 0,
        city.featureCode,
        city.population,
        roundCoordinate(city.lat),
        roundCoordinate(city.lng),
        city.admin1,
        city.admin2,
        city.admin3,
        city.admin4,
        zoneIndex.get(city.timezone)!,
        city.alternateNames.size ? [...city.alternateNames.values()].sort(compareStrings) : 0,
        city.unlocode ?? 0,
        city.wikidataId ?? 0,
      ]);
      bytes += writeJson(dataPath('cities', country, `${band}.json`), { tz: zones, rows }, 'compact');
    }
  }

  // Delta-encode the id lists (sorted ids → small numbers).
  const encodedIds: Record<string, number[]> = {};
  for (const [country, ids] of Object.entries(idIndex)) {
    encodedIds[country] = ids.map((id, index) => (index === 0 ? id : id - ids[index - 1]!));
  }
  writeJson(dataPath('cities', 'index.json'), { ids: encodedIds, wikidata: Object.fromEntries(Object.entries(wikidataIndex).sort(([a], [b]) => compareStrings(a, b))) }, 'compact');
  writeJson(dataPath('core', 'primary-timezones.json'), primary, 'lines');

  console.log(`  cities: ${cities.size} (${skipped} skipped) — bands ${JSON.stringify(bandCounts)}, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${byCountry.size} countries`);
}
