/**
 * Downloads every source into .cache/ (gitignored). Files already present are
 * kept, so a second run downloads nothing; pass --refresh to fetch everything
 * again (e.g. for a new GeoNames snapshot).
 *
 *   npm run download                 # all sources
 *   npm run download -- --refresh    # re-download
 *   npm run download -- --only cities500.zip,countryInfo.txt
 *
 * Writes .cache/download-manifest.json (url, size, sha256, date per file); the
 * generator copies it into data/meta.json.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { ADDRESS_DATA_BASE_URL, ADDRESS_DATA_INDEX_URL, ADDRESS_DATA_SOURCE, SOURCES } from './sources.js';
import { downloadFile, fetchJson, fileExists } from './lib/http.js';
import { CACHE_DIR, cachePath } from './lib/paths.js';

interface ManifestEntry {
  file: string;
  url: string;
  provider: string;
  licence: string;
  bytes: number;
  sha256: string;
  downloadedAt: string;
}

const MANIFEST_PATH = cachePath('download-manifest.json');

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function readManifest(): Record<string, ManifestEntry> {
  return existsSync(MANIFEST_PATH) ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, ManifestEntry>) : {};
}

async function downloadAddressData(refresh: boolean): Promise<ManifestEntry> {
  const directory = cachePath('address');
  mkdirSync(directory, { recursive: true });
  const indexPath = cachePath('address', '_index.json');
  if (refresh || !fileExists(indexPath)) {
    const index = await fetchJson<{ countries: string }>(ADDRESS_DATA_INDEX_URL);
    if (!index) throw new Error('Address data index not found');
    writeFileSync(indexPath, JSON.stringify(index));
  }
  const countries = (JSON.parse(readFileSync(indexPath, 'utf8')) as { countries: string }).countries.split('~');
  let fetched = 0;
  for (const country of countries) {
    const path = cachePath('address', `${country}.json`);
    if (!refresh && fileExists(path)) continue;
    const document = await fetchJson<Record<string, string>>(`${ADDRESS_DATA_BASE_URL}/${country}`);
    writeFileSync(path, JSON.stringify(document ?? {}));
    fetched++;
    await new Promise((done) => setTimeout(done, 100)); // be polite
  }
  console.log(`  address data: ${countries.length} countries (${fetched} fetched)`);
  return {
    file: 'address/',
    url: ADDRESS_DATA_BASE_URL,
    ...ADDRESS_DATA_SOURCE,
    bytes: countries.reduce((total, country) => total + statSync(cachePath('address', `${country}.json`)).size, 0),
    sha256: createHash('sha256')
      .update(countries.map((country) => readFileSync(cachePath('address', `${country}.json`), 'utf8')).join('\n'))
      .digest('hex'),
    downloadedAt: new Date().toISOString().slice(0, 10),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? '').split(',')) : null;

  mkdirSync(CACHE_DIR, { recursive: true });
  const manifest = readManifest();

  for (const source of SOURCES) {
    if (only && !only.has(source.file)) continue;
    const target = cachePath(source.file);
    if (refresh || !fileExists(target)) {
      console.log(`Downloading ${source.url}`);
      await downloadFile(source.url, target);
      delete manifest[source.file];
    } else {
      console.log(`Cached      ${source.file}`);
    }
    if (source.extractTo) {
      const directory = cachePath(source.extractTo);
      if (refresh || !existsSync(directory)) {
        rmSync(directory, { recursive: true, force: true });
        mkdirSync(directory, { recursive: true });
        execFileSync('tar', ['-xzf', target, '-C', directory]);
      }
    }
    if (!manifest[source.file]) {
      manifest[source.file] = {
        file: source.file,
        url: source.url,
        provider: source.provider,
        licence: source.licence,
        bytes: statSync(target).size,
        sha256: await sha256(target),
        downloadedAt: new Date().toISOString().slice(0, 10),
      };
    }
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (!only || only.has('address')) {
    if (refresh || !manifest['address/']) manifest['address/'] = await downloadAddressData(refresh);
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Done. Manifest: ${MANIFEST_PATH}`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
