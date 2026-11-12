/**
 * Polygons for point lookups (Natural Earth, public domain):
 *   data/shapes/countries.json      admin-0 at 1:50m, keyed by ISO alpha-2 (ISO_A2_EH)
 *   data/shapes/subdivisions.json   admin-1 at 1:10m, keyed by ISO 3166-2 and GeoNames admin1 code
 *
 * Rings are simplified (Douglas–Peucker) and stored as flat integer arrays in
 * 1/1000 degree (~110 m): [lng0, lat0, lng1, lat1, …].
 *   Feature: { id, bbox: [minLng, minLat, maxLng, maxLat] (×1000), polygons: number[][][] }
 *   polygons[i][0] is the outer ring, the rest are holes.
 */
import { readJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath } from '../lib/paths.js';
import type { Level1Record } from './subdivisions.js';

type Ring = [number, number][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
interface Feature { properties: Record<string, unknown>; geometry: Geometry | null }

const SCALE = 1000;

/** Perpendicular distance from p to segment ab (in degrees, fine for simplification). */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points: Ring, tolerance: number): Ring {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = segmentDistance(points[i]!, points[start]!, points[end]!);
      if (distance > maxDistance) { maxDistance = distance; index = i; }
    }
    if (maxDistance > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function encodeRing(ring: Ring, tolerance: number): number[] | null {
  const simplified = simplify(ring, tolerance);
  const flat: number[] = [];
  let previous = '';
  for (const [lng, lat] of simplified) {
    const x = Math.round(lng * SCALE);
    const y = Math.round(lat * SCALE);
    const key = `${x},${y}`;
    if (key === previous) continue;
    previous = key;
    flat.push(x, y);
  }
  return flat.length >= 8 ? flat : null; // at least 4 points
}

function encodeGeometry(geometry: Geometry, tolerance: number): { bbox: number[]; polygons: number[][][] } | null {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const encoded: number[][][] = [];
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    const outer = encodeRing(polygon[0]!, tolerance);
    if (!outer) continue; // outer ring too small at this resolution
    const holes = polygon.slice(1).map((ring) => encodeRing(ring, tolerance)).filter((ring): ring is number[] => ring !== null);
    const rings = [outer, ...holes];
    for (let i = 0; i < outer.length; i += 2) {
      bbox[0] = Math.min(bbox[0]!, outer[i]!); bbox[1] = Math.min(bbox[1]!, outer[i + 1]!);
      bbox[2] = Math.max(bbox[2]!, outer[i]!); bbox[3] = Math.max(bbox[3]!, outer[i + 1]!);
    }
    encoded.push(rings);
  }
  return encoded.length ? { bbox, polygons: encoded } : null;
}

/** Natural Earth units without an ISO code that GeoNames counts as part of a country. */
const ADM0_FALLBACK: Record<string, string> = { SOL: 'SO', CYN: 'CY', KAS: 'IN', CNM: 'CY' };

export async function buildShapes(): Promise<void> {
  const countries = readJson<{ features: Feature[] }>(cachePath('ne_50m_admin_0_countries.geojson'));
  const countryFeatures: { id: string; bbox: number[]; polygons: number[][][] }[] = [];
  const skipped: string[] = [];
  for (const feature of countries.features) {
    const props = feature.properties;
    let code = String(props.ISO_A2_EH ?? props.ISO_A2 ?? '-99');
    if (code === '-99') code = ADM0_FALLBACK[String(props.ADM0_A3)] ?? '-99';
    if (!/^[A-Z]{2}$/.test(code) || !feature.geometry) { skipped.push(String(props.NAME ?? props.ADMIN)); continue; }
    const encoded = encodeGeometry(feature.geometry, 0.002);
    if (!encoded) continue;
    const existing = countryFeatures.find((entry) => entry.id === code);
    if (existing) {
      existing.polygons.push(...encoded.polygons);
      existing.bbox = [Math.min(existing.bbox[0]!, encoded.bbox[0]!), Math.min(existing.bbox[1]!, encoded.bbox[1]!), Math.max(existing.bbox[2]!, encoded.bbox[2]!), Math.max(existing.bbox[3]!, encoded.bbox[3]!)];
    } else {
      countryFeatures.push({ id: code, ...encoded });
    }
  }
  countryFeatures.sort((a, b) => (a.id < b.id ? -1 : 1));
  const countryBytes = writeJson(dataPath('shapes', 'countries.json'), countryFeatures, 'lines');

  // Subdivisions: link to our level-1 records by GeoNames id, else by ISO code.
  const level1 = readJson<Level1Record[]>(dataPath('subdivisions', 'level1.json'));
  const byGeonameId = new Map(level1.map((record) => [record.geonameId, record]));
  const byIso = new Map(level1.filter((record) => record.iso).map((record) => [record.iso!, record]));
  const subdivisions = readJson<{ features: Feature[] }>(cachePath('ne_10m_admin_1_states_provinces.geojson'));
  const subdivisionFeatures: { id: string; country: string; code: string | null; iso: string | null; bbox: number[]; polygons: number[][][] }[] = [];
  let unlinked = 0;
  for (const feature of subdivisions.features) {
    const props = feature.properties;
    if (!feature.geometry) continue;
    const iso = typeof props.iso_3166_2 === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(props.iso_3166_2) ? props.iso_3166_2 : null;
    const record = byGeonameId.get(Number(props.gn_id)) ?? (iso ? byIso.get(iso) : undefined);
    const country = record?.country ?? (typeof props.iso_a2 === 'string' && /^[A-Z]{2}$/.test(props.iso_a2) ? props.iso_a2 : null);
    if (!country) continue;
    if (!record) unlinked++;
    const encoded = encodeGeometry(feature.geometry, 0.004);
    if (!encoded) continue;
    const id = record ? `${record.country}.${record.code}` : `${country}:${String(props.adm1_code)}`;
    const existing = subdivisionFeatures.find((entry) => entry.id === id);
    if (existing) {
      existing.polygons.push(...encoded.polygons);
      existing.bbox = [Math.min(existing.bbox[0]!, encoded.bbox[0]!), Math.min(existing.bbox[1]!, encoded.bbox[1]!), Math.max(existing.bbox[2]!, encoded.bbox[2]!), Math.max(existing.bbox[3]!, encoded.bbox[3]!)];
    } else {
      subdivisionFeatures.push({ id, country, code: record?.code ?? null, iso: record?.iso ?? iso, ...encoded });
    }
  }
  subdivisionFeatures.sort((a, b) => (a.id < b.id ? -1 : 1));
  const subdivisionBytes = writeJson(dataPath('shapes', 'subdivisions.json'), subdivisionFeatures, 'lines');
  console.log(`  shapes: ${countryFeatures.length} countries (${(countryBytes / 1e6).toFixed(1)} MB, skipped ${skipped.join(', ') || 'none'}), ${subdivisionFeatures.length} subdivisions (${(subdivisionBytes / 1e6).toFixed(1)} MB, ${unlinked} without a GeoNames link)`);
}
