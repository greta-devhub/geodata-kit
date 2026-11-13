# geodata-kit-airports

10,500 airports with an IATA or ICAO code: country, coordinates, timezone and
the city they serve. Offline and typed.

```bash
npm install geodata-kit-airports
```

`geodata-kit` (countries) is installed with it.

```ts
import { getAirportByIata, getAirportByIcao, searchAirports } from 'geodata-kit-airports';

await getAirportByIata('MUC');   // { name: 'Munich International Airport', icao: 'EDDM', country: 'DE', timezone: 'Europe/Berlin', cityId: 2867714, … }
await getAirportByIcao('EGLL');  // London Heathrow
await searchAirports('Heathrow', { limit: 1 });
```

`cityId` is the place id (`geonameId`) of the city served; with `geodata-kit-cities`
installed, `getCity(cityId)` returns it.

## API

All functions are async: the data loads on first use.

| Function | Returns |
|---|---|
| `getAirportByIata(code)` | `Airport` (geonameId, name, iata, icao, country, subdivision1, lat, lng, timezone, cityId) |
| `getAirportByIcao(code)` | same, by ICAO code |
| `searchAirports(query, { country?, limit? })` | by code or name |
| `listAirports(code)` | airports of a country |

## The geodata-kit family

Install only the parts you need. All packages work offline and are released
together under one version number: keep the ones you install on the same version.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 2 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 27 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 36 MB |
| **`geodata-kit-airports`** (this one) | airports by IATA / ICAO code | 1 MB |
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
