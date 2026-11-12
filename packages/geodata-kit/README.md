# geodata-kit

Countries, regions, cities, languages, timezones, addresses and phone numbers,
offline and typed, with no dependencies.

```bash
npm install geodata-kit
```

```ts
import { resolveCountry, getCountryName, getNationalLanguages } from 'geodata-kit';
import { resolveCityTimezone } from 'geodata-kit/cities';

resolveCountry('Deutschland')?.code;                     // 'DE'
getCountryName('CH', 'fr');                              // 'Suisse'
getNationalLanguages('CH').map((l) => l.code);           // ['de', 'fr', 'it', 'gsw']
(await resolveCityTimezone({ city: 'München', country: 'DE' }))?.timezone; // 'Europe/Berlin'
```

## What's inside

| Import | For |
|---|---|
| `geodata-kit` | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies |
| `geodata-kit/subdivisions` | states, provinces, cantons and the levels below |
| `geodata-kit/cities` | cities, free-text locations, city timezones, nearest city |
| `geodata-kit/airports` | airports by IATA / ICAO code |
| `geodata-kit/shapes` | which country or region a coordinate is in |
| `geodata-kit/address` | address formats, required fields, postal codes |
| `geodata-kit/phone` | parse, validate and format phone numbers |

Optional add-ons:

| Package | Adds |
|---|---|
| `geodata-kit-localities` | 4.9 million villages and city districts |
| `geodata-kit-postal` | postal code → place lookups |
| `geodata-kit-tz` | exact timezone for any coordinate |

## Countries

```ts
import { getCountry, resolveCountry, searchCountries, formatCountry, getCurrency } from 'geodata-kit';

getCountry('DE');                          // { name: 'Germany', alpha3: 'DEU', capital: 'Berlin', callingCode: '49', flag: '🇩🇪', … }
resolveCountry('UK')?.code;                // 'GB' — names in many languages, aliases, alpha-3 codes
resolveCountry('Congo');                   // null — ambiguous, see suggestCountries()
searchCountries('osterr', { locale: 'de' }); // [Österreich] — for country pickers
formatCountry('DE', { withCode: true });   // 'Germany (DE)'
getCurrency('BG');                         // 'EUR'
```


## Groups and regions

```ts
import { getCountriesInGroup, isInGroup, expandGroups, getContinent } from 'geodata-kit';

getCountriesInGroup('dach');               // ['AT', 'CH', 'DE', 'LI']
isInGroup('GB', 'eu', { at: '2019-06-01' }); // true — membership by date
expandGroups(['benelux', 'FR']);           // ['BE', 'LU', 'NL', 'FR']
getContinent('DE')?.name;                  // 'Europe'
```

Groups: continents (`continent_europe`, …), UN regions (`un_western_europe`, …),
`eu`, `eurozone`, `schengen`, `eea`, `efta`, `dach`, `benelux`, `nordic`,
`baltic`, `cee`, `eastern_europe`, `emea`, `mena`, `apac`, `north_america`,
`latin_america`, `caribbean`, `central_asia`.

## Languages

```ts
import { getNationalLanguages, getPrimaryLanguage, getLanguagesOfSubdivision, resolveLanguage, getLanguageName } from 'geodata-kit';

getPrimaryLanguage('BE');                  // 'nl'
getLanguagesOfSubdivision('ES-CT');        // Spanish, Catalan, Occitan (most spoken first)
resolveLanguage('Deutsch');                // 'de'
getLanguageName('de', 'fr');               // 'allemand'
```


## Timezones

```ts
import { getCountryTimezones, getPrimaryTimezone, canonicalTimezone } from 'geodata-kit';

getCountryTimezones('DE');                 // ['Europe/Berlin', 'Europe/Busingen']
getPrimaryTimezone('US');                  // 'America/New_York'
canonicalTimezone('Europe/Kiev');          // 'Europe/Kyiv'
```

## Subdivisions

```ts
import { resolveSubdivision, listSubdivisions, findSubdivision } from 'geodata-kit/subdivisions';

resolveSubdivision('Bayern', 'DE')?.iso;   // 'DE-BY'
listSubdivisions('CH').length;             // 26
await findSubdivision('Oberbayern', 'DE'); // a level-2 region
```

## Cities

```ts
import { findCity, parseLocation, resolveCityTimezone, findNearestCities } from 'geodata-kit/cities';

await findCity('Springfield', { country: 'US', subdivision: 'MO' });
await parseLocation('San Francisco, CA');  // { city, subdivision: California, country: 'US' }
await resolveCityTimezone({ city: 'Berlin, Germany' }); // Europe/Berlin
await findNearestCities(48.137, 11.575, { limit: 1 }); // [Munich]
```

`resolveCityTimezone` falls back to the region's and then the country's main
timezone when a place is unknown. City functions are async: each country's
data loads the first time you use it. Use the `tier` option (15000, 5000,
1000 or 500 inhabitants) to load fewer cities.

## Airports and coordinates

```ts
import { getAirportByIata } from 'geodata-kit/airports';
import { getCountryAt, getSubdivisionAt } from 'geodata-kit/shapes';

await getAirportByIata('MUC');             // Munich International Airport
await getCountryAt(47.56, 7.59);           // 'CH'
```

## Addresses and postal codes

```ts
import { getRequiredAddressFields, normalizePostalCode, formatAddress, parseAddress } from 'geodata-kit/address';

getRequiredAddressFields('US');            // ['addressLines', 'city', 'region', 'postalCode']
normalizePostalCode('sw1a1aa', 'GB');      // 'SW1A 1AA'
formatAddress({ line1: 'Hauptstr. 1', postalCode: '80331', city: 'München', country: 'DE' }, { from: 'CH' });
// ['Hauptstr. 1', '80331 München', 'GERMANY']
await parseAddress('Hauptstr. 1, D-80331 München, Deutschland');
// { lines: ['Hauptstr. 1'], postalCode: '80331', city: 'München', country: 'DE', … }
```

## Phone numbers

```ts
import { parsePhoneNumber, formatPhoneNumber } from 'geodata-kit/phone';

parsePhoneNumber('089 1234567', 'DE');     // { e164: '+49891234567', type: 'fixed_line', isValid: true, … }
formatPhoneNumber('+12125550123', 'NATIONAL'); // '(212) 555-0123'
```

## API reference

Every function, grouped by import. `code` is an ISO 3166-1 alpha-2 country
code ("DE"); most functions also accept lower case. Options are optional
unless shown without `?`.

### `geodata-kit` — countries

| Function | Returns |
|---|---|
| `getCountry(code)` | `Country` (name, alpha3, numeric, capital, area, population, continent, tld, callingCode, currencies, neighbours, timezones, demonym, drivingSide, weekStart, weekend, measurementSystem, paperSize, flag) or `null` |
| `listCountries({ group?, continent?, language?, currency? })` | all countries, optionally filtered |
| `isCountryCode(value)` | `true` for a known code in upper case |
| `normalizeCountryCode(value)` | `'DE'` for `' de '`, `null` if unknown |
| `normalizeCountryCodes(values)` | `{ codes, invalid }` |
| `COUNTRY_CODE_PATTERN` | regex for two letters |
| `getSuccessorCodes(retiredCode)` | codes that replaced a retired one: `'CS'` → `['RS', 'ME']` |
| `resolveCountry(text)` | `{ code, matchedBy, input }` from a name in many languages, alias, alpha-2/3 or numeric code; `null` if unknown or ambiguous |
| `resolveCountries(texts)` | `{ resolved: Map, unresolved: string[] }` for a whole list |
| `suggestCountries(text, limit?)` | likely countries for a typo or ambiguous name |
| `getCountryName(code, locale?)` | name in en, de, fr, es, it, nl, pt or pl |
| `getCountryAliases(code)` | other names: `['Deutschland', 'BRD', …]` |
| `formatCountry(code, { locale?, withCode?, upperCase? })` | `'Germany'`, `'Germany (DE)'`, `'GERMANY'` |
| `searchCountries(query, { groups?, locale?, limit? })` | ranked matches for a country picker |
| `sortCountries(countries, locale?)` | sorted by localised name |
| `getCurrency(code)` | main currency today: `'EUR'` |
| `getCurrencies(code, { at?, includeNonTender? })` | currencies on a date, with `from` / `to` |
| `getCallingCode(code)` | `'49'` |
| `getCountriesByCallingCode(callingCode)` | `'1'` → US, CA, … |
| `getTld(code)` | `'.de'` |
| `getCapital(code)` | `'Berlin'` |
| `getArea(code)` | km² |
| `getPopulation(code)` | inhabitants |
| `getNeighbours(code)` | bordering countries |
| `getDemonym(code)` | `'German'` |
| `getWeekStart(code)` | `'mon'`, `'sun'`, … |
| `getMeasurementSystem(code)` | `'metric'`, `'US'` or `'UK'` |
| `getPaperSize(code)` | `'A4'` or `'US-Letter'` |
| `getDrivingSide(code)` | `'left'` or `'right'` |
| `getFlagEmoji(code)` | `'🇩🇪'` |
| `fold(text)` | lower case, no accents or punctuation: `'São Paulo'` → `'sao paulo'` |

### `geodata-kit` — groups and regions

| Function | Returns |
|---|---|
| `listGroups(kind?)` | groups; kind is `'continent'`, `'un'`, `'political'` or `'business'` |
| `getGroup(slug)` | one group with members and dates |
| `getCountriesInGroup(slug, { at? })` | member codes on a date (default today) |
| `getGroupsOfCountry(code, { at?, kind? })` | groups a country belongs to |
| `isInGroup(code, slug, { at? })` | `true` / `false` |
| `expandGroups(items, { at? })` | codes from a mix of group slugs, codes and names |
| `listContinents()` | the 7 continents |
| `getContinent(code)` | `{ code, name, slug }` |
| `getM49Region(code)` | UN region, sub-region, intermediate region, groupings |

### `geodata-kit` — languages

| Function | Returns |
|---|---|
| `getNationalLanguages(code)` | official and de facto languages, most spoken first |
| `getPrimaryLanguage(code)` | first official language: `'de'` |
| `getCountryLanguages(code, { minShare?, status? })` | every language spoken, with share, speakers and status |
| `getRegionalLanguages(code)` | languages official in part of the country, with their subdivisions |
| `getLanguagesOfSubdivision(iso)` | official languages of a subdivision: `'ES-CT'` |
| `getCountriesByLanguage(language, { status?, minShare? })` | countries where a language is used |
| `isOfficialLanguage(language, code, { subdivision? })` | `true` / `false` |
| `getDefaultLocale(code)` | `'de-CH'` |
| `resolveLanguage(text)` | code from a name or code: `'Deutsch'`, `'ger'`, `'de-CH'` → `'de'` |
| `getLanguageName(code, locale?)` | `'allemand'`; locale `'endonym'` for the language's own name |
| `getLanguageScripts(code)` | `['Cyrl', 'Latn']` |

### `geodata-kit` — timezones

| Function | Returns |
|---|---|
| `getCountryTimezones(code)` | IANA zones of a country |
| `getPrimaryTimezone(code)` | zone of the largest city |
| `isTimezone(value)` | `true` for current and old IANA names |
| `canonicalTimezone(value)` | current name: `'Europe/Kiev'` → `'Europe/Kyiv'` |
| `listTimezones()` | all IANA zones |

### `geodata-kit/subdivisions`

Level 1 = states, provinces, cantons, Länder; levels 2–4 are the divisions below.

| Function | Returns |
|---|---|
| `listSubdivisions(code)` | level-1 subdivisions of a country |
| `getSubdivision(isoOrKey)` | by ISO 3166-2 code (`'DE-BY'`) or GeoNames key (`'DE.02'`) |
| `resolveSubdivision(text, code?)` | from a name, local name, abbreviation or ISO code |
| `isSubdivisionCode(value)` | `true` for a valid ISO 3166-2 code |
| `getSubdivisionName(iso)` | English name of any ISO 3166-2 code |
| `loadSubdivisions(code, { level?, parent? })` | async; any level, optionally under a parent |
| `findSubdivision(text, code, { level? })` | async; by name on any level |
| `getSubdivisionChain(place)` | async; level 1 down to 4 for a city or other place |

### `geodata-kit/cities` (all async)

`tier`: `15000`, `5000`, `1000` or `500` (default) minimum inhabitants, or
`'all'` to include `geodata-kit-localities`.

| Function | Returns |
|---|---|
| `findCity(name, { country, subdivision?, tier? })` | best matching `City` (name, asciiName, country, admin1–4, population, lat, lng, timezone, featureCode, unlocode, wikidataId, alternateNames) |
| `searchCities(query, { country?, subdivision?, minPopulation?, tier?, limit? })` | cities starting with the query |
| `listCities({ country, subdivision?, minPopulation?, tier? })` | cities of a country, largest first |
| `getCity(geonameId)` | by GeoNames id |
| `getCityByUnlocode(code)` | by UN/LOCODE: `'DEHAM'` |
| `getPlaceByWikidataId(id)` | by Wikidata id: `'Q64'` |
| `parseLocation(text, { country?, tier? })` | `{ city, subdivision, country }` from text such as `'Berlin, Germany'` |
| `resolveCityTimezone({ city?, subdivision?, country? }, { tier? })` | `{ timezone, matchedBy, place }` |
| `findNearestCities(lat, lng, { country?, tier?, limit?, maxDistanceKm? })` | closest cities with `distanceKm` |
| `distanceKm(a, b)` | distance between two `{ lat, lng }` points (sync) |
| `preloadCities(codes, { tier? })` | loads countries in advance |
| `hasLocalities()` | `true` when `geodata-kit-localities` is installed |

### `geodata-kit/airports` (all async)

| Function | Returns |
|---|---|
| `getAirportByIata(code)` | `Airport` (name, iata, icao, country, admin1, lat, lng, timezone, cityId) |
| `getAirportByIcao(code)` | same, by ICAO code |
| `searchAirports(query, { country?, limit? })` | by code or name |
| `listAirports(code)` | airports of a country |

### `geodata-kit/shapes` (all async)

| Function | Returns |
|---|---|
| `getCountryAt(lat, lng)` | country code, or `null` at sea |
| `getSubdivisionAt(lat, lng)` | `{ country, iso, name, subdivision }` |

### `geodata-kit/address`

| Function | Returns |
|---|---|
| `getAddressFormat(code)` | lines and fields in envelope order, required and upper-case fields, local labels |
| `getRequiredAddressFields(code)` | `['addressLines', 'city', 'postalCode', …]` |
| `listRegions(code)` | regions used in addresses: `{ key, name, iso }` |
| `resolveRegion(value, code)` | region from a name, key or ISO code |
| `isValidRegion(value, code)` | `true` / `false` |
| `getPostalCodeRules(code)` | `{ pattern, layouts, examples, prefixes, label }` or `null` |
| `normalizePostalCode(value, code)` | canonical code, or `null` if invalid |
| `isValidPostalCode(value, code)` | `true` / `false` |
| `formatAddress(address, { from?, includeCountry?, latin? })` | address lines for an envelope |
| `parseAddress(text, { country? })` | async; `{ lines, postalCode, city, region, country, postalCheck }` |

### `geodata-kit/phone`

| Function | Returns |
|---|---|
| `parsePhoneNumber(text, defaultCountry?)` | `PhoneNumber` (e164, country, callingCode, nationalNumber, extension, type, isValid, isPossible) or `null` |
| `parsePhoneNumbers(text, defaultCountry?)` | all numbers in a text or JSON array |
| `isValidPhoneNumber(text, defaultCountry?)` | `true` / `false` |
| `isPossiblePhoneNumber(text, defaultCountry?)` | `true` when the length fits |
| `getPhoneNumberType(number, defaultCountry?)` | `'mobile'`, `'fixed_line'`, `'toll_free'`, … |
| `formatPhoneNumber(number, format?, defaultCountry?)` | format `'E164'`, `'INTERNATIONAL'` (default), `'NATIONAL'` or `'RFC3966'` |
| `getExamplePhoneNumber(code, type?)` | an example number of a type |
| `listPhoneRegions()` | regions with phone data |

All types (`Country`, `City`, `Subdivision`, `Airport`, `PhoneNumber`, …)
are exported for TypeScript.

## License

MIT. Data from GeoNames (CC BY 4.0), Unicode CLDR, IANA tzdata, Wikidata,
Natural Earth, libphonenumber and Google's address metadata; see `NOTICE`.
If you publish data taken from this package, credit GeoNames.
