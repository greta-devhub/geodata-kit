# geodata-kit-cities

237,000 cities of every country. Find a city by its name in many languages,
parse free-text locations and get the IANA timezone of a place. Offline and
typed.

```bash
npm install geodata-kit-cities
```

`geodata-kit` and `geodata-kit-subdivisions` are installed with it. Add
`geodata-kit-localities` to also find villages and city districts.

```ts
import { findCity, parseLocation, resolveCityTimezone, findNearestCities } from 'geodata-kit-cities';

await findCity('München', { country: 'DE' });           // Munich
await findCity('Москва');                               // Moscow
await findCity('Springfield', { country: 'US', subdivision: 'MO' });
await parseLocation('San Francisco, CA');  // { city, subdivision: California, country: 'US' }
await parseLocation('Greater Munich Metropolitan Area'); // { city: Munich, …, country: 'DE' }
await resolveCityTimezone({ city: 'Berlin, Germany' }); // Europe/Berlin
await findNearestCities(48.137, 11.575, { limit: 1 }); // [Munich]
```

`resolveCityTimezone` tries the city, then the biggest city of the given
subdivision, then the country's main timezone, and tells you which one it used
in `matchedBy`. For multi-timezone countries such as the US, pass the state as
`subdivision` when you have it.

Names: every city is known by its own name, its name in English, German,
French, Spanish, Italian, Dutch, Portuguese and Polish, and its names in the
languages of its country, in any script (`Москва`, `Αθήνα`, `東京`). Cities over
15,000 inhabitants are also known in Arabic, Bengali, Chinese, Greek, Hebrew,
Hindi, Japanese, Korean, Persian, Russian, Thai and Ukrainian. Other languages
are not covered.

Without a country, `findCity`, `parseLocation` and `resolveCityTimezone` take
the biggest city of that name worldwide among cities over 15,000 inhabitants:
`'Berlin'`, `'New York'`, `'NYC'`, `'Greater London'` and `'Bay Area'` all
resolve. A country name wins over a city name: `parseLocation('Luxembourg')`
gives the country with `city: null`. Pass the country whenever you know it.

Memory: about 30 MB with tier 15000 and about 220 MB with tier 500 when every
country is loaded; countries you never ask for cost nothing.

## API

All functions are async: each country's data loads the first time it is used.
`tier` is the minimum city size: `15000` (34,000 cities), `5000` (70,000),
`1000` (172,000) or `500` (237,000, default). `'all'` adds the villages of
`geodata-kit-localities` when that package is installed.

| Function | Returns |
|---|---|
| `findCity(name, { country?, subdivision?, tier? })` | best matching `City` (name, asciiName, country, subdivision1–4, population, lat, lng, timezone, featureCode, unlocode, wikidataId, alternateNames) |
| `searchCities(query, { country?, subdivision?, minPopulation?, tier?, limit? })` | cities whose name, or a word in it, starts with the query, ranked by size and closeness of the match (an exact name counts ten times). Without a country it searches cities over 15,000 inhabitants and is instant; with `tier` and no country it loads every country, which takes seconds and about 450 MB |
| `listCities({ country, subdivision?, minPopulation?, tier? })` | cities of a country, largest first |
| `getCity(geonameId)` | by place id (`geonameId` of a `City`) |
| `getCityByUnlocode(code)` | by UN/LOCODE: `'DEHAM'` |
| `getPlaceByWikidataId(id)` | by Wikidata id: `'Q64'` |
| `parseLocation(text, { country?, tier? })` | `{ city, subdivision, country }` from text such as `'Berlin, Germany'`, `'San Francisco, CA'`, `'Berlin'` or `'Greater London'` |
| `resolveCityTimezone({ city?, subdivision?, country? }, { tier? })` | `{ timezone, matchedBy, place }` |
| `findNearestCities(lat, lng, { country?, tier?, limit?, maxDistanceKm? })` | closest cities with `distanceKm` |
| `distanceKm(a, b)` | distance between two `{ lat, lng }` points (sync) |
| `preloadCities(codes, { tier? })` | loads countries in advance |
| `hasLocalities()` | `true` when `geodata-kit-localities` is installed |

## The geodata-kit family

Install only the parts you need. All packages work offline and are released
together under one version number: keep the ones you install on the same version.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 2 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 27 MB |
| **`geodata-kit-cities`** (this one) | 237,000 cities, free-text locations, city timezones | 36 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| [`geodata-kit-shapes`](https://www.npmjs.com/package/geodata-kit-shapes) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.6 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.6 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## Data

The data is refreshed about once a month, and each release says so in its
changelog. `DATA_DATE` tells you how fresh the installed version is.

| Constant | Value |
|---|---|
| `DATA_DATE` | date of the data in this version, for example `'2026-11-12'` |

## License

Code: MIT. Data: CC BY 4.0, which asks for credit: if you show or
redistribute the data, include the credits from `NOTICE`.
