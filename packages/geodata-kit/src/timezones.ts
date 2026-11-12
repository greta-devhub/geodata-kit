import { getCountry } from './countries.js';
import { TIMEZONES } from './internal/core-data.js';
import primaryJson from '../../../data/core/primary-timezones.json';

const PRIMARY = primaryJson as unknown as Record<string, string>;
const CANONICAL: ReadonlySet<string> = new Set(TIMEZONES.zones);
const BY_LOWER: ReadonlyMap<string, string> = new Map([
  ...TIMEZONES.zones.map((zone) => [zone.toLowerCase(), zone] as const),
  ...Object.entries(TIMEZONES.aliases).map(([alias, target]) => [alias.toLowerCase(), target] as const),
]);

/** IANA timezones of a country (tzdata zone.tab). Germany → Europe/Berlin, Europe/Busingen. */
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
  return typeof value === 'string' && BY_LOWER.has(value.trim().toLowerCase());
}

/** Current canonical IANA name: "Europe/Kiev" → "Europe/Kyiv", "asia/calcutta" → "Asia/Kolkata". */
export function canonicalTimezone(value: string): string | null {
  const found = BY_LOWER.get(value.trim().toLowerCase());
  if (!found) return null;
  return CANONICAL.has(found) ? found : TIMEZONES.aliases[found] ?? found;
}

/** Every canonical IANA timezone known to the bundled tzdata. */
export function listTimezones(): string[] {
  return [...TIMEZONES.zones];
}
