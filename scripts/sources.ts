/**
 * Every external source the generator reads, with pinned versions where the
 * publisher offers them. GeoNames publishes only the current dump (rebuilt
 * daily), so its files are recorded by download date and checksum in
 * data/meta.json instead.
 */

export interface Source {
  /** File name inside .cache/. */
  file: string;
  url: string;
  /** Who publishes it and under which licence (copied into data/meta.json). */
  provider: string;
  licence: string;
  /** Unpack after download: tar.gz into .cache/<extractTo>/. Zips are streamed when read. */
  extractTo?: string;
  /** Large files that only some generator steps need. */
  optionalFor?: string;
}

export const CLDR_VERSION = '49.0.0';
export const TZDATA_VERSION = '2026f';
export const NATURAL_EARTH_VERSION = 'v5.1.2';
export const LIBPHONENUMBER_VERSION = 'v9.0.43';
export const TIMEZONE_BOUNDARY_VERSION = '2026f';

const GEONAMES_DUMP = 'https://download.geonames.org/export/dump';
const GEONAMES = { provider: 'GeoNames (geonames.org)', licence: 'CC-BY-4.0' };

export const SOURCES: readonly Source[] = [
  { file: 'countryInfo.txt', url: `${GEONAMES_DUMP}/countryInfo.txt`, ...GEONAMES },
  { file: 'cities500.zip', url: `${GEONAMES_DUMP}/cities500.zip`, ...GEONAMES },
  // The smaller tiers are subsets of cities500; they are read only to know each city's exact tier.
  { file: 'cities1000.zip', url: `${GEONAMES_DUMP}/cities1000.zip`, ...GEONAMES },
  { file: 'cities5000.zip', url: `${GEONAMES_DUMP}/cities5000.zip`, ...GEONAMES },
  { file: 'cities15000.zip', url: `${GEONAMES_DUMP}/cities15000.zip`, ...GEONAMES },
  { file: 'admin1CodesASCII.txt', url: `${GEONAMES_DUMP}/admin1CodesASCII.txt`, ...GEONAMES },
  { file: 'admin2Codes.txt', url: `${GEONAMES_DUMP}/admin2Codes.txt`, ...GEONAMES },
  { file: 'timeZones.txt', url: `${GEONAMES_DUMP}/timeZones.txt`, ...GEONAMES },
  { file: 'hierarchy.zip', url: `${GEONAMES_DUMP}/hierarchy.zip`, ...GEONAMES },
  { file: 'alternateNamesV2.zip', url: `${GEONAMES_DUMP}/alternateNamesV2.zip`, ...GEONAMES },
  { file: 'allCountries.zip', url: `${GEONAMES_DUMP}/allCountries.zip`, ...GEONAMES },
  {
    file: 'postal-allCountries.zip',
    url: 'https://download.geonames.org/export/zip/allCountries.zip',
    ...GEONAMES,
  },
  {
    file: `cldr-core-${CLDR_VERSION}.tgz`,
    url: `https://registry.npmjs.org/cldr-core/-/cldr-core-${CLDR_VERSION}.tgz`,
    provider: 'Unicode CLDR',
    licence: 'Unicode-3.0',
    extractTo: 'cldr-core',
  },
  {
    file: `cldr-localenames-full-${CLDR_VERSION}.tgz`,
    url: `https://registry.npmjs.org/cldr-localenames-full/-/cldr-localenames-full-${CLDR_VERSION}.tgz`,
    provider: 'Unicode CLDR',
    licence: 'Unicode-3.0',
    extractTo: 'cldr-localenames-full',
  },
  {
    file: `cldr-subdivisions-full-${CLDR_VERSION}.tgz`,
    url: `https://registry.npmjs.org/cldr-subdivisions-full/-/cldr-subdivisions-full-${CLDR_VERSION}.tgz`,
    provider: 'Unicode CLDR',
    licence: 'Unicode-3.0',
    extractTo: 'cldr-subdivisions-full',
  },
  {
    file: `tzdata${TZDATA_VERSION}.tar.gz`,
    url: `https://data.iana.org/time-zones/releases/tzdata${TZDATA_VERSION}.tar.gz`,
    provider: 'IANA Time Zone Database',
    licence: 'public domain',
    extractTo: 'tzdata',
  },
  {
    file: 'ne_50m_admin_0_countries.geojson',
    url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_VERSION}/geojson/ne_50m_admin_0_countries.geojson`,
    provider: 'Natural Earth',
    licence: 'public domain',
  },
  {
    file: 'ne_10m_admin_1_states_provinces.geojson',
    url: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_VERSION}/geojson/ne_10m_admin_1_states_provinces.geojson`,
    provider: 'Natural Earth',
    licence: 'public domain',
  },
  {
    file: 'PhoneNumberMetadata.xml',
    url: `https://raw.githubusercontent.com/google/libphonenumber/${LIBPHONENUMBER_VERSION}/resources/PhoneNumberMetadata.xml`,
    provider: 'libphonenumber (The Libphonenumber Authors)',
    licence: 'Apache-2.0',
  },
  {
    // The full product keeps every zone name; "timezones-now" merges zones that share rules from today on
    // (a point in Zürich could come back as Europe/Berlin).
    file: `timezones-${TIMEZONE_BOUNDARY_VERSION}.geojson.zip`,
    url: `https://github.com/evansiroky/timezone-boundary-builder/releases/download/${TIMEZONE_BOUNDARY_VERSION}/timezones.geojson.zip`,
    provider: 'timezone-boundary-builder (data from OpenStreetMap contributors)',
    licence: 'ODbL-1.0',
    optionalFor: 'geodata-kit-tz',
  },
];

/** Google address metadata: one JSON document per country, fetched into .cache/address/. */
export const ADDRESS_DATA_BASE_URL = 'https://www.gstatic.com/chrome/autofill/libaddressinput/chromium-i18n/ssl-address/data';
/** The country index is only served by the original host; per-country files come from the static mirror. */
export const ADDRESS_DATA_INDEX_URL = 'https://chromium-i18n.appspot.com/ssl-address/data';
export const ADDRESS_DATA_SOURCE = {
  provider: "Google libaddressinput address metadata",
  licence: 'CC-BY-4.0',
};

/** Wikidata query service (results are committed under overlays/wikidata/). */
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
