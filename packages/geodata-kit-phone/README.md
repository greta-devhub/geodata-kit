# geodata-kit-phone

Parse, validate, classify and format phone numbers of every country.
Offline, typed, no dependencies.

```bash
npm install geodata-kit-phone
```

```ts
import { parsePhoneNumber, parsePhoneNumbers, formatPhoneNumber, getPhoneNumberType } from 'geodata-kit-phone';

parsePhoneNumber('089 1234567', 'DE');             // { e164: '+49891234567', country: 'DE', type: 'fixed_line', isValid: true, … }
parsePhoneNumber('+49 (0)89 1234567')?.e164;       // '+49891234567'
parsePhoneNumbers('+49 89 1234567, 030 987654321', 'DE'); // two numbers
getPhoneNumberType('+49 1512 3456789');            // 'mobile'
formatPhoneNumber('+12125550123', 'NATIONAL');     // '(212) 555-0123'
```

What you get:

- Number types for every country (mobile, fixed line, toll free, premium
  rate, …), not only valid or invalid.
- Results are plain objects, so you can store them or send them as JSON.
- `parsePhoneNumbers` splits a field that holds several numbers.
- About 49 KB gzipped in a browser bundle. If you only need to know whether a
  number is valid and bundle size matters most, a library with reduced
  metadata is smaller.

## API

Numbers without `+` need the country they are written in as `defaultCountry`.

| Function | Returns |
|---|---|
| `parsePhoneNumber(text, defaultCountry?)` | `PhoneNumber` (e164, country, callingCode, nationalNumber, extension, type, isValid, isPossible) or `null` |
| `parsePhoneNumbers(text, defaultCountry?)` | the numbers of a list: separated by commas, semicolons, `|`, ` / ` or line breaks, or a JSON array. It does not look for numbers inside a sentence |
| `isValidPhoneNumber(text, defaultCountry?)` | `true` / `false` |
| `isPossiblePhoneNumber(text, defaultCountry?)` | `true` when the length fits |
| `getPhoneNumberType(number, defaultCountry?)` | `'mobile'`, `'fixed_line'`, `'toll_free'`, … |
| `formatPhoneNumber(number, format?, defaultCountry?)` | format `'E164'`, `'INTERNATIONAL'` (default), `'NATIONAL'` or `'RFC3966'` |
| `getExamplePhoneNumber(code, type?)` | an example number of a type |
| `listPhoneRegions()` | regions with phone data |

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
| **`geodata-kit-phone`** (this one) | parse, validate and format phone numbers | 0.6 MB |
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

Code: MIT. Data: Apache 2.0. Keep `NOTICE` with the data when you
redistribute it.
