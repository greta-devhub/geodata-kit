# geodata-kit-cities

237,000 cities of every country. Find a city in any spelling, parse free-text
locations and get the IANA timezone of a place. Offline and typed.

```bash
npm install geodata-kit-cities
```

`geodata-kit` and `geodata-kit-subdivisions` are installed with it. Add
`geodata-kit-localities` to also find villages and city districts.

```ts
import { findCity, parseLocation, resolveCityTimezone, findNearestCities } from 'geodata-kit-cities';

await findCity('München', { country: 'DE' });           // Munich
await findCity('Springfield', { country: 'US', subdivision: 'MO' });
await parseLocation('San Francisco, CA');  // { city, subdivision: California, country: 'US' }
await resolveCityTimezone({ city: 'Berlin, Germany' }); // Europe/Berlin
await findNearestCities(48.137, 11.575, { limit: 1 }); // [Munich]
```

`resolveCityTimezone` tries the city, then the biggest city of the given
subdivision, then the country's main timezone, and tells you which one it used
in `matchedBy`. For multi-timezone countries such as the US, pass the state as
`subdivision` when you have it.

Memory: about 30 MB with tier 15000 and about 220 MB with tier 500 when every
country is loaded; countries you never ask for cost nothing.

## API

All functions are async: each country's data loads the first time it is used.
`tier` is the minimum city size: `15000` (34,000 cities), `5000` (70,000),
`1000` (172,000) or `500` (237,000, default). `'all'` adds the villages of
`geodata-kit-localities` when that package is installed.

| Function | Returns |
|---|---|
| `findCity(name, { country, subdivision?, tier? })` | best matching `City` (name, asciiName, country, admin1–4, population, lat, lng, timezone, featureCode, unlocode, wikidataId, alternateNames) |
| `searchCities(query, { country?, subdivision?, minPopulation?, tier?, limit? })` | cities starting with the query |
| `listCities({ country, subdivision?, minPopulation?, tier? })` | cities of a country, largest first |
| `getCity(geonameId)` | by place id (`geonameId` of a `City`) |
| `getCityByUnlocode(code)` | by UN/LOCODE: `'DEHAM'` |
| `getPlaceByWikidataId(id)` | by Wikidata id: `'Q64'` |
| `parseLocation(text, { country?, tier? })` | `{ city, subdivision, country }` from text such as `'Berlin, Germany'` |
| `resolveCityTimezone({ city?, subdivision?, country? }, { tier? })` | `{ timezone, matchedBy, place }` |
| `findNearestCities(lat, lng, { country?, tier?, limit?, maxDistanceKm? })` | closest cities with `distanceKm` |
| `distanceKm(a, b)` | distance between two `{ lat, lng }` points (sync) |
| `preloadCities(codes, { tier? })` | loads countries in advance |
| `hasLocalities()` | `true` when `geodata-kit-localities` is installed |

## The geodata-kit family

Install only the parts you need. All packages share one version number and work offline.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 1.5 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 24 MB |
| **`geodata-kit-cities`** (this one) | 237,000 cities, free-text locations, city timezones | 27 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| [`geodata-kit-shapes`](https://www.npmjs.com/package/geodata-kit-shapes) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.5 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.5 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## License

MIT. The data comes with its own licences and credits, listed in `NOTICE`.
Keep `NOTICE` with the data when you redistribute it.
