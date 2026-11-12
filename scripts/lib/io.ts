import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';

/**
 * Streams the lines of a text file, or of one entry inside a zip (via
 * `unzip -p`, so the 1.8 GB allCountries.txt is never held in memory).
 */
export async function* readLines(path: string, zipEntry?: string): AsyncGenerator<string> {
  if (!zipEntry) {
    const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
    for await (const line of lines) yield line;
    return;
  }
  const child = spawn('unzip', ['-p', path, zipEntry], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const exited = new Promise<number>((done) => child.on('close', (code) => done(code ?? 0)));
  child.stdout.setEncoding('utf8');
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) yield line;
  const code = await exited;
  if (code !== 0) throw new Error(`unzip -p ${path} ${zipEntry} failed (${code}): ${stderr.trim()}`);
}

/** Tab-separated rows, skipping blank lines and `#` comments. */
export async function* readTsv(path: string, zipEntry?: string): AsyncGenerator<string[]> {
  for await (const line of readLines(path, zipEntry)) {
    if (line === '' || line.startsWith('#')) continue;
    yield line.split('\t');
  }
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/**
 * Writes JSON deterministically: same input, byte-identical output, so a data
 * refresh shows only real changes in a diff. `pretty` puts one top-level array
 * item / object entry per line, which keeps diffs readable without bloating size.
 */
export function writeJson(path: string, value: unknown, pretty: 'compact' | 'lines' = 'lines'): number {
  ensureDir(dirname(path));
  const text = pretty === 'compact' ? JSON.stringify(value) : stringifyLines(value);
  writeFileSync(path, `${text}\n`);
  return Buffer.byteLength(text);
}

export function writeGzipJson(path: string, value: unknown): number {
  ensureDir(dirname(path));
  // mtime is not stored by zlib's raw gzipSync header (it writes 0), so output is reproducible.
  const buffer = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
  writeFileSync(path, buffer);
  return buffer.length;
}

function stringifyLines(value: unknown): string {
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{\n${entries.map(([key, item]) => `${JSON.stringify(key)}:${JSON.stringify(item)}`).join(',\n')}\n}`;
  }
  return JSON.stringify(value);
}

export const fileExistsSync = existsSync;

/** Sorts object keys recursively (for maps built from Map/Set iteration order). */
export function sortKeys<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) as T;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rounds coordinates to 4 decimals (~11 m), enough for city lookups and much smaller. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
