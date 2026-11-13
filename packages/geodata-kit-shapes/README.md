# geodata-kit-shapes

Which country, and which state or province, a coordinate is in. Offline
point-in-polygon lookup with no dependencies.

```bash
npm install geodata-kit-shapes
```

```ts
import { getCountryAt, getSubdivisionAt } from 'geodata-kit-shapes';

await getCountryAt(47.56, 7.59);         // 'CH'
await getCountryAt(0, -30);              // null (at sea)
await getSubdivisionAt(48.137, 11.575);  // { country: 'DE', iso: 'DE-BY', code: '02', name: 'Bavaria' }
```

Boundaries are simplified to a few hundred metres, so a point very close to a
border can land on the wrong side. For exact timezones use `geodata-kit-tz`.

## API

Both functions are async: the boundaries load on first use.

| Function | Returns |
|---|---|
| `getCountryAt(lat, lng)` | ISO alpha-2 country code, or `null` at sea |
| `getSubdivisionAt(lat, lng)` | `{ country, iso, code, name }` of the state or province: ISO 3166-2 code, GeoNames code and English name; `null` at sea |

## The geodata-kit family

Install only the parts you need. All packages share one version number and work offline.

| Package | For | Size |
|---|---|---|
| [`geodata-kit`](https://www.npmjs.com/package/geodata-kit) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 1.5 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 24 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 27 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| **`geodata-kit-shapes`** (this one) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.5 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.5 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## License

MIT. Boundaries from Natural Earth (public domain), names from GeoNames (CC BY 4.0); see `NOTICE`.
