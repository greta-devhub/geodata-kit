import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = join(ROOT, '.cache');
export const DATA_DIR = join(ROOT, 'data');
export const OVERLAYS_DIR = join(ROOT, 'overlays');
export const REPORTS_DIR = join(ROOT, 'data', 'reports');

export const cachePath = (...parts: string[]): string => join(CACHE_DIR, ...parts);
export const dataPath = (...parts: string[]): string => join(DATA_DIR, ...parts);
export const overlayPath = (...parts: string[]): string => join(OVERLAYS_DIR, ...parts);
