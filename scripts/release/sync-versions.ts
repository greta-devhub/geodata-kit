/**
 * Copies the npm release version (set by `changeset version`) into the Python
 * packages, so PyPI and npm always publish the same version.
 *
 *   tsx scripts/release/sync-versions.ts           # write
 *   tsx scripts/release/sync-versions.ts --check   # CI: fail when anything differs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';
import { fail, NPM_PACKAGES, readPackageVersion, releaseVersion } from './versions.js';

interface Target { path: string; pattern: RegExp; replace: (version: string) => string; label: string }

const TARGETS: Target[] = [
  { label: 'python/pyproject.toml version', path: 'python/pyproject.toml', pattern: /^version = "[^"]+"$/m, replace: (v) => `version = "${v}"` },
  { label: 'python extra pin geodata-kit-localities', path: 'python/pyproject.toml', pattern: /"geodata-kit-localities==[^"]+"/, replace: (v) => `"geodata-kit-localities==${v}"` },
  { label: 'python extra pin geodata-kit-postal', path: 'python/pyproject.toml', pattern: /"geodata-kit-postal==[^"]+"/, replace: (v) => `"geodata-kit-postal==${v}"` },
  { label: 'python __version__', path: 'python/src/geodata_kit/__init__.py', pattern: /^__version__ = "[^"]+"$/m, replace: (v) => `__version__ = "${v}"` },
  { label: 'geodata-kit-localities (PyPI) version', path: 'python/extras/geodata_kit_localities/pyproject.toml', pattern: /^version = "[^"]+"$/m, replace: (v) => `version = "${v}"` },
  { label: 'geodata-kit-postal (PyPI) version', path: 'python/extras/geodata_kit_postal/pyproject.toml', pattern: /^version = "[^"]+"$/m, replace: (v) => `version = "${v}"` },
];

function main(): void {
  const check = process.argv.includes('--check');
  const version = releaseVersion();
  const problems: string[] = [];

  for (const name of NPM_PACKAGES) {
    const own = readPackageVersion(name);
    if (own !== version) problems.push(`${name} is ${own}, geodata-kit is ${version} (they are released together)`);
  }

  for (const target of TARGETS) {
    const path = join(ROOT, target.path);
    const text = readFileSync(path, 'utf8');
    const match = target.pattern.exec(text);
    if (!match) { problems.push(`${target.label}: pattern not found in ${target.path}`); continue; }
    const wanted = target.replace(version);
    if (match[0] === wanted) continue;
    if (check) problems.push(`${target.label} is ${match[0]}, expected ${wanted}`);
    else writeFileSync(path, text.replace(target.pattern, wanted));
  }

  if (problems.length) fail(`Versions out of sync:\n  ${problems.join('\n  ')}\nRun \`npm run release:version\` (or \`tsx scripts/release/sync-versions.ts\`).`);
  console.log(`✔ All packages at ${version}${check ? '' : ' (Python files updated)'}`);
}

main();
