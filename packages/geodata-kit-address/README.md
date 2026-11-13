# geodata-kit-address

Address formats, required fields, regions and postal-code rules for every
country, plus address formatting and parsing. Offline and typed.

```bash
npm install geodata-kit-address
```

`geodata-kit` (countries) is installed with it.

```ts
import { getRequiredAddressFields, normalizePostalCode, formatAddress, parseAddress } from 'geodata-kit-address';

getRequiredAddressFields('US');            // ['addressLines', 'city', 'region', 'postalCode']
normalizePostalCode('sw1a1aa', 'GB');      // 'SW1A 1AA'
formatAddress({ line1: 'Hauptstr. 1', postalCode: '80331', city: 'München', country: 'DE' }, { from: 'CH' });
// ['Hauptstr. 1', '80331 München', 'GERMANY']
await parseAddress('Hauptstr. 1, D-80331 München, Deutschland');
// { lines: ['Hauptstr. 1'], postalCode: '80331', city: 'München', country: 'DE', … }
await parseAddress('1 Market St, San Francisco, CA 94103');
// { lines: ['1 Market St'], city: 'San Francisco', region: 'CA', postalCode: '94103', country: 'US', … }
```

Every function takes the country as a code or a name (`'DE'`, `'Germany'`,
`'Deutschland'`). For a country it does not know, a function returns `null`
or an empty list; none of them throws.

## Parsing

`parseAddress` reads one-line and multi-line addresses. It needs to know the
country, and takes it from the first of these that it finds:

1. the `country` option;
2. a country name on the last line (`…, Deutschland`);
3. a postal prefix in front of a valid code (`CH-8001 Zürich`, `D-80331 München`);
4. a region next to a postal code from that region's range
   (`San Francisco, CA 94103` → US, `Ottawa ON K1M 1M4` → CA).

A bare postal code is not enough (`80331` fits many countries): without one
of the four, every field is `null` and `lines` holds the input.

Optional packages make it better:

- With `geodata-kit-postal` installed, the city is checked against the postal
  code, near-spellings are fixed ("Muenchn" → "München") and an upper-case
  city from an envelope line gets its normal spelling back.
- Text without separators (`350 Fifth Avenue New York NY 10118`) needs
  `geodata-kit-postal` or `geodata-kit-cities` to tell the street from the
  city. Without them the street stays in `city`.

## Postal codes

`isValidPostalCode` and `normalizePostalCode` check more than the shape where
the data knows more:

- the country's pattern, including first digits where it has them (a Dutch
  code cannot start with 0);
- for Andorra, Argentina, Australia, India, Japan, Mexico, South Korea, Spain,
  Ukraine and the United States, the number ranges of the regions (Spain: 01
  to 52);
- forms that are no longer in use where the data marks them (Armenia's old
  six digits).

For most other countries only the shape is known: `99999` passes for Germany
although no such code exists. To check that a code exists, use
`isKnownPostalCode` from `geodata-kit-postal`.

## API

| Function | Returns |
|---|---|
| `getAddressFormat(country)` | lines and fields in envelope order, required and upper-case fields, local labels |
| `getRequiredAddressFields(country)` | `['addressLines', 'city', 'postalCode', …]` |
| `listRegions(country)` | regions used in addresses: `{ key, name, latinName?, aliases?, iso?, postalPattern? }` |
| `resolveRegion(value, country)` | region from a key, ISO code or name: local, Latin or English (`'Rome'` → RM, `'Washington, D.C.'` → DC), with or without the kind of region (`'County Dublin'`, `'Dublin'` → `Co. Dublin`) |
| `isValidRegion(value, country)` | `true` / `false` |
| `getPostalCodeRules(country)` | `{ pattern, layouts, examples, prefixes, label }` or `null`; `pattern` is the shape only |
| `normalizePostalCode(value, country)` | canonical code, or `null` if invalid |
| `isValidPostalCode(value, country)` | `true` / `false` |
| `formatAddress(address, { from?, includeCountry?, latin? })` | address lines for an envelope; `[]` for an unknown country |
| `parseAddress(text, { country? })` | async; `{ lines, postalCode, city, region, country, postalCheck }` |

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
| **`geodata-kit-address`** (this one) | address formats, required fields, postal-code rules | 0.6 MB |
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
