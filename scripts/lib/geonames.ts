/** Column positions in the GeoNames "geoname" table (allCountries, citiesNNN, XX.zip). */
export const COL = {
  geonameId: 0,
  name: 1,
  asciiName: 2,
  alternateNames: 3,
  latitude: 4,
  longitude: 5,
  featureClass: 6,
  featureCode: 7,
  countryCode: 8,
  cc2: 9,
  admin1: 10,
  admin2: 11,
  admin3: 12,
  admin4: 13,
  population: 14,
  elevation: 15,
  dem: 16,
  timezone: 17,
  modificationDate: 18,
} as const;

export interface GeoNamesPlace {
  id: number;
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  featureClass: string;
  featureCode: string;
  country: string;
  admin1: string;
  admin2: string;
  admin3: string;
  admin4: string;
  population: number;
  timezone: string;
}

export function parsePlace(columns: string[]): GeoNamesPlace | null {
  if (columns.length < 19) return null;
  const population = Number(columns[COL.population]);
  return {
    id: Number(columns[COL.geonameId]),
    name: columns[COL.name]!.trim(),
    asciiName: columns[COL.asciiName]!.trim(),
    lat: Number(columns[COL.latitude]),
    lng: Number(columns[COL.longitude]),
    featureClass: columns[COL.featureClass]!,
    featureCode: columns[COL.featureCode]!,
    country: columns[COL.countryCode]!.trim().toUpperCase(),
    // "00" means "no admin1 known" in GeoNames.
    admin1: normalizeAdminCode(columns[COL.admin1]!),
    admin2: normalizeAdminCode(columns[COL.admin2]!),
    admin3: normalizeAdminCode(columns[COL.admin3]!),
    admin4: normalizeAdminCode(columns[COL.admin4]!),
    population: Number.isFinite(population) ? population : 0,
    timezone: columns[COL.timezone]!.trim(),
  };
}

function normalizeAdminCode(code: string): string {
  const trimmed = code.trim();
  return trimmed === '00' ? '' : trimmed;
}

/** Populated-place codes kept as cities/localities (abandoned, destroyed, historical and religious sites are not). */
export const PLACE_CODES = new Set([
  'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLL', 'PPLS', 'PPLF', 'PPLR',
]);

/** Feature-code rank for tie-breaks: capital > seats of higher admin levels > plain places. Lower wins. */
export const FEATURE_RANK: Readonly<Record<string, number>> = {
  PPLC: 0, PPLG: 1, PPLA: 2, PPLA2: 3, PPLA3: 4, PPLA4: 5, PPLA5: 6, PPL: 7, PPLS: 8, PPLF: 9, PPLR: 9, PPLL: 10, PPLX: 11,
};

/**
 * Higher population wins; then the higher-ranked feature code; then the lower
 * GeoNames id, so the output never depends on the order of lines in the dump.
 */
export function comparePlaces(
  a: Pick<GeoNamesPlace, 'population' | 'featureCode' | 'id'>,
  b: Pick<GeoNamesPlace, 'population' | 'featureCode' | 'id'>,
): number {
  if (a.population !== b.population) return b.population - a.population;
  const rankA = FEATURE_RANK[a.featureCode] ?? 12;
  const rankB = FEATURE_RANK[b.featureCode] ?? 12;
  if (rankA !== rankB) return rankA - rankB;
  return a.id - b.id;
}
