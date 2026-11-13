/**
 * What an app's bundler keeps when it imports one function from the core.
 *
 * The core is one file with ~960 KB of data. It stays usable in browsers only
 * because nothing runs at load time (lookup tables are built on first use) and
 * the data is imported in sections, so a bundler drops what the imported
 * functions do not reach. A top-level `new Map(...)`, or a call that wires
 * modules together, silently puts everything back into every bundle: this
 * test fails when that happens.
 */
import { join } from 'node:path';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const CORE = join(__dirname, '..', 'packages', 'geodata-kit', 'src', 'index.ts');
const KB = 1024;

/** Minified size in bytes of an app that imports just `names` from the core. */
async function bundledSize(names: string[]): Promise<number> {
  const result = await build({
    stdin: { contents: `import { ${names.join(', ')} } from ${JSON.stringify(CORE)}; console.log(${names.join(', ')});`, resolveDir: __dirname, loader: 'ts' },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0]!.contents.byteLength;
}

// [imported functions, budget in KB, what the bundle may contain]
const CASES: [string[], number, string][] = [
  [['fold', 'cleanText', 'editDistance'], 3, 'no data'],
  [['getFlagEmoji'], 1, 'no data'],
  [['isCountryCode', 'normalizeCountryCode', 'getCountry'], 180, 'country records'],
  [['getCountryTimezones', 'getPrimaryTimezone', 'isTimezone'], 200, 'country records, timezones'],
  [['getCountryName', 'formatCountry'], 215, 'country records, names'],
  [['isInGroup', 'getCountriesInGroup'], 205, 'country records, groups'],
  [['getNationalLanguages', 'getPrimaryLanguage'], 290, 'country records, languages per country'],
  [['resolveCountry'], 490, 'country records, alias table'],
];

describe('tree shaking of the core', () => {
  for (const [names, budget, contents] of CASES) {
    it(`${names.join(' + ')} stays under ${budget} KB (${contents})`, async () => {
      expect(await bundledSize(names)).toBeLessThan(budget * KB);
    });
  }
});
