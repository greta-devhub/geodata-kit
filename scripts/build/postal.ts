/**
 * Postal codes for the optional geodata-kit-postal package, from the GeoNames
 * postal-code dump (export/zip/allCountries.zip, CC BY 4.0; the separate
 * GB_full file with Royal Mail data is not used, so GB, CA and NL have the
 * first part of the code only).
 *
 *   data/postal/{CC}.json.gz   { rows: [code, place, admin1Name, admin1Code, admin2Name, admin3Name, lat, lng][] }
 */
import { rmSync } from 'node:fs';

import { compareStrings, readJson, readTsv, roundCoordinate, writeGzipJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';
import type { CountryRecord } from './countries.js';

export async function buildPostal(): Promise<void> {
  const countryCodes = new Set(readJson<CountryRecord[]>(dataPath('core', 'countries.json')).map((country) => country.code));
  const byCountry = new Map<string, (string | number)[][]>();
  for await (const c of readTsv(cachePath('postal-allCountries.zip'), 'allCountries.txt')) {
    // country, postal code, place, admin1 name, admin1 code, admin2 name, admin2 code, admin3 name, admin3 code, lat, lng, accuracy
    const country = c[0]!;
    if (!countryCodes.has(country) || !c[1] || !c[2]) continue;
    const row = [c[1]!.trim().toUpperCase(), c[2]!.trim(), c[3]!.trim(), c[4]!.trim(), c[5]!.trim(), c[7]!.trim(), roundCoordinate(Number(c[9])), roundCoordinate(Number(c[10]))];
    const list = byCountry.get(country);
    if (list) list.push(row); else byCountry.set(country, [row]);
  }
  rmSync(dataPath('postal'), { recursive: true, force: true });
  let rows = 0;
  let bytes = 0;
  for (const [country, list] of [...byCountry.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    list.sort((a, b) => compareStrings(String(a[0]), String(b[0])) || compareStrings(String(a[1]), String(b[1])));
    bytes += writeGzipJson(dataPath('postal', `${country}.json.gz`), { rows: list });
    rows += list.length;
  }
  writeJson(dataPath('reports', 'postal.json'), { countries: byCountry.size, rows, gzipBytes: bytes });
  console.log(`  postal: ${rows} codes in ${byCountry.size} countries, ${(bytes / 1024 / 1024).toFixed(1)} MB gzip`);
}
