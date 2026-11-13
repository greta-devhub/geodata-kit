# geodata-kit-tz

## 0.4.1

## 0.4.0

No changes in this package. It is released with the others because all geodata-kit packages share one version; the changes of 0.4.0 are in geodata-kit-address.

## 0.3.0

### Minor Changes

- Fixes and improvements from a review of 0.2.1.

  **geodata-kit-shapes**

  - `getCountryAt` no longer returns `null` in coastal cities (Copenhagen, Venice, Istanbul, Rio de Janeiro, Miami Beach, Manama, Monaco, Manhattan, Lisbon, Stockholm, Mumbai, Hong Kong, Macau). Near a border or coast the finer subdivision outlines now decide, and a point up to 5 km off the coast counts as the nearest land (`NEAR_COAST_KM`).
  - Enclaves and microstates resolve: where shapes overlap the smallest wins, and Vatican City covers 500 m around its marker (`MARKER_KM`).
  - Still not covered: tiny enclaves such as Baarle-Hertog and Büsingen, and the northern edge of Gibraltar.

  **geodata-kit-cities**

  - Text that is only a place now resolves: `parseLocation('Berlin')`, `'New York'`, `'NYC'`, `'Greater London'`, `'Greater Munich Metropolitan Area'`, `'Bay Area'`. Without a country, the biggest city of that name worldwide is taken (cities over 15,000 inhabitants). `findCity(name)` and `resolveCityTimezone({ city })` work without a country in the same way.
  - Cities are found by their names in other scripts: `Москва`, `Ереван`, `Երևան`, `東京`, `Αθήνα`, `القاهرة`, `서울`. The README now says exactly which languages are covered instead of "any spelling".
  - `searchCities` ranks by size and closeness of the match, so `'San'` lists Santiago, San Antonio and San Diego before small towns named San. Without a country it searches cities over 15,000 inhabitants in about 30 ms (before: every country, about 4 s and 450 MB). **Changed:** to search smaller places in every country, pass `tier`.

  **geodata-kit**

  - `suggestCountries('united')` now puts United States, United Kingdom and United Arab Emirates first: a country's own name counts before an alias.
  - Browser bundles are much smaller. An app that imports only `getCountryName` ships about 40 KB gzipped (before: 119 KB); only `resolveCountry` about 117 KB (before: 211 KB). Nothing in the API changed.
  - The README has a "Which package do I need?" table and explains that `dach` includes Liechtenstein.

  **geodata-kit-postal**

  - `findPlacesByPostalCode('2134', 'US')` finds 02134: up to two leading zeros lost in a spreadsheet are restored where all codes are digits of one length.
  - `findPostalCodes({ city: 'Munich', country: 'DE' })` finds the codes of München when `geodata-kit-cities` is installed.

  **geodata-kit-tz**

  - **Changed:** invalid coordinates return `null` (`getTimezoneAt`) or an empty list (`getTimezonesAt`) instead of throwing, like `geodata-kit-shapes`. `getTimezoneAt` is now typed `string | null`.

  **All packages**

  - New `DATA_DATE` export: the date of the data in the installed version.
  - The `license` field now includes the data licences (for example `MIT AND CC-BY-4.0`), so licence scanners see them. The READMEs say when credit is required.
  - `geodata-kit-phone`: the README says what the package offers and that `parsePhoneNumbers` splits lists and does not search sentences.

- **Breaking:** the subdivision fields now use the same name as the rest of the API.

  - `City`: `admin1`, `admin2`, `admin3`, `admin4` → `subdivision1`, `subdivision2`, `subdivision3`, `subdivision4`
  - `Airport`: `admin1` → `subdivision1`
  - `getSubdivisionChain(place)` reads `subdivision1`–`subdivision4`

  The values are unchanged. To update, rename the fields in your code, e.g. `city.admin1` → `city.subdivision1`.

## 0.2.1

### Patch Changes

- 8592ae6: Shorter, neutral package descriptions, keywords, READMEs and editor docs. Every package now ships its CHANGELOG and links the whole geodata-kit family in its README. Data credits and licences are now listed in one place, `NOTICE` (and `LICENSE-DATA` for geodata-kit-tz). Internal data fields were renamed; the public API is unchanged.

## 0.2.0
