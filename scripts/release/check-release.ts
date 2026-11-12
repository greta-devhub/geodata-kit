/**
 * Release-readiness check for pull requests into main (and again before
 * publishing). Passes when:
 *   - every package (npm and Python) has the same version;
 *   - no changeset is left unapplied (`npm run release:version` was run);
 *   - the version is newer than the one on npm;
 *   - the changelog has an entry for it (not needed for the very first release).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';
import { compareVersions, fail, NPM_PACKAGES, publishedVersion, releaseVersion } from './versions.js';

function main(): void {
  const version = releaseVersion();
  const problems: string[] = [];

  const pending = readdirSync(join(ROOT, '.changeset')).filter((file) => file.endsWith('.md') && file !== 'README.md');
  if (pending.length) {
    problems.push(`${pending.length} changeset(s) not applied yet (${pending.join(', ')}). Run \`npm run release:version\` on dev and commit the result.`);
  }

  const published = NPM_PACKAGES.map((name) => [name, publishedVersion(name)] as const);
  const latest = published.map(([, value]) => value).filter((value): value is string => value !== null).sort(compareVersions).pop() ?? null;
  if (latest && compareVersions(version, latest) <= 0) {
    problems.push(`Version ${version} is not newer than the published ${latest}. Add changesets and run \`npm run release:version\`.`);
  }

  const changelog = join(ROOT, 'packages', 'geodata-kit', 'CHANGELOG.md');
  const firstRelease = latest === null;
  if (!firstRelease && (!existsSync(changelog) || !readFileSync(changelog, 'utf8').includes(`## ${version}`))) {
    problems.push(`packages/geodata-kit/CHANGELOG.md has no "## ${version}" entry. Run \`npm run release:version\`.`);
  }

  if (problems.length) fail(`Not ready to release ${version}:\n  ${problems.join('\n  ')}`);
  console.log(`✔ Ready to release ${version}${latest ? ` (published: ${latest})` : ' (first release)'}`);
}

main();
