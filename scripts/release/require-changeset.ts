/**
 * For pull requests into dev: when the PR changes anything that ends up in a
 * published package, it must add a changeset (`npm run changeset`), so the
 * next release knows whether it is a patch, minor or major. A PR that already
 * ran `npm run release:version` (new version plus changelog entries) passes too.
 *
 *   BASE_REF=dev tsx scripts/release/require-changeset.ts
 *
 * Skipped when SKIP_CHANGESET=true (the workflow sets it for the
 * "no-changeset" label, e.g. for CI-only or README-only changes).
 */
import { execFileSync } from 'node:child_process';

import { fail } from './versions.js';

/** Paths whose changes reach users. */
const PUBLISHED_PATHS = [
  /^packages\/[^/]+\/src\//,
  /^packages\/[^/]+\/package\.json$/,
  /^packages\/[^/]+\/README\.md$/,
  /^data\//,
  /^overlays\//,
  /^scripts\/(build|emit|extract|generate)/,
  /^python\/src\//,
  /^python\/extras\/[^/]+\/src\//,
  /^python\/(extras\/[^/]+\/)?pyproject\.toml$/,
  /^NOTICE$/,
];

function main(): void {
  if (process.env.SKIP_CHANGESET === 'true') {
    console.log('Changeset check skipped (no-changeset label).');
    return;
  }
  const base = process.env.BASE_REF ?? 'dev';
  const files = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const published = files.filter((file) => PUBLISHED_PATHS.some((pattern) => pattern.test(file)));
  const changesets = files.filter((file) => /^\.changeset\/(?!README).+\.md$/.test(file));
  // A release PR has already turned its changesets into a new version and changelog entries.
  const versionBump = execFileSync('git', ['diff', `origin/${base}...HEAD`, '--', 'packages/geodata-kit/package.json'], { encoding: 'utf8' })
    .split('\n').some((line) => /^\+\s+"version":/.test(line));
  if (versionBump && files.some((file) => /^packages\/[^/]+\/CHANGELOG\.md$/.test(file))) {
    console.log('✔ Release PR: changesets already applied (version and changelogs updated)');
    return;
  }
  if (published.length && !changesets.length) {
    fail(`This PR changes published files but has no changeset:\n  ${published.slice(0, 10).join('\n  ')}${published.length > 10 ? `\n  … and ${published.length - 10} more` : ''}\nRun \`npm run changeset\`, choose patch / minor / major, commit the new .changeset/*.md file.\nFor changes users never see, add the "no-changeset" label instead.`);
  }
  console.log(published.length ? `✔ Changeset present (${changesets.join(', ')})` : '✔ No published files changed');
}

main();
