/**
 * Airports: data/airports.json — GeoNames AIRP features with an IATA or ICAO
 * code (codes come from alternateNamesV2), with the nearest cities500 city
 * (within 60 km, same country) as the city served.
 *
 *   { tz: string[], rows: [geonameid, name, iata|0, icao|0, country, admin1, lat, lng, tzIndex, cityId|0][] }
 */
import { readdirSync } from 'node:fs';

import { compareStrings, readJson, readTsv, roundCoordinate, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';

const CITY_RADIUS_KM = 60;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * toRad) / 2) ** 2
    + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(((bLng - aLng) * toRad) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function buildAirports(): Promise<void> {
  const airports = new Map<number, { id: number; name: string; country: string; admin1: string; lat: number; lng: number; tz: string; iata: string | null; icao: string | null }>();
  for await (const c of readTsv(cachePath('work', 'airports.tsv'))) {
    // id, name, ascii, code, population, lat, lng, cc, a1, a2, a3, a4, tz
    if (!c[7] || !c[12]) continue;
    airports.set(Number(c[0]), { id: Number(c[0]), name: c[1]!, country: c[7]!, admin1: c[8] === '00' ? '' : c[8]!, lat: Number(c[5]), lng: Number(c[6]), tz: c[12]!, iata: null, icao: null });
  }
  for await (const [id, language, name, preferred] of readTsv(cachePath('work', 'altnames.tsv'))) {
    if (language !== 'iata' && language !== 'icao') continue;
    const airport = airports.get(Number(id));
    if (!airport) continue;
    const code = name!.trim().toUpperCase();
    if (language === 'iata' && /^[A-Z0-9]{3}$/.test(code) && (!airport.iata || preferred === '1')) airport.iata = code;
    if (language === 'icao' && /^[A-Z0-9]{4}$/.test(code) && (!airport.icao || preferred === '1')) airport.icao = code;
  }

  // Nearest big-enough city.
  const cityPoints = new Map<string, { id: number; lat: number; lng: number; population: number }[]>();
  for (const country of readdirSync(dataPath('cities')).filter((name) => /^[A-Z]{2}$/.test(name))) {
    const points: { id: number; lat: number; lng: number; population: number }[] = [];
    for (const file of readdirSync(dataPath('cities', country))) {
      for (const row of readJson<{ rows: (string | number)[][] }>(dataPath('cities', country, file)).rows) {
        points.push({ id: row[0] as number, lat: row[5] as number, lng: row[6] as number, population: row[4] as number });
      }
    }
    cityPoints.set(country, points);
  }

  const withCode = [...airports.values()].filter((airport) => airport.iata || airport.icao).sort((a, b) => a.id - b.id);
  const zones = [...new Set(withCode.map((airport) => airport.tz))].sort(compareStrings);
  const zoneIndex = new Map(zones.map((zone, index) => [zone, index]));
  const rows = withCode.map((airport) => {
    let best: { id: number; score: number } | null = null;
    for (const point of cityPoints.get(airport.country) ?? []) {
      if (Math.abs(point.lat - airport.lat) > 0.6) continue;
      const distance = distanceKm(airport.lat, airport.lng, point.lat, point.lng);
      if (distance > CITY_RADIUS_KM) continue;
      // distance / population^0.7: Munich 28 km away beats Hallbergmoos next to the runway.
      const score = Math.max(distance, 1) / Math.max(point.population, 100) ** 0.7;
      if (!best || score < best.score) best = { id: point.id, score };
    }
    return [airport.id, airport.name, airport.iata ?? 0, airport.icao ?? 0, airport.country, airport.admin1,
      roundCoordinate(airport.lat), roundCoordinate(airport.lng), zoneIndex.get(airport.tz)!, best?.id ?? 0];
  });
  writeJson(dataPath('airports.json'), { tz: zones, rows }, 'compact');
  console.log(`  airports: ${rows.length} (IATA ${withCode.filter((a) => a.iata).length}, ICAO ${withCode.filter((a) => a.icao).length})`);
}
