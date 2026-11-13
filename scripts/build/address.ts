/**
 * Address formats and postal-code rules per country: data/address/formats.json.
 *
 * Sources: Google libaddressinput address metadata (CC BY 4.0) for the line
 * format, required and upper-case fields, postal pattern, examples, prefix and
 * region lists; GeoNames countryInfo for the postal layout ('#' digit,
 * '@' letter) and a second pattern; overlays/postal.json for legacy prefixes.
 */
import { existsSync } from 'node:fs';

import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';
import type { CountryRecord } from './countries.js';

export interface AddressFormatRecord {
  /** Google format: %N name, %O organisation, %A address lines, %D dependent locality, %C city, %S region, %Z postal code, %X sorting code, %n new line. */
  format: string;
  /** Latin-script format where the local one differs (e.g. JP, CN). */
  latinFormat: string | null;
  required: string;
  upperCase: string;
  postal: {
    pattern: string | null;
    secondaryPattern: string | null;
    layouts: string[];
    examples: string[];
    prefixes: string[];
    label: string;
  } | null;
  regionLabel: string;
  localityLabel: string;
  sublocalityLabel: string;
  /** Country name as written on the last line of international mail (Google, upper case). */
  postalCountryName: string | null;
  regions: { key: string; name: string; latinName?: string; iso?: string; postalPattern?: string }[];
}

const DEFAULT_FORMAT = '%N%n%O%n%A%n%C';

function split(value: string | undefined): string[] {
  return value ? value.split('~') : [];
}

export async function buildAddress(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const prefixOverlay = readJson<{ prefixes: Record<string, string[]> }>(overlayPath('postal.json')).prefixes;
  const formats: Record<string, AddressFormatRecord> = {};
  let withRegions = 0;

  for (const country of countries) {
    const path = cachePath('address', `${country.code}.json`);
    const google = existsSync(path) ? readJson<Record<string, string>>(path) : {};
    const zip = google.zip ?? null;
    const geonamesPattern = country.postal.regex;
    const layouts = country.postal.format ? country.postal.format.split('|').map((layout) => layout.trim()).filter(Boolean) : [];
    // Google is the authority when it has a record for the country: no `zip`
    // there means no postal codes (GeoNames lists a pattern for the UAE, which has none).
    const hasGoogleRecord = Boolean(google.fmt || google.name);
    const hasPostal = Boolean(zip || (!hasGoogleRecord && geonamesPattern));
    const prefixes = [...new Set([...(google.postprefix ? [google.postprefix] : []), ...(prefixOverlay[country.code] ?? []), `${country.code}-`])];

    const keys = split(google.sub_keys);
    const names = split(google.sub_names);
    const latinNames = split(google.sub_lnames);
    const isoIds = split(google.sub_isoids);
    const zips = split(google.sub_zips);
    const regions = keys.map((key, index) => {
      const region: AddressFormatRecord['regions'][number] = { key, name: names[index] || key };
      if (latinNames[index]) region.latinName = latinNames[index];
      if (isoIds[index]) region.iso = `${country.code}-${isoIds[index]}`;
      if (zips[index]) region.postalPattern = zips[index];
      return region;
    });
    if (regions.length) withRegions++;

    formats[country.code] = {
      format: google.fmt ?? DEFAULT_FORMAT,
      latinFormat: google.lfmt ?? null,
      required: google.require ?? 'AC',
      // Only what the country itself asks for; Google's global default upper-cases the
      // city everywhere, which is wrong for domestic mail in e.g. Germany.
      upperCase: google.upper ?? '',
      postal: hasPostal ? {
        pattern: zip,
        secondaryPattern: geonamesPattern,
        layouts,
        examples: split(google.zipex?.replace(/,/g, '~')),
        prefixes,
        label: google.zip_name_type ?? 'postal',
      } : null,
      regionLabel: google.state_name_type ?? 'province',
      localityLabel: google.locality_name_type ?? 'city',
      sublocalityLabel: google.sublocality_name_type ?? 'suburb',
      postalCountryName: google.name ?? null,
      regions,
    };
  }

  writeJson(dataPath('address', 'formats.json'), Object.fromEntries(Object.entries(formats).sort(([a], [b]) => compareStrings(a, b))), 'lines');
  console.log(`  address: ${Object.keys(formats).length} countries (${Object.values(formats).filter((format) => format.postal).length} with postal codes, ${withRegions} with region lists)`);
}
