/**
 * geodata-kit-airports — 10.5k airports with an IATA or ICAO code,
 * each with the city it serves. Loads once, on first use.
 */
import { dataDate } from '../../../data/meta.json';
import { cleanText, fold, normalizeCountryCode } from 'geodata-kit';

import { loadAirports } from './loaders.generated.js';

export interface Airport {
  geonameId: number;
  name: string;
  /** The airport's main IATA code. */
  iata: string | null;
  /** Other IATA codes it is known by: EuroAirport (EAP) is also BSL and MLH. getAirportByIata finds it by any. */
  alternateIata: string[];
  icao: string | null;
  country: string;
  /** Level-1 subdivision code (see geodata-kit-subdivisions). */
  subdivision1: string;
  lat: number;
  lng: number;
  timezone: string;
  /** Place id of the nearest sizeable city (getCity in geodata-kit-cities), if any within 60 km. */
  cityId: number | null;
}

type Row = [number, string, string | 0, string | 0, string, string, number, number, number, number | 0, string | 0];

let loaded: Promise<{ all: Airport[]; byIata: Map<string, Airport>; byIcao: Map<string, Airport> }> | null = null;
function data(): Promise<{ all: Airport[]; byIata: Map<string, Airport>; byIcao: Map<string, Airport> }> {
  loaded ??= loadAirports().then((module) => {
    const file = module.default as { tz: string[]; rows: Row[] };
    const all = file.rows.map((row): Airport => ({
      geonameId: row[0], name: row[1], iata: row[2] || null, alternateIata: row[10] ? row[10].split(' ') : [], icao: row[3] || null, country: row[4], subdivision1: row[5],
      lat: row[6], lng: row[7], timezone: file.tz[row[8]]!, cityId: row[9] || null,
    }));
    const byIata = new Map<string, Airport>();
    const byIcao = new Map<string, Airport>();
    for (const airport of all) {
      if (airport.iata && !byIata.has(airport.iata)) byIata.set(airport.iata, airport);
      if (airport.icao && !byIcao.has(airport.icao)) byIcao.set(airport.icao, airport);
    }
    // Alternate codes after every main code, so they never take one.
    for (const airport of all) for (const code of airport.alternateIata) if (!byIata.has(code)) byIata.set(code, airport);
    return { all, byIata, byIcao };
  });
  return loaded;
}

/** Airport by IATA code, its main or an alternate one: "FRA" → Frankfurt am Main Airport, "BSL" → EuroAirport (EAP). */
export async function getAirportByIata(code: string): Promise<Airport | null> {
  return (await data()).byIata.get(code.trim().toUpperCase()) ?? null;
}

/** Airport by ICAO code: "EDDF" → Frankfurt am Main Airport. */
export async function getAirportByIcao(code: string): Promise<Airport | null> {
  return (await data()).byIcao.get(code.trim().toUpperCase()) ?? null;
}

/** Airports of a country, by name. */
export async function listAirports(country: string): Promise<Airport[]> {
  const code = normalizeCountryCode(country);
  if (!code) return [];
  return (await data()).all.filter((airport) => airport.country === code).sort((a, b) => a.name.localeCompare(b.name));
}

/** Search by code or name ("zur", "Heathrow"); codes match exactly first. */
export async function searchAirports(query: string, options: { country?: string; limit?: number } = {}): Promise<Airport[]> {
  const cleaned = cleanText(query);
  if (!cleaned) return [];
  const upper = cleaned.toUpperCase();
  const key = fold(cleaned);
  const country = options.country ? normalizeCountryCode(options.country) : null;
  const scored: { airport: Airport; score: number }[] = [];
  for (const airport of (await data()).all) {
    if (country && airport.country !== country) continue;
    const name = fold(airport.name);
    let score: number | null = null;
    if (airport.iata === upper || airport.icao === upper || airport.alternateIata.includes(upper)) score = 0;
    else if (name.startsWith(key)) score = 1;
    else if (name.split(' ').some((word) => word.startsWith(key))) score = 2;
    if (score !== null) scored.push({ airport, score });
  }
  // Airports with an IATA code are the ones people mean; rank them first on ties.
  scored.sort((a, b) => a.score - b.score || Number(!a.airport.iata) - Number(!b.airport.iata) || a.airport.name.localeCompare(b.airport.name));
  return scored.slice(0, options.limit ?? 10).map((entry) => entry.airport);
}

/**
 * Date of the data in this version, as YYYY-MM-DD. The data is refreshed about
 * once a month; every package of one version carries the same date.
 */
export const DATA_DATE: string = dataDate;
