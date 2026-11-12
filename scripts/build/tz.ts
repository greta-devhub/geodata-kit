/**
 * Timezone polygons for the optional geodata-kit-tz package (data: ODbL,
 * timezone-boundary-builder / OpenStreetMap contributors):
 *
 *   data/tz/timezones.bin
 *
 * Polygons are simplified (Douglas–Peucker, 0.001° ≈ 110 m) and stored as
 * Int32 coordinates in 1/10,000 degree, with a 1°×1° grid listing the
 * candidate polygons per cell. Little-endian layout:
 *
 *   "GKTZ" u32 version
 *   u32 zoneCount, then per zone: u16 byteLength + UTF-8 name
 *   u32 polygonCount, then per polygon: u16 zone, u16 ringCount, i32×4 bbox,
 *       per ring: u32 pointCount + i32 lng/lat pairs
 *   grid 360×180 cells (row = lat+90, col = lng+180): u32 offset into the list section per cell (+1 end offset)
 *   list section: u32 polygon indexes
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { ensureDir, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';
import { TIMEZONE_BOUNDARY_VERSION } from '../sources.js';

type Ring = [number, number][];
const SCALE = 10_000;
const TOLERANCE = 0.001;

function simplify(points: Ring, tolerance: number): Ring {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = points[start]!;
    const [bx, by] = points[end]!;
    const dx = bx - ax; const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let maxDistance = 0; let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i]!;
      let distance: number;
      if (lengthSquared === 0) distance = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (distance > maxDistance) { maxDistance = distance; index = i; }
    }
    if (maxDistance > tolerance && index > 0) { keep[index] = 1; stack.push([start, index], [index, end]); }
  }
  return points.filter((_, i) => keep[i]);
}

export async function buildTz(): Promise<void> {
  console.log('  reading the timezone GeoJSON (≈170 MB)…');
  const text = execFileSync('unzip', ['-p', cachePath(`timezones-${TIMEZONE_BOUNDARY_VERSION}.geojson.zip`), 'combined.json'], { maxBuffer: 400 * 1024 * 1024, encoding: 'utf8' });
  const geojson = JSON.parse(text) as { features: { properties: { tzid: string }; geometry: { type: string; coordinates: unknown } }[] };

  const zones = [...new Set(geojson.features.map((feature) => feature.properties.tzid))].sort();
  const zoneIndex = new Map(zones.map((zone, index) => [zone, index]));
  const polygons: { zone: number; bbox: [number, number, number, number]; rings: Int32Array[] }[] = [];
  let points = 0;

  for (const feature of geojson.features) {
    const list = (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][];
    for (const polygon of list) {
      const rings: Int32Array[] = [];
      const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
      polygon.forEach((ring, ringIndex) => {
        const simplified = simplify(ring, TOLERANCE);
        if (simplified.length < 4) return;
        const array = new Int32Array(simplified.length * 2);
        simplified.forEach(([lng, lat], i) => {
          const x = Math.round(lng * SCALE); const y = Math.round(lat * SCALE);
          array[i * 2] = x; array[i * 2 + 1] = y;
          if (ringIndex === 0) {
            bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
            bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
          }
        });
        if (ringIndex === 0 || rings.length) rings.push(array);
        points += simplified.length;
      });
      if (rings.length) polygons.push({ zone: zoneIndex.get(feature.properties.tzid)!, bbox, rings });
    }
  }

  // Grid of candidate polygons per 1° cell.
  const cells: number[][] = Array.from({ length: 360 * 180 }, () => []);
  polygons.forEach((polygon, index) => {
    const [minX, minY, maxX, maxY] = polygon.bbox;
    const col0 = Math.max(0, Math.floor(minX / SCALE) + 180); const col1 = Math.min(359, Math.floor(maxX / SCALE) + 180);
    const row0 = Math.max(0, Math.floor(minY / SCALE) + 90); const row1 = Math.min(179, Math.floor(maxY / SCALE) + 90);
    for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) cells[row * 360 + col]!.push(index);
  });

  // The source has deliberate overlaps (Asia/Urumqi lies inside Asia/Shanghai).
  // Smallest polygon first, so a lookup returns the most specific zone.
  const area = (index: number): number => {
    const [minX, minY, maxX, maxY] = polygons[index]!.bbox;
    return (maxX - minX) * (maxY - minY);
  };
  for (const cell of cells) cell.sort((a, b) => area(a) - area(b) || a - b);

  // Serialise.
  const encoder = new TextEncoder();
  const zoneBytes = zones.map((zone) => encoder.encode(zone));
  let size = 4 + 4 + 4 + zoneBytes.reduce((total, bytes) => total + 2 + bytes.length, 0) + 4;
  for (const polygon of polygons) size += 2 + 2 + 16 + polygon.rings.reduce((total, ring) => total + 4 + ring.byteLength, 0);
  const listLength = cells.reduce((total, cell) => total + cell.length, 0);
  size += (cells.length + 1) * 4 + listLength * 4;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  bytes.set(encoder.encode('GKTZ'), 0); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;
  view.setUint32(offset, zones.length, true); offset += 4;
  for (const encoded of zoneBytes) { view.setUint16(offset, encoded.length, true); offset += 2; bytes.set(encoded, offset); offset += encoded.length; }
  view.setUint32(offset, polygons.length, true); offset += 4;
  for (const polygon of polygons) {
    view.setUint16(offset, polygon.zone, true); offset += 2;
    view.setUint16(offset, polygon.rings.length, true); offset += 2;
    for (const value of polygon.bbox) { view.setInt32(offset, value, true); offset += 4; }
    for (const ring of polygon.rings) {
      view.setUint32(offset, ring.length / 2, true); offset += 4;
      for (const value of ring) { view.setInt32(offset, value, true); offset += 4; }
    }
  }
  let listOffset = 0;
  for (const cell of cells) { view.setUint32(offset, listOffset, true); offset += 4; listOffset += cell.length; }
  view.setUint32(offset, listOffset, true); offset += 4;
  for (const cell of cells) for (const index of cell) { view.setUint32(offset, index, true); offset += 4; }
  if (offset !== size) throw new Error(`size mismatch ${offset} vs ${size}`);

  ensureDir(dataPath('tz'));
  writeFileSync(dataPath('tz', 'timezones.bin'), bytes);
  writeJson(dataPath('reports', 'tz.json'), { zones: zones.length, polygons: polygons.length, points, bytes: size, source: `timezone-boundary-builder ${TIMEZONE_BOUNDARY_VERSION} (ODbL)` });
  console.log(`  tz: ${zones.length} zones, ${polygons.length} polygons, ${points} points, ${(size / 1024 / 1024).toFixed(1)} MB`);
}
