/**
 * One streaming pass over the two big GeoNames files, writing only what the
 * generator needs into .cache/work/ (gitignored):
 *
 *   places.tsv      populated places NOT in cities500 (localities) + PPLX neighbourhoods
 *   admin.tsv       ADM1–ADM4 rows (names of subdivisions on every level)
 *   airports.tsv    AIRP rows (codes come from the alternate names)
 *   continents.tsv  CONT rows
 *   altnames.tsv    alternate names for countries, ADM1/ADM2, cities500, airports, continents
 *
 *   npm run extract            # skips outputs that already exist
 *   npm run extract -- --force
 */
import { createWriteStream, existsSync, readFileSync, type WriteStream } from 'node:fs';

import { COL, PLACE_CODES } from './lib/geonames.js';
import { ensureDir, readTsv } from './lib/io.js';
import { cachePath } from './lib/paths.js';

const WORK = cachePath('work');
const work = (file: string): string => cachePath('work', file);

/** Pseudo-languages in alternateNamesV2 that we keep as identifiers. */
const KEPT_CODE_LANGUAGES = new Set(['iata', 'icao', 'unlc', 'wkdt', 'abbr']);
/** Pseudo-languages that are never names. */
const DROPPED_LANGUAGES = new Set(['link', 'post', 'faac', 'fr_1793', 'phon', 'piny', 'tcid', 'uicn', 'lauc', 'nuts']);

function open(file: string): WriteStream {
  return createWriteStream(work(file), { encoding: 'utf8' });
}

async function write(stream: WriteStream, line: string): Promise<void> {
  if (!stream.write(`${line}\n`)) await new Promise<void>((done) => stream.once('drain', () => done()));
}

async function close(stream: WriteStream): Promise<void> {
  await new Promise<void>((done) => stream.end(done));
}

async function readIdSet(zip: string, entry: string): Promise<Set<number>> {
  const ids = new Set<number>();
  for await (const columns of readTsv(cachePath(zip), entry)) ids.add(Number(columns[COL.geonameId]));
  return ids;
}

async function extractAllCountries(cities500: Set<number>): Promise<Set<number>> {
  const places = open('places.tsv');
  const admin = open('admin.tsv');
  const airports = open('airports.tsv');
  const continents = open('continents.tsv');
  const keepAltNamesFor = new Set<number>();
  let rows = 0;

  for await (const c of readTsv(cachePath('allCountries.zip'), 'allCountries.txt')) {
    rows++;
    if (rows % 2_000_000 === 0) console.log(`  allCountries: ${(rows / 1e6).toFixed(0)}M rows`);
    const featureClass = c[COL.featureClass];
    const code = c[COL.featureCode]!;
    const id = Number(c[COL.geonameId]);
    const compact = [
      c[COL.geonameId], c[COL.name], c[COL.asciiName], code, c[COL.population], c[COL.latitude], c[COL.longitude],
      c[COL.countryCode], c[COL.admin1], c[COL.admin2], c[COL.admin3], c[COL.admin4], c[COL.timezone],
    ].join('\t');

    if (featureClass === 'P') {
      if ((PLACE_CODES.has(code) || code === 'PPLX') && !cities500.has(id) && c[COL.countryCode] && c[COL.timezone]) {
        await write(places, compact);
      }
    } else if (featureClass === 'A' && (code === 'ADM1' || code === 'ADM2' || code === 'ADM3' || code === 'ADM4')) {
      await write(admin, compact);
      if (code === 'ADM1' || code === 'ADM2') keepAltNamesFor.add(id);
    } else if (featureClass === 'S' && code === 'AIRP') {
      await write(airports, compact);
      keepAltNamesFor.add(id);
    } else if (featureClass === 'L' && code === 'CONT') {
      await write(continents, compact);
      keepAltNamesFor.add(id);
    }
  }
  await Promise.all([close(places), close(admin), close(airports), close(continents)]);
  console.log(`  allCountries: ${rows} rows read`);
  return keepAltNamesFor;
}

async function extractAlternateNames(ids: Set<number>): Promise<void> {
  const output = open('altnames.tsv');
  let kept = 0;
  for await (const c of readTsv(cachePath('alternateNamesV2.zip'), 'alternateNamesV2.txt')) {
    const id = Number(c[1]);
    if (!ids.has(id)) continue;
    const language = c[2] ?? '';
    if (DROPPED_LANGUAGES.has(language)) continue;
    if (language.length > 3 && !KEPT_CODE_LANGUAGES.has(language) && !language.includes('-')) continue;
    // geonameid, language, name, preferred, short, colloquial, historic
    await write(output, [c[1], language, c[3], c[4] ?? '', c[5] ?? '', c[6] ?? '', c[7] ?? ''].join('\t'));
    kept++;
  }
  await close(output);
  console.log(`  alternate names kept: ${kept}`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  ensureDir(WORK);

  console.log('Reading cities500 ids…');
  const cities500 = await readIdSet('cities500.zip', 'cities500.txt');

  let altNameIds: Set<number>;
  const idsFile = work('altname-ids.json');
  if (force || !existsSync(work('places.tsv')) || !existsSync(idsFile)) {
    console.log('Streaming allCountries.zip (1.8 GB unzipped)…');
    altNameIds = await extractAllCountries(cities500);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(idsFile, JSON.stringify([...altNameIds]));
  } else {
    console.log('work/places.tsv exists, skipping allCountries');
    altNameIds = new Set(JSON.parse(readFileSync(idsFile, 'utf8')) as number[]);
  }

  if (force || !existsSync(work('altnames.tsv'))) {
    for (const id of cities500) altNameIds.add(id);
    for (const line of readFileSync(cachePath('countryInfo.txt'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const geonameId = Number(line.split('\t')[16]);
      if (geonameId) altNameIds.add(geonameId);
    }
    console.log(`Streaming alternateNamesV2.zip for ${altNameIds.size} places…`);
    await extractAlternateNames(altNameIds);
  } else {
    console.log('work/altnames.tsv exists, skipping alternate names');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
