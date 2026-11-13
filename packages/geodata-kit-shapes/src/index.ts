/**
 * geodata-kit-shapes — which country or first-level subdivision a point lies
 * in, from boundary polygons (countries 1:50m, subdivisions 1:10m,
 * simplified to about 200–400 m).
 *
 * The outlines are simplified, so three rules keep the answers right where it
 * matters most, in coastal cities and small states:
 *  - near any border or coast the finer subdivision outlines decide, and
 *    where shapes overlap the smallest one wins;
 *  - a territory too small for the data is stored as a marker and covers
 *    MARKER_KM around it (Vatican City);
 *  - a point that falls just off the simplified coast (a harbour, a pier, a
 *    small island) gets the nearest land within NEAR_COAST_KM.
 *
 * Tiny enclaves (Baarle-Hertog, Büsingen) and the northern half of Gibraltar
 * are not in the outlines. With geodata-kit-tz and geodata-kit installed,
 * getCountryAt also asks the timezone polygons, which follow the borders to
 * about 110 m: near a border, a timezone that only one country uses decides
 * (Europe/Busingen is Germany, Europe/Brussels Belgium).
 */
import { dataDate } from '../../../data/meta.json';
import { loadCountryShapes, loadSubdivisionShapes } from './loaders.generated.js';

interface ShapeFeature { id: string; bbox: [number, number, number, number]; polygons: number[][][] }
interface SubdivisionShape extends ShapeFeature { country: string; code: string | null; iso: string | null; name: string | null }

/** Coordinates are stored as integers in 1/1000 degree (about 111 m of latitude). */
const SCALE = 1000;
const KM_PER_UNIT = 0.1112;

/** A point this close to land still counts as that land: simplified coasts cut off harbours and small islands. */
export const NEAR_COAST_KM = 5;
/** A shape no bigger than two grid cells is a marker for a territory too small for the data; it covers this distance around it. */
export const MARKER_KM = 0.5;
/**
 * Closer than this to any coarse country outline, the finer subdivision
 * outlines decide. The coarse set is drawn for small maps: it cuts off coasts
 * and moves microstates by a kilometre or more.
 */
const COARSE_EDGE_KM = 15;

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

const bboxArea = (feature: ShapeFeature): number => (feature.bbox[2] - feature.bbox[0]) * (feature.bbox[3] - feature.bbox[1]);

const isMarker = (feature: ShapeFeature): boolean => feature.bbox[2] - feature.bbox[0] <= 2 && feature.bbox[3] - feature.bbox[1] <= 2;

/** The smallest shape that contains the point (or marker that covers it): an enclave or microstate wins over what surrounds it. */
function smallestContaining<T extends ShapeFeature>(features: T[], x: number, y: number): T | null {
  let best: T | null = null;
  for (const feature of features) {
    if (best && bboxArea(feature) >= bboxArea(best)) continue;
    if (contains(feature, x, y) || (isMarker(feature) && distanceToOutline(feature, x, y, MARKER_KM) < MARKER_KM)) best = feature;
  }
  return best;
}

/** Distance in km from the point to the outline of a shape; Infinity when its bounding box is farther than `limitKm`. */
function distanceToOutline(feature: ShapeFeature, x: number, y: number, limitKm: number): number {
  // One unit of longitude shrinks with latitude; near the poles the factor is clamped so the search box stays finite.
  const shrink = Math.max(0.05, Math.cos((y / SCALE) * (Math.PI / 180)));
  const limit = limitKm / KM_PER_UNIT;
  const [minX, minY, maxX, maxY] = feature.bbox;
  if (x < minX - limit / shrink || x > maxX + limit / shrink || y < minY - limit || y > maxY + limit) return Infinity;
  let best = Infinity;
  for (const rings of feature.polygons) {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = (ring[j]! - x) * shrink; const ay = ring[j + 1]! - y;
        const bx = (ring[i]! - x) * shrink; const by = ring[i + 1]! - y;
        const dx = bx - ax; const dy = by - ay;
        const length = dx * dx + dy * dy;
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
        const distance = Math.hypot(ax + t * dx, ay + t * dy);
        if (distance < best) best = distance;
      }
    }
  }
  return best * KM_PER_UNIT;
}

/** The shape whose outline is nearest to the point, if within `limitKm`. Ties go to the first shape in the data, so results are stable. */
function nearestWithin<T extends ShapeFeature>(features: T[], x: number, y: number, limitKm: number): T | null {
  let best: T | null = null;
  let bestDistance = limitKm;
  for (const feature of features) {
    const distance = distanceToOutline(feature, x, y, bestDistance);
    if (distance < bestDistance) { best = feature; bestDistance = distance; }
  }
  return best;
}

/**
 * Position of a coordinate in grid units. Null for invalid input (not a
 * number, latitude outside ±90), like every lookup in the geodata-kit family.
 * Longitudes wrap around, so 190 is the same as -170. The point is not rounded
 * to the grid: rounding would move it up to 55 m, onto or across the outline
 * of a small territory (Gibraltar is 1.2 km wide in the data).
 */
function toGrid(lat: number, lng: number): { x: number; y: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { x: wrapped * SCALE, y: lat * SCALE };
}

type TzModule = { getTimezoneAt: (lat: number, lng: number) => Promise<string | null> };
type CoreModule = { listCountries: () => { code: string; timezones: string[] }[] };

/** An optional package of the family, or null when it is not installed. The name is a variable so bundlers don't try to resolve it. */
function importOptional<T>(name: string): Promise<T | null> {
  return import(/* webpackIgnore: true */ /* @vite-ignore */ name).catch(() => null) as Promise<T | null>;
}

let timezoneCountry: Promise<((lat: number, lng: number) => Promise<string | null>) | null> | null = null;

/**
 * With geodata-kit-tz and geodata-kit installed: the country whose own
 * timezone covers the point ("Europe/Busingen" → DE). Null where the zone is
 * shared by countries, at sea, or when either package is missing.
 */
function countryByTimezone(): Promise<((lat: number, lng: number) => Promise<string | null>) | null> {
  timezoneCountry ??= (async () => {
    const [tz, core] = await Promise.all([importOptional<TzModule>('geodata-kit-tz'), importOptional<CoreModule>('geodata-kit')]);
    if (!tz || !core) return null;
    const owners = new Map<string, string[]>();
    for (const country of core.listCountries()) {
      for (const zone of country.timezones) owners.set(zone, [...(owners.get(zone) ?? []), country.code]);
    }
    return async (lat: number, lng: number) => {
      const zone = await tz.getTimezoneAt(lat, lng).catch(() => null);
      const countries = zone ? owners.get(zone) : undefined;
      return countries?.length === 1 ? countries[0]! : null;
    };
  })();
  return timezoneCountry;
}

let countryShapes: Promise<ShapeFeature[]> | null = null;
let subdivisionShapes: Promise<SubdivisionShape[]> | null = null;
const loadCountries = (): Promise<ShapeFeature[]> => (countryShapes ??= loadCountryShapes().then((module) => module.default as ShapeFeature[]));
const loadSubdivisions = (): Promise<SubdivisionShape[]> => (subdivisionShapes ??= loadSubdivisionShapes().then((module) => module.default as SubdivisionShape[]));

/**
 * ISO alpha-2 code of the country at a point: (41.01, 28.98) → "TR".
 * Null on the open sea (more than NEAR_COAST_KM from land) and for invalid coordinates.
 */
export async function getCountryAt(lat: number, lng: number): Promise<string | null> {
  const point = toGrid(lat, lng);
  if (!point) return null;
  const countries = await loadCountries();
  const coarse = smallestContaining(countries, point.x, point.y);
  // Well inside a country, far from every outline: the coarse data is enough and the bigger subdivision data stays unloaded.
  if (coarse && !countries.some((country) => distanceToOutline(country, point.x, point.y, COARSE_EDGE_KM) < COARSE_EDGE_KM)) return coarse.id;
  const found = await countryNearEdge(point, countries, coarse);
  // Near a border the outlines miss enclaves; a timezone of one country knows them.
  const byTimezone = found ? await (await countryByTimezone())?.(lat, lng) : null;
  return byTimezone ?? found;
}

async function countryNearEdge(point: { x: number; y: number }, countries: ShapeFeature[], coarse: ShapeFeature | null): Promise<string | null> {
  const subdivisions = await loadSubdivisions();
  const fine = smallestContaining(subdivisions, point.x, point.y);
  if (fine) return fine.country;
  if (coarse) return coarse.id;
  const nearSubdivision = nearestWithin(subdivisions, point.x, point.y, NEAR_COAST_KM);
  const nearCountry = nearestWithin(countries, point.x, point.y, NEAR_COAST_KM);
  if (nearSubdivision && nearCountry) {
    const a = distanceToOutline(nearSubdivision, point.x, point.y, NEAR_COAST_KM);
    const b = distanceToOutline(nearCountry, point.x, point.y, NEAR_COAST_KM);
    return a <= b ? nearSubdivision.country : nearCountry.id;
  }
  return nearSubdivision?.country ?? nearCountry?.id ?? null;
}

export interface SubdivisionAtPoint {
  /** ISO alpha-2 country code. */
  country: string;
  /** ISO 3166-2 code ("DE-BY"), when the unit has one. */
  iso: string | null;
  /** Level-1 code ("02"); with geodata-kit-subdivisions: getSubdivision(`${country}.${code}`). */
  code: string | null;
  /** English name ("Bavaria"). */
  name: string | null;
}

/**
 * First-level subdivision at a point: (48.14, 11.58) → { country: 'DE', iso: 'DE-BY', code: '02', name: 'Bavaria' }.
 * Null on the open sea (more than NEAR_COAST_KM from land), for invalid coordinates and where a country has no subdivision shapes.
 */
export async function getSubdivisionAt(lat: number, lng: number): Promise<SubdivisionAtPoint | null> {
  const point = toGrid(lat, lng);
  if (!point) return null;
  const subdivisions = await loadSubdivisions();
  const feature = smallestContaining(subdivisions, point.x, point.y) ?? nearestWithin(subdivisions, point.x, point.y, NEAR_COAST_KM);
  return feature ? { country: feature.country, iso: feature.iso, code: feature.code, name: feature.name } : null;
}

/**
 * Date of the data in this version, as YYYY-MM-DD. The data is refreshed about
 * once a month; every package of one version carries the same date.
 */
export const DATA_DATE: string = dataDate;
