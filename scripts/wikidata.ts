/**
 * Refreshes the Wikidata snapshot in overlays/wikidata/*.json (CC0). The query
 * service is sometimes slow or down, so results are committed and the
 * generator never queries Wikidata itself.
 *
 *   npm run wikidata            # all queries
 *   npm run wikidata -- subdivisions countryLanguages
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { WIKIDATA_SPARQL_URL } from './sources.js';
import { fetchJson } from './lib/http.js';
import { overlayPath, ROOT } from './lib/paths.js';

interface SparqlResponse {
  head: { vars: string[] };
  results: { bindings: Record<string, { type: string; value: string; 'xml:lang'?: string }>[] };
}

const QUERY_DIR = join(ROOT, 'scripts', 'sparql');

/** Strips the entity prefix so ids are stored as plain "Q183". */
function simplify(value: string): string {
  return value.replace('http://www.wikidata.org/entity/', '');
}

async function runQuery(name: string): Promise<void> {
  const query = readFileSync(join(QUERY_DIR, `${name}.rq`), 'utf8');
  const started = Date.now();
  const response = await fetchJson<SparqlResponse>(WIKIDATA_SPARQL_URL, {
    method: 'POST',
    headers: { accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }).toString(),
  }, 8);
  if (!response) throw new Error(`Query ${name} returned 404`);

  const rows = response.results.bindings.map((binding) => {
    const row: Record<string, string> = {};
    for (const variable of response.head.vars) {
      const cell = binding[variable];
      if (cell) row[variable] = simplify(cell.value);
    }
    return row;
  });
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  const output = {
    source: 'Wikidata (wikidata.org), CC0 1.0',
    query: `scripts/sparql/${name}.rq`,
    retrieved: new Date().toISOString().slice(0, 10),
    rows,
  };
  writeFileSync(overlayPath('wikidata', `${name}.json`), `${JSON.stringify(output, null, 1)}\n`);
  console.log(`${name}: ${rows.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const all = readdirSync(QUERY_DIR).filter((file) => file.endsWith('.rq')).map((file) => basename(file, '.rq')).sort();
  for (const name of requested.length ? requested : all) {
    await runQuery(name);
    await new Promise((done) => setTimeout(done, 2000)); // stay well under the per-minute budget
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
