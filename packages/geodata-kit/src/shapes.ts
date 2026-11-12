/**
 * geodata-kit/shapes — which country or first-level subdivision a point lies
 * in, from Natural Earth polygons (countries 1:50m, subdivisions 1:10m,
 * simplified to about 200–400 m). Good for "which country is this coordinate
 * in"; near borders the answer can be off by a few hundred metres.
 */
import { loadCountryShapes, loadSubdivisionShapes } from './loaders.generated.js';
import { getSubdivision, getSubdivisionName, type Subdivision } from './subdivisions.js';

interface ShapeFeature { id: string; bbox: [number, number, number, number]; polygons: number[][][] }
interface SubdivisionShape extends ShapeFeature { country: string; code: string | null; iso: string | null }

const SCALE = 1000;

/** Ray casting on a flat [x0, y0, x1, y1, …] ring. */
function insideRing(ring: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!; const yi = ring[i + 1]!;
    const xj = ring[j]!; const yj = ring[j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(feature: ShapeFeature, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = feature.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  return feature.polygons.some((rings) => insideRing(rings[0]!, x, y) && !rings.slice(1).some((hole) => insideRing(hole, x, y)));
}

let countryShapes: Promise<ShapeFeature[]> | null = null;
let subdivisionShapes: Promise<SubdivisionShape[]> | null = null;

/** ISO alpha-2 code of the country at a point, or null at sea / outside any country. */
export async function getCountryAt(lat: number, lng: number): Promise<string | null> {
  countryShapes ??= loadCountryShapes().then((module) => module.default as ShapeFeature[]);
  const x = Math.round(lng * SCALE);
  const y = Math.round(lat * SCALE);
  return (await countryShapes).find((feature) => contains(feature, x, y))?.id ?? null;
}

export interface SubdivisionAtPoint {
  country: string;
  /** ISO 3166-2 code of the Natural Earth unit, when it has one. */
  iso: string | null;
  name: string | null;
  /** The matching level-1 subdivision (geodata-kit/subdivisions), when Natural Earth and GeoNames agree on the unit. */
  subdivision: Subdivision | null;
}

/** First-level subdivision at a point: (48.14, 11.58) → Bavaria. */
export async function getSubdivisionAt(lat: number, lng: number): Promise<SubdivisionAtPoint | null> {
  subdivisionShapes ??= loadSubdivisionShapes().then((module) => module.default as SubdivisionShape[]);
  const x = Math.round(lng * SCALE);
  const y = Math.round(lat * SCALE);
  const feature = (await subdivisionShapes).find((candidate) => contains(candidate, x, y));
  if (!feature) return null;
  const subdivision = feature.code ? getSubdivision(`${feature.country}.${feature.code}`) : null;
  return {
    country: feature.country,
    iso: feature.iso,
    name: subdivision?.name ?? (feature.iso ? getSubdivisionName(feature.iso) : null),
    subdivision,
  };
}
