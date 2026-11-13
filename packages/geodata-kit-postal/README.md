# geodata-kit-postal

Postal code → place, and place → postal codes, for 124 countries. Node.js only.

```bash
npm install geodata-kit-postal
```

```ts
import { findPlacesByPostalCode, findPostalCodes } from 'geodata-kit-postal';

await findPlacesByPostalCode('80331', 'DE');               // [{ name: 'München', … }]
await findPlacesByPostalCode('2134', 'US');                // the places of 02134
await findPostalCodes({ city: 'Unterhaching', country: 'DE' }); // ['82008']
```

Installed next to [geodata-kit-address](https://www.npmjs.com/package/geodata-kit-address), it
also lets `parseAddress` check the city against the postal code and fix typos.
For the UK, Canada and the Netherlands only the first part of the code is
known ("SW1A", "K1A", "1234").

Places are stored under their local name. With
[geodata-kit-cities](https://www.npmjs.com/package/geodata-kit-cities) installed,
`findPostalCodes` also accepts a city name in another language:
`{ city: 'Munich', country: 'DE' }` finds the codes of München.

## API

| Function | Returns |
|---|---|
| `findPlacesByPostalCode(code, country)` | async; places `{ postalCode, name, subdivisionName, subdivisionCode, subdivision2Name, subdivision3Name, lat, lng }`. Prefixes such as `D-` and spacing are ignored. Up to two leading zeros lost in a spreadsheet are restored where all codes are digits of one length (`'2134'` → `02134` in the US) |
| `findPostalCodes({ city, country, subdivision? })` | async; postal codes of a place, by its local name (or any of its names when `geodata-kit-cities` is installed) |
| `isKnownPostalCode(code, country)` | async; `true` / `false` |
| `listPostalCountries()` | the 124 countries with data |
| `foldName(text)` | the name folding used for matching |

## The geodata-kit family

Install only the parts you need. All packages work offline and are released
together under one version number: keep the ones you install on the same version.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 2 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 27 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 36 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| [`geodata-kit-shapes`](https://www.npmjs.com/package/geodata-kit-shapes) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.6 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.6 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| **`geodata-kit-postal`** (this one) | postal code → place lookups | 19 MB |
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
