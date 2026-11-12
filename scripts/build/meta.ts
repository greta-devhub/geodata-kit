/**
 * data/meta.json: which source files (URL, licence, size, sha256, download
 * date) the generated data was built from. The download date is the GeoNames
 * snapshot date, since GeoNames keeps no old dumps.
 */
import { existsSync } from 'node:fs';

import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';

interface ManifestEntry {
  file: string;
  url: string;
  provider: string;
  licence: string;
  bytes: number;
  sha256: string;
  downloadedAt: string;
}

export async function writeMeta(): Promise<void> {
  const manifestPath = cachePath('download-manifest.json');
  if (!existsSync(manifestPath)) throw new Error('Run `npm run download` first');
  const manifest = readJson<Record<string, ManifestEntry>>(manifestPath);
  const sources = Object.values(manifest).sort((a, b) => compareStrings(a.file, b.file));
  const wikidata = ['countryFacts', 'countryLanguages', 'euMembership', 'subdivisionLanguages', 'subdivisions'].map((name) => {
    const snapshot = readJson<{ retrieved: string; rows: unknown[] }>(`${dataPath('..', 'overlays', 'wikidata', `${name}.json`)}`);
    return { query: name, retrieved: snapshot.retrieved, rows: snapshot.rows.length };
  });
  const geonamesDate = sources.find((source) => source.file === 'countryInfo.txt')?.downloadedAt ?? null;
  writeJson(dataPath('meta.json'), { geonamesSnapshot: geonamesDate, sources, wikidata }, 'lines');
}
