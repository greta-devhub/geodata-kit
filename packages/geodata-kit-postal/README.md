# geodata-kit-postal

Postal code → place, and place → postal codes, for 124 countries. Node.js only.

```bash
npm install geodata-kit-postal
```

```ts
import { findPlacesByPostalCode, findPostalCodes } from 'geodata-kit-postal';

await findPlacesByPostalCode('80331', 'DE');               // [{ name: 'München', … }]
await findPostalCodes({ city: 'Unterhaching', country: 'DE' }); // ['82008']
```

Installed next to [geodata-kit-address](https://www.npmjs.com/package/geodata-kit-address), it
also lets `parseAddress` check the city against the postal code and fix typos.
For the UK, Canada and the Netherlands only the first part of the code is
known ("SW1A", "K1A", "1234").

## API

| Function | Returns |
|---|---|
| `findPlacesByPostalCode(code, country)` | async; places `{ postalCode, name, subdivisionName, subdivisionCode, subdivision2Name, subdivision3Name, lat, lng }`. Prefixes such as `D-` and spacing are ignored |
| `findPostalCodes({ city, country, subdivision? })` | async; postal codes of a place |
| `isKnownPostalCode(code, country)` | async; `true` / `false` |
| `listPostalCountries()` | the 124 countries with data |
| `foldName(text)` | the name folding used for matching |

MIT. Data from GeoNames (CC BY 4.0); see `NOTICE`.
