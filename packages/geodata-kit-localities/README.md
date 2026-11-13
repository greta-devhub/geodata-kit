# geodata-kit-localities

Adds 4.9 million villages, hamlets and city districts to
[geodata-kit-cities](https://www.npmjs.com/package/geodata-kit-cities), so small places
are found too. Node.js only.

```bash
npm install geodata-kit-cities geodata-kit-localities
```

Once installed, `geodata-kit-cities` uses it automatically:

```ts
import { findCity, resolveCityTimezone } from 'geodata-kit-cities';

await findCity('Wollbach bei Bad Kissingen', { country: 'DE', tier: 'all' }); // a village
await findCity('Schwabing', { country: 'DE', tier: 'all' });                  // a Munich district
await resolveCityTimezone({ city: 'Wollbach bei Bad Kissingen', country: 'DE' }); // Europe/Berlin
```

## API

| Function | Returns |
|---|---|
| `loadLocalities(code)` | async; `{ tz, rows }` for a country, or `null`. Row: `[geonameId, name, asciiName, featureCode, population, lat, lng, admin1, admin2, admin3, admin4, tzIndex, parentId]` |
| `listLocalityCountries()` | countries with data |

Usually you don't call these: `findCity`, `searchCities`, `parseLocation` and
`resolveCityTimezone` from `geodata-kit-cities` use them.

## The geodata-kit family

Install only the parts you need. All packages share one version number and work offline.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 1.5 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 24 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 27 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| [`geodata-kit-shapes`](https://www.npmjs.com/package/geodata-kit-shapes) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.5 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.5 MB |
| **`geodata-kit-localities`** (this one) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## License

MIT. The data comes with its own licences and credits, listed in `NOTICE`.
Keep `NOTICE` with the data when you redistribute it.
