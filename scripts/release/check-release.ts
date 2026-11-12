/**
 * Release-readiness check for pull requests into main. Passes when:
 *   - every package (npm and Python) has the same version;
 *   - no changeset is left unapplied (`npm run release:version` was run);
 *   - the version is not released yet: newer than npm, or already on npm but
 *     without its git tag vX.Y.Z (a release that is being finished, such as the
 *     first one, whose npm packages are published by hand);
 *   - the changelog has an entry for it (not needed for the very first release).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';
import { compareVersions, fail, NPM_PACKAGES, publishedVersion, releaseVersion } from './versions.js';

/** Release tags on GitHub (works in shallow CI checkouts), falling back to local tags. */
function releaseTags(): string[] {
  try {
    return execFileSync('git', ['ls-remote', '--tags', 'origin', 'refs/tags/v*'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map((line) => line.split('refs/tags/')[1]?.replace(/\^\{\}$/, '')).filter((tag): tag is string => Boolean(tag));
  } catch {
    return execFileSync('git', ['tag', '-l', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  }
}

function main(): void {
  const version = releaseVersion();
  const problems: string[] = [];
  const tags = new Set(releaseTags());

  const pending = readdirSync(join(ROOT, '.changeset')).filter((file) => file.endsWith('.md') && file !== 'README.md');
  if (pending.length) {
    problems.push(`${pending.length} changeset(s) not applied yet (${pending.join(', ')}). Run \`npm run release:version\` on dev and commit the result.`);
  }

  if (tags.has(`v${version}`)) {
    problems.push(`Version ${version} is already released (tag v${version} exists). Add changesets and run \`npm run release:version\`.`);
  }
  const latest = NPM_PACKAGES.map((name) => publishedVersion(name))
    .filter((value): value is string => value !== null && !value.endsWith('-stage'))
    .sort(compareVersions).pop() ?? null;
  if (latest && compareVersions(version, latest) < 0) {
    problems.push(`Version ${version} is older than the published ${latest}.`);
  }

  const firstRelease = tags.size === 0;
  const changelog = join(ROOT, 'packages', 'geodata-kit', 'CHANGELOG.md');
  if (!firstRelease && (!existsSync(changelog) || !readFileSync(changelog, 'utf8').includes(`## ${version}`))) {
    problems.push(`packages/geodata-kit/CHANGELOG.md has no "## ${version}" entry. Run \`npm run release:version\`.`);
  }

  if (problems.length) fail(`Not ready to release ${version}:\n  ${problems.join('\n  ')}`);
  const state = latest && compareVersions(version, latest) === 0 ? 'already on npm; tag and GitHub release still to do' : 'new version';
  console.log(`✔ Ready to release ${version} (${state}${firstRelease ? ', first release' : ''})`);
}

main();
