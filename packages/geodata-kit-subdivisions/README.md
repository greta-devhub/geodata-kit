# geodata-kit-subdivisions

States, provinces, cantons and Länder of every country, and the levels
below them, with ISO 3166-2 codes, local names and free-text resolution.
Offline and typed.

```bash
npm install geodata-kit-subdivisions
```

`geodata-kit` (countries) is installed with it.

```ts
import { resolveSubdivision, listSubdivisions, findSubdivision, getSubdivisionChain } from 'geodata-kit-subdivisions';

resolveSubdivision('Bayern', 'DE')?.iso;   // 'DE-BY'
listSubdivisions('CH').length;             // 26
await findSubdivision('Oberbayern', 'DE'); // a level-2 region
await getSubdivisionChain({ country: 'DE', subdivision1: '02', subdivision2: '091', subdivision3: '09184', subdivision4: '09184148' });
// Bavaria → Upper Bavaria → Landkreis München → Unterhaching
```

## API

Level 1 = states, provinces, cantons, Länder (loaded with the package). Levels
2–4 are the divisions below; each country's data loads on first use, so those
functions are async.

| Function | Returns |
|---|---|
| `listSubdivisions(code)` | level-1 subdivisions of a country |
| `getSubdivision(isoOrKey)` | by ISO 3166-2 code (`'DE-BY'`) or internal key (`'DE.02'`) |
| `resolveSubdivision(text, code?)` | from a name, local name, abbreviation or ISO code |
| `isSubdivisionCode(value)` | `true` for a valid ISO 3166-2 code |
| `getSubdivisionName(iso)` | English name of any ISO 3166-2 code |
| `loadSubdivisions(code, { level?, parent? })` | async; any level, optionally under a parent |
| `findSubdivision(text, code, { level? })` | async; by name on any level |
| `getSubdivisionChain(place)` | async; level 1 down to 4 for a city or other place |

## The geodata-kit family

Install only the parts you need. All packages work offline and are released
together under one version number: keep the ones you install on the same version.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 2 MB |
| **`geodata-kit-subdivisions`** (this one) | states, provinces, cantons and the levels below | 27 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 36 MB |
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

Code: MIT. Data: CC BY 4.0 and Unicode License v3.
CC BY 4.0 asks for credit: if you show or redistribute the data, include the
credits from `NOTICE`.
