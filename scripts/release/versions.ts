/** Shared helpers for the release scripts: package list, versions, semver compare. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../lib/paths.js';

/** Every published npm package, in dependency order (a package comes after the ones it depends on). */
export const NPM_PACKAGES = [
  'geodata-kit',
  'geodata-kit-subdivisions',
  'geodata-kit-cities',
  'geodata-kit-airports',
  'geodata-kit-shapes',
  'geodata-kit-address',
  'geodata-kit-phone',
  'geodata-kit-localities',
  'geodata-kit-postal',
  'geodata-kit-tz',
] as const;

export function packageJsonPath(name: string): string {
  return join(ROOT, 'packages', name, 'package.json');
}

export function readPackageVersion(name: string): string {
  return (JSON.parse(readFileSync(packageJsonPath(name), 'utf8')) as { version: string }).version;
}

/** The release version: all npm packages share it (Changesets "fixed" group). */
export function releaseVersion(): string {
  return readPackageVersion('geodata-kit');
}

/** Latest version on npm, or null if the package was never published. */
export function publishedVersion(name: string): string | null {
  try {
    return execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export function isPublished(name: string, version: string): boolean {
  try {
    return execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version;
  } catch {
    return false;
  }
}

/** -1, 0 or 1 for plain x.y.z versions (pre-release tags compare as lower). */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string): [number[], string] => {
    const [core, pre = ''] = version.split('-', 2);
    return [core!.split('.').map(Number), pre];
  };
  const [coreA, preA] = parse(a);
  const [coreB, preB] = parse(b);
  for (let i = 0; i < 3; i++) if (coreA[i] !== coreB[i]) return (coreA[i] ?? 0) < (coreB[i] ?? 0) ? -1 : 1;
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return preA < preB ? -1 : 1;
}

export function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}
