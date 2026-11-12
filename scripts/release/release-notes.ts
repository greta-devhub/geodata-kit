/** Prints the release notes of the current version: the changelog sections of all packages. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';
import { NPM_PACKAGES, releaseVersion } from './versions.js';

const version = releaseVersion();
const sections: string[] = [];
for (const name of NPM_PACKAGES) {
  const changelog = join(ROOT, 'packages', name, 'CHANGELOG.md');
  if (!existsSync(changelog)) continue;
  const text = readFileSync(changelog, 'utf8');
  const start = text.indexOf(`## ${version}`);
  if (start < 0) continue;
  const rest = text.slice(start + `## ${version}`.length);
  const end = rest.search(/\n## \d/);
  // Drop entries that only say a fixed-group dependency moved along.
  const body = (end >= 0 ? rest.slice(0, end) : rest)
    .split('\n')
    .filter((line) => !/^\s*-\s+(Updated dependencies|[a-z-]+@\d)/.test(line))
    .join('\n')
    .replace(/### (Major|Minor|Patch) Changes\s*(?=###|$)/g, '')
    .trim();
  if (body) sections.push(`### ${name}\n\n${body}`);
}
console.log(sections.length ? sections.join('\n\n') : 'First release of geodata-kit, geodata-kit-localities, geodata-kit-postal and geodata-kit-tz (npm) and geodata-kit-py, geodata-kit-localities, geodata-kit-postal (PyPI).');
console.log(`\nnpm: https://www.npmjs.com/package/geodata-kit/v/${version}\nPyPI: https://pypi.org/project/geodata-kit-py/${version}/`);
