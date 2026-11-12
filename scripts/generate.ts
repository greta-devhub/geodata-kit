/**
 * Builds every file under data/ from the sources in .cache/ (run `npm run
 * download` and `npm run extract` first). Output is deterministic: running it
 * twice gives byte-identical files.
 *
 *   npm run generate                          # all steps
 *   npm run generate -- countries languages   # only these steps (in pipeline order)
 */
import { buildAddress } from './build/address.js';
import { buildAirports } from './build/airports.js';
import { buildAliases } from './build/aliases.js';
import { buildCities } from './build/cities.js';
import { buildCountries } from './build/countries.js';
import { buildGroups } from './build/groups.js';
import { buildLanguages } from './build/languages.js';
import { buildLocalities } from './build/localities.js';
import { writeMeta } from './build/meta.js';
import { buildShapes } from './build/shapes.js';
import { buildPhone } from './build/phone.js';
import { buildPostal } from './build/postal.js';
import { buildSubdivisions } from './build/subdivisions.js';
import { buildTz } from './build/tz.js';

type Step = { name: string; run: () => Promise<unknown> };

const STEPS: Step[] = [
  { name: 'countries', run: buildCountries },
  { name: 'languages', run: buildLanguages },
  { name: 'aliases', run: buildAliases },
  { name: 'groups', run: buildGroups },
  { name: 'subdivisions', run: buildSubdivisions },
  { name: 'cities', run: buildCities },
  { name: 'localities', run: buildLocalities },
  { name: 'airports', run: buildAirports },
  { name: 'shapes', run: buildShapes },
  { name: 'address', run: buildAddress },
  { name: 'postal', run: buildPostal },
  { name: 'phone', run: buildPhone },
  { name: 'tz', run: buildTz },
  { name: 'meta', run: writeMeta },
];

async function main(): Promise<void> {
  const requested = new Set(process.argv.slice(2));
  for (const step of STEPS) {
    if (requested.size && !requested.has(step.name)) continue;
    const started = Date.now();
    console.log(`▶ ${step.name}`);
    await step.run();
    console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
