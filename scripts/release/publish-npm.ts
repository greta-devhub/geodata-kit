/**
 * Publishes every npm package whose current version is not on npm yet, with
 * provenance. Safe to re-run: published versions are skipped. Writes
 * `published=true|false` and `version=x.y.z` to $GITHUB_OUTPUT.
 *
 * Authentication: npm trusted publishing (OIDC) in GitHub Actions. The very
 * first publish of each package is done once from a maintainer's machine
 * (`npm login`, then this script; npm asks for the 2FA code), because npm can
 * only set up trusted publishing for packages that already exist.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';
import { isPublished, NPM_PACKAGES, releaseVersion } from './versions.js';

/** npm 11.15+ is needed for staged and trusted publishing; use it through npx when the local npm is older. */
function npmCommand(): [string, string[]] {
  const major = Number(execFileSync('npm', ['--version'], { encoding: 'utf8' }).split('.')[0]);
  return major >= 11 ? ['npm', []] : ['npx', ['--yes', 'npm@^11.15.0']];
}

function main(): void {
  const version = releaseVersion();
  const [command, prefix] = npmCommand();
  const dryRun = process.argv.includes('--dry-run');
  let published = false;
  for (const name of NPM_PACKAGES) {
    if (isPublished(name, version)) {
      console.log(`• ${name}@${version} already on npm, skipped`);
      continue;
    }
    console.log(`▶ publishing ${name}@${version}${dryRun ? ' (dry run)' : ''}`);
    // Provenance needs the CI identity (OIDC); a local first publish goes without it.
    const provenance = process.env.GITHUB_ACTIONS === 'true' ? ['--provenance'] : [];
    const args = ['publish', '--access', 'public', ...(dryRun ? ['--dry-run'] : provenance)];
    execFileSync(command, [...prefix, ...args], { cwd: join(ROOT, 'packages', name), stdio: 'inherit' });
    published = !dryRun;
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `published=${published}\nversion=${version}\n`);
}

main();
