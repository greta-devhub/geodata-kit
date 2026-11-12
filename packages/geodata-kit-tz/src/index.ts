/**
 * geodata-kit-tz — exact IANA timezone for a coordinate, from timezone
 * polygons (timezone-boundary-builder, data © OpenStreetMap contributors,
 * ODbL 1.0 — see LICENSE-DATA). Polygons are simplified to about 110 m.
 *
 * Works in Node.js (reads the file) and in browsers (fetches it next to the module).
 */

const DATA_URL = new URL('../data/timezones.bin', import.meta.url);
const SCALE = 10_000;

interface Index {
  zones: string[];
  polygons: { zone: number; bbox: [number, number, number, number]; rings: Int32Array[] }[];
  cellOffsets: Uint32Array;
  cellList: Uint32Array;
}

let indexPromise: Promise<Index> | null = null;

async function readData(): Promise<ArrayBuffer> {
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  if (isNode && DATA_URL.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    const file = await readFile(DATA_URL);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  }
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`geodata-kit-tz: cannot load ${DATA_URL.href} (HTTP ${response.status})`);
  return response.arrayBuffer();
}

function parse(buffer: ArrayBuffer): Index {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  if (decoder.decode(new Uint8Array(buffer, 0, 4)) !== 'GKTZ') throw new Error('geodata-kit-tz: not a timezone index');
  let offset = 8;
  const zoneCount = view.getUint32(offset, true); offset += 4;
  const zones: string[] = [];
  for (let i = 0; i < zoneCount; i++) {
    const length = view.getUint16(offset, true); offset += 2;
    zones.push(decoder.decode(new Uint8Array(buffer, offset, length))); offset += length;
  }
  const polygonCount = view.getUint32(offset, true); offset += 4;
  const polygons: Index['polygons'] = [];
  for (let i = 0; i < polygonCount; i++) {
    const zone = view.getUint16(offset, true); offset += 2;
    const ringCount = view.getUint16(offset, true); offset += 2;
    const bbox: [number, number, number, number] = [
      view.getInt32(offset, true), view.getInt32(offset + 4, true), view.getInt32(offset + 8, true), view.getInt32(offset + 12, true),
    ];
    offset += 16;
    const rings: Int32Array[] = [];
    for (let r = 0; r < ringCount; r++) {
      const pointCount = view.getUint32(offset, true); offset += 4;
      // Copy so the Int32Array is aligned regardless of the offset.
      rings.push(new Int32Array(buffer.slice(offset, offset + pointCount * 8)));
      offset += pointCount * 8;
    }
    polygons.push({ zone, bbox, rings });
  }
  const cellOffsets = new Uint32Array(buffer.slice(offset, offset + (360 * 180 + 1) * 4));
  offset += (360 * 180 + 1) * 4;
  const cellList = new Uint32Array(buffer.slice(offset));
  return { zones, polygons, cellOffsets, cellList };
}

function load(): Promise<Index> {
  indexPromise ??= readData().then(parse);
  return indexPromise;
}

function insideRing(ring: Int32Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!; const yi = ring[i + 1]!;
    const xj = ring[j]!; const yj = ring[j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Nautical timezone for open sea: Etc/GMT-1 east of 7.5°E, etc. (the sign is inverted in these names). */
export function nauticalTimezone(lng: number): string {
  const offset = Math.round(lng / 15);
  if (offset === 0) return 'Etc/GMT';
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

async function zonesAt(lat: number, lng: number, firstOnly: boolean): Promise<string[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) throw new RangeError(`Invalid coordinate ${lat}, ${lng}`);
  const normalizedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
  const index = await load();
  const x = Math.round(normalizedLng * SCALE);
  const y = Math.round(lat * SCALE);
  const row = Math.min(179, Math.max(0, Math.floor(lat) + 90));
  const col = Math.min(359, Math.max(0, Math.floor(normalizedLng) + 180));
  const cell = row * 360 + col;
  const found: string[] = [];
  // Candidates are stored smallest first, so the first hit is the most specific zone.
  for (let i = index.cellOffsets[cell]!; i < index.cellOffsets[cell + 1]!; i++) {
    const polygon = index.polygons[index.cellList[i]!]!;
    const [minX, minY, maxX, maxY] = polygon.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (insideRing(polygon.rings[0]!, x, y) && !polygon.rings.slice(1).some((hole) => insideRing(hole, x, y))) {
      const zone = index.zones[polygon.zone]!;
      if (!found.includes(zone)) found.push(zone);
      if (firstOnly) break;
    }
  }
  return found.length ? found : [nauticalTimezone(normalizedLng)];
}

/**
 * IANA timezone at a coordinate: (48.137, 11.575) → "Europe/Berlin",
 * (39.77, -86.16) → "America/Indiana/Indianapolis". At sea: "Etc/GMT±N".
 * Where zones overlap in the source (Xinjiang: Asia/Urumqi inside Asia/Shanghai),
 * the most specific (smallest) one is returned; see getTimezonesAt.
 */
export async function getTimezoneAt(lat: number, lng: number): Promise<string> {
  return (await zonesAt(lat, lng, true))[0]!;
}

/** Every zone whose polygon contains the point, most specific first (usually one). */
export async function getTimezonesAt(lat: number, lng: number): Promise<string[]> {
  return zonesAt(lat, lng, false);
}

/** Every timezone name in the polygon data. */
export async function listPolygonTimezones(): Promise<string[]> {
  return [...(await load()).zones];
}
