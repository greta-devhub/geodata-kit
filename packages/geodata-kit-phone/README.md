# geodata-kit-phone

Parse, validate, classify and format phone numbers of every country.
Offline, typed, no dependencies, about 0.5 MB.

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

## API

Numbers without `+` need the country they are written in as `defaultCountry`.

| Function | Returns |
|---|---|
| `parsePhoneNumber(text, defaultCountry?)` | `PhoneNumber` (e164, country, callingCode, nationalNumber, extension, type, isValid, isPossible) or `null` |
| `parsePhoneNumbers(text, defaultCountry?)` | all numbers in a text or JSON array |
| `isValidPhoneNumber(text, defaultCountry?)` | `true` / `false` |
| `isPossiblePhoneNumber(text, defaultCountry?)` | `true` when the length fits |
| `getPhoneNumberType(number, defaultCountry?)` | `'mobile'`, `'fixed_line'`, `'toll_free'`, … |
| `formatPhoneNumber(number, format?, defaultCountry?)` | format `'E164'`, `'INTERNATIONAL'` (default), `'NATIONAL'` or `'RFC3966'` |
| `getExamplePhoneNumber(code, type?)` | an example number of a type |
| `listPhoneRegions()` | regions with phone data |

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
| **`geodata-kit-phone`** (this one) | parse, validate and format phone numbers | 0.5 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## License

MIT. The data comes with its own licences and credits, listed in `NOTICE`.
Keep `NOTICE` with the data when you redistribute it.
