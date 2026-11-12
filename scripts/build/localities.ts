/**
 * Localities for the optional geodata-kit-localities package: every populated
 * place in allCountries that is not in cities500 (villages, hamlets, small
 * towns), plus city districts (PPLX) linked to their parent city.
 *
 *   data/localities/{CC}.json.gz   { tz: string[], rows: Row[] }
 *   Row = [geonameid, name, asciiName|0, featureCode, population, lat, lng, a1, a2, a3, a4, tzIndex, parentId|0]
 *
 * Parents of districts come from GeoNames hierarchy ("pplx" links), otherwise
 * the nearest cities500 city in the same first-level subdivision within 25 km.
 */
import { createWriteStream, readdirSync, rmSync, type WriteStream } from 'node:fs';
import { basename, join } from 'node:path';

import { parsePlace } from '../lib/geonames.js';
import { compareStrings, ensureDir, readJson, readTsv, roundCoordinate, writeGzipJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';
import type { CountryRecord } from './countries.js';

const SPLIT_DIR = cachePath('work', 'places-by-country');
const PARENT_RADIUS_KM = 25;

type CityPoint = { id: number; lat: number; lng: number; admin1: string; population: number };

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function splitByCountry(countryCodes: Set<string>): Promise<void> {
  rmSync(SPLIT_DIR, { recursive: true, force: true });
  ensureDir(SPLIT_DIR);
  const streams = new Map<string, WriteStream>();
  for await (const line of (await import('../lib/io.js')).readLines(cachePath('work', 'places.tsv'))) {
    const country = line.split('\t', 9)[7]!;
    if (!countryCodes.has(country)) continue;
    let stream = streams.get(country);
    if (!stream) {
      stream = createWriteStream(join(SPLIT_DIR, `${country}.tsv`), { encoding: 'utf8' });
      streams.set(country, stream);
    }
    if (!stream.write(`${line}\n`)) await new Promise<void>((done) => stream!.once('drain', () => done()));
  }
  await Promise.all([...streams.values()].map((stream) => new Promise<void>((done) => stream.end(() => done()))));
}

export async function buildLocalities(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const countryCodes = new Set(countries.map((country) => country.code));

  console.log('  splitting work/places.tsv by country…');
  await splitByCountry(countryCodes);

  // pplx links: child (district) → parent (city).
  const pplxParent = new Map<number, number>();
  for await (const [parent, child, type] of readTsv(cachePath('hierarchy.zip'), 'hierarchy.txt')) {
    if (type === 'pplx') pplxParent.set(Number(child), Number(parent));
  }

  // cities500 points for nearest-parent lookup, per country.
  const cityPoints = new Map<string, CityPoint[]>();
  for (const country of readdirSync(dataPath('cities')).filter((name) => /^[A-Z]{2}$/.test(name))) {
    const points: CityPoint[] = [];
    for (const file of readdirSync(dataPath('cities', country))) {
      const band = readJson<{ rows: (string | number)[][] }>(dataPath('cities', country, file));
      for (const row of band.rows) points.push({ id: row[0] as number, lat: row[5] as number, lng: row[6] as number, admin1: row[7] as string, population: row[4] as number });
    }
    cityPoints.set(country, points);
  }

  rmSync(dataPath('localities'), { recursive: true, force: true });
  let totalRows = 0;
  let totalBytes = 0;
  let districts = 0;
  let linked = 0;
  const sizes: Record<string, number> = {};
  for (const file of readdirSync(SPLIT_DIR).sort(compareStrings)) {
    const country = basename(file, '.tsv');
    const rows: (string | number)[][] = [];
    const zones = new Map<string, number>();
    const points = cityPoints.get(country) ?? [];
    for await (const columns of readTsv(join(SPLIT_DIR, file))) {
      // extract.ts wrote: id, name, ascii, code, population, lat, lng, cc, a1, a2, a3, a4, tz
      const place = parsePlace([
        columns[0]!, columns[1]!, columns[2]!, '', columns[5]!, columns[6]!, 'P', columns[3]!, columns[7]!, '',
        columns[8]!, columns[9]!, columns[10]!, columns[11]!, columns[4]!, '', '', columns[12]!, '',
      ]);
      if (!place || !place.name) continue;
      let parentId = 0;
      if (place.featureCode === 'PPLX') {
        districts++;
        parentId = pplxParent.get(place.id) ?? 0;
        if (!parentId) {
          let best: CityPoint | null = null;
          let bestDistance = PARENT_RADIUS_KM;
          for (const point of points) {
            if (Math.abs(point.lat - place.lat) > 0.3 || (place.admin1 && point.admin1 !== place.admin1)) continue;
            const distance = distanceKm(place.lat, place.lng, point.lat, point.lng);
            // Prefer big cities: a district belongs to the city it is part of, not a nearby village.
            const weighted = distance / Math.log10(Math.max(point.population, 10));
            if (distance <= PARENT_RADIUS_KM && (!best || weighted < bestDistance / Math.log10(Math.max(best.population, 10)))) {
              best = point; bestDistance = distance;
            }
          }
          parentId = best?.id ?? 0;
        }
        if (parentId) linked++;
      }
      if (!zones.has(place.timezone)) zones.set(place.timezone, zones.size);
      rows.push([
        place.id, place.name, place.asciiName && place.asciiName !== place.name ? place.asciiName : 0, place.featureCode,
        place.population, roundCoordinate(place.lat), roundCoordinate(place.lng),
        place.admin1, place.admin2, place.admin3, place.admin4, zones.get(place.timezone)!, parentId,
      ]);
    }
    if (!rows.length) continue;
    // Stable output: sort by id, re-number zones alphabetically.
    rows.sort((a, b) => (a[0] as number) - (b[0] as number));
    const sortedZones = [...zones.keys()].sort(compareStrings);
    const remap = new Map([...zones.entries()].map(([zone, index]) => [index, sortedZones.indexOf(zone)]));
    for (const row of rows) row[11] = remap.get(row[11] as number)!;
    const bytes = writeGzipJson(dataPath('localities', `${country}.json.gz`), { tz: sortedZones, rows });
    sizes[country] = bytes;
    totalRows += rows.length;
    totalBytes += bytes;
  }
  writeJson(dataPath('reports', 'localities.json'), {
    rows: totalRows, districts, districtsWithParent: linked, gzipBytes: totalBytes,
    largestCountries: Object.entries(sizes).sort(([, a], [, b]) => b - a).slice(0, 10),
  });
  console.log(`  localities: ${totalRows} rows (${districts} districts, ${linked} linked to a city), ${(totalBytes / 1024 / 1024).toFixed(1)} MB gzip`);
}
