# geodata-kit-tz

The exact timezone for any coordinate. Works in Node.js and browsers.

```bash
npm install geodata-kit-tz
```

```ts
import { getTimezoneAt } from 'geodata-kit-tz';

await getTimezoneAt(39.77, -86.16);   // 'America/Indiana/Indianapolis'
await getTimezoneAt(0, -30);          // 'Etc/GMT+2' (at sea)
```

## API

| Function | Returns |
|---|---|
| `getTimezoneAt(lat, lng)` | async; IANA zone, or `Etc/GMT±N` at sea; `null` for invalid coordinates (not a number, latitude outside ±90). Longitudes wrap around |
| `getTimezonesAt(lat, lng)` | async; all zones at the point (a few areas overlap), most specific first; empty for invalid coordinates |
| `listPolygonTimezones()` | async; every zone in the data |
| `nauticalTimezone(lng)` | `Etc/GMT±N` for a longitude |

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
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| **`geodata-kit-tz`** (this one) | exact timezone for any coordinate | 7.5 MB |

## Data

The data is refreshed about once a month, and each release says so in its
changelog. `DATA_DATE` tells you how fresh the installed version is.

| Constant | Value |
|---|---|
| `DATA_DATE` | date of the data in this version, for example `'2026-11-12'` |

## License

Code: MIT. Data: Open Database License (ODbL) 1.0, which asks for credit and
shares adapted data under the same licence. The credit text and the licence
are in `NOTICE` and `LICENSE-DATA`.
