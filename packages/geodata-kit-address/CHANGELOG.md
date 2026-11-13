# geodata-kit-address

## 0.4.1

### Patch Changes

- Fixes from testing 0.4.0.

  Postal codes

  - French CEDEX codes are valid: `normalizePostalCode('75008 cedex 08', 'FR')` → `'75008 CEDEX 08'`, also in French Guiana, Guadeloupe, Martinique and Réunion, and the codes of French air bases (`'13661 AIR'`). The data build takes these suffixes from the real codes in `geodata-kit-postal`; `getPostalCodeRules(…).suffixes` lists them. `parseAddress` reads the suffix after the city as well, as French mail writes it (`"75008 PARIS CEDEX 08"` → postal code `75008 CEDEX 08`, city `PARIS`). The 0.4.0 note that every real code is accepted was wrong for these 14,600 codes.

  Parsing

  - With `geodata-kit-postal` installed, `parseAddress` finds the country of an address without one from a postal code next to one of its places: `"10 Rue de Rivoli, 75001 Paris"` → FR, `"10117 Berlin"` → DE. Exactly one country must fit; a bare code is still not enough. A `country` option that is not known is not replaced by a guess.
  - New `postalCheck: 'mismatch'` with `expectedCity` / `expectedRegion`: the postal code belongs to another region than the one written (`"1 Main St, Fake City, CA 10001"` → country US, region CA, `expectedRegion: 'NY'`; before, every field was `null`), or, with `geodata-kit-postal`, to a place more than 30 km from the city written (`"80331 Berlin"` → `expectedCity: 'München'`; before: `'unknown'`). The fields stay as written. Where the postal data has only the first part of codes (GB, CA, NL) the city check gives no verdict, since post towns there serve places far away.

- Updated dependencies
  - geodata-kit@0.4.1

## 0.4.0

### Minor Changes

- Fixes from a review of 0.3.0.

  Parsing

  - US and Canadian addresses parse correctly: in `"1 Market St, San Francisco, CA 94103"` the city is San Francisco and the region CA (before: the region became the city). Full state names work (`"Austin, Texas 78701"` → TX), as do ZIP+4 codes and text without commas when `geodata-kit-postal` or `geodata-kit-cities` is installed (`"350 Fifth Avenue New York NY 10118"`).
  - `parseAddress` finds the country from the address itself when none is given: from a postal prefix (`"CH-8001 Zürich"`, `"D-80331 München"`, every prefix of `getPostalCodeRules(…).prefixes` that ends in a dash) or from a region next to a postal code of that region (`"San Francisco, CA 94103"` → US, `"Ottawa ON K1M 1M4"` → CA).
  - `formatAddress` followed by `parseAddress` gives the same fields back. With `geodata-kit-postal` installed, an upper-case city from an envelope line gets its normal spelling back (`"WASHINGTON"` → `"Washington"`).

  Countries and regions

  - Every function accepts a country name as well as a code: `normalizePostalCode('80331', 'Germany')`, `getRequiredAddressFields('Germany')`, `listRegions('United States')`.
  - `resolveRegion` accepts English names (`'Rome'` → RM, `'Milan'` → MI, `'Washington, D.C.'` → DC) and names with or without the kind of region (`'County Dublin'`, `'Dublin'` → `Co. Dublin`). Regions have a new optional `aliases` field.

  Postal codes

  - `normalizePostalCode('GIR 0AA', 'GB')` keeps the space.
  - **Changed:** validation is stricter where the data knows the real ranges. Rejected now: a Dutch code starting with 0 (`0123 AB`), codes outside the region ranges of Andorra, Argentina, Australia, India, Japan, Mexico, South Korea, Spain, Ukraine and the United States (`53013` in Spain, `011001` in India), and old forms in Armenia (`375010`) and Peru (`LIMA 23`). Every one of the 1.08 million real codes in `geodata-kit-postal` is accepted as before. For most other countries only the shape is checked; the README says which.
  - **Changed:** `formatAddress` returns `[]` for an unknown country instead of throwing, like every other function of the package.

### Patch Changes

- geodata-kit@0.4.0

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

### Patch Changes

- Updated dependencies
- Updated dependencies
  - geodata-kit@0.3.0

## 0.2.1

### Patch Changes

- 8592ae6: Shorter, neutral package descriptions, keywords, READMEs and editor docs. Every package now ships its CHANGELOG and links the whole geodata-kit family in its README. Data credits and licences are now listed in one place, `NOTICE` (and `LICENSE-DATA` for geodata-kit-tz). Internal data fields were renamed; the public API is unchanged.
- Updated dependencies [8592ae6]
  - geodata-kit@0.2.1

## 0.2.0

### Minor Changes

- Split into separate packages, so you install only what you need.

  `geodata-kit` now contains countries, groups, languages and timezones only (about 2 MB installed instead of 70 MB). The former entry points are their own packages:

  | Before (0.1.0)             | Now                        |
  | -------------------------- | -------------------------- |
  | `geodata-kit/subdivisions` | `geodata-kit-subdivisions` |
  | `geodata-kit/cities`       | `geodata-kit-cities`       |
  | `geodata-kit/airports`     | `geodata-kit-airports`     |
  | `geodata-kit/shapes`       | `geodata-kit-shapes`       |
  | `geodata-kit/address`      | `geodata-kit-address`      |
  | `geodata-kit/phone`        | `geodata-kit-phone`        |

  To migrate, install the packages you use and change the import paths; the functions are the same, with two exceptions:

  - `getSubdivisionAt` (shapes) now returns `{ country, iso, code, name }` and no longer a `subdivision` object, so the package has no dependencies.
  - `geodata-kit` additionally exports the text helpers `cleanText` and `editDistance`.

### Patch Changes

- Updated dependencies
  - geodata-kit@0.2.0
