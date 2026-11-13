import { getCountry } from './countries.js';
import { TIMEZONES } from './internal/core-data.js';
import { lazy } from './internal/util.js';
import primaryJson from '../../../data/core/primary-timezones.json';

const PRIMARY = primaryJson as unknown as Record<string, string>;
const canonical = /* @__PURE__ */ lazy((): ReadonlySet<string> => new Set(TIMEZONES.zones));
const byLower = /* @__PURE__ */ lazy((): ReadonlyMap<string, string> => new Map([
  ...TIMEZONES.zones.map((zone) => [zone.toLowerCase(), zone] as const),
  ...Object.entries(TIMEZONES.aliases).map(([alias, target]) => [alias.toLowerCase(), target] as const),
]));

/** IANA timezones of a country. Germany → Europe/Berlin, Europe/Busingen. */
export function getCountryTimezones(code: string): string[] {
  return [...(getCountry(code)?.timezones ?? [])];
}

/** Timezone of the country's most populous city: US → America/New_York, DE → Europe/Berlin. */
export function getPrimaryTimezone(code: string): string | null {
  const country = getCountry(code);
  if (!country) return null;
  return PRIMARY[country.code] ?? country.timezones[0] ?? null;
}

/** True for any IANA name, current or legacy ("Europe/Kiev"), in any case. */
export function isTimezone(value: unknown): value is string {
  return typeof value === 'string' && byLower().has(value.trim().toLowerCase());
}

/** Current canonical IANA name: "Europe/Kiev" → "Europe/Kyiv", "asia/calcutta" → "Asia/Kolkata". */
export function canonicalTimezone(value: string): string | null {
  const found = byLower().get(value.trim().toLowerCase());
  if (!found) return null;
  return canonical().has(found) ? found : TIMEZONES.aliases[found] ?? found;
}

/** Every canonical IANA timezone in the bundled data. */
export function listTimezones(): string[] {
  return [...TIMEZONES.zones];
}
