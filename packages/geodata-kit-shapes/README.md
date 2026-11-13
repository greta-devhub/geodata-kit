# geodata-kit-shapes

Which country, and which state or province, a coordinate is in. Offline
point-in-polygon lookup with no dependencies.

```bash
npm install geodata-kit-shapes
```

```ts
import { getCountryAt, getSubdivisionAt } from 'geodata-kit-shapes';

await getCountryAt(47.56, 7.59);         // 'CH'
await getCountryAt(41.0082, 28.9784);    // 'TR' (Istanbul, on the coast)
await getCountryAt(0, -30);              // null (open sea)
await getSubdivisionAt(48.137, 11.575);  // { country: 'DE', iso: 'DE-BY', code: '02', name: 'Bavaria' }
```

Accuracy:

- Boundaries are simplified to a few hundred metres, so a point very close to
  a border can land on the wrong side.
- A point up to 5 km off the coast (`NEAR_COAST_KM`) counts as the nearest
  land, so harbours, piers and small islands of coastal cities resolve.
  Farther out the result is `null`.
- Where shapes overlap, the smallest wins, so enclaves such as San Marino and
  Lesotho resolve. Vatican City is stored as a marker and covers 500 m around
  it (`MARKER_KM`).
- Not covered: tiny enclaves such as Baarle-Hertog and Büsingen (they return
  the surrounding country), and the northern edge of Gibraltar.
- Invalid coordinates (not a number, latitude outside ±90) return `null`.
  Longitudes wrap around, so 190 is the same as -170.

For exact timezones use `geodata-kit-tz`.

## API

Both functions are async: the boundaries load on first use.

| Function | Returns |
|---|---|
| `getCountryAt(lat, lng)` | ISO alpha-2 country code, or `null` at sea |
| `getSubdivisionAt(lat, lng)` | `{ country, iso, code, name }` of the state or province: ISO 3166-2 code, level-1 code and English name; `null` at sea |
| `NEAR_COAST_KM` | `5`: how far off the coast a point still counts as land |
| `MARKER_KM` | `0.5`: the distance a marker for a very small territory covers |

## The geodata-kit family

Install only the parts you need. All packages work offline and are released
together under one version number: keep the ones you install on the same version.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 2 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 27 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 36 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| **`geodata-kit-shapes`** (this one) | which country or region a coordinate is in | 10 MB |
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
