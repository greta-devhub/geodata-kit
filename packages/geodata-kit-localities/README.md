# geodata-kit-localities

Adds 4.9 million villages, hamlets and city districts to
[geodata-kit](https://www.npmjs.com/package/geodata-kit), so small places
are found too. Node.js only.

```bash
npm install geodata-kit geodata-kit-localities
```

Once installed, `geodata-kit/cities` uses it automatically:

```ts
import { findCity, resolveCityTimezone } from 'geodata-kit/cities';

await findCity('Wollbach bei Bad Kissingen', { country: 'DE', tier: 'all' }); // a village
await findCity('Schwabing', { country: 'DE', tier: 'all' });                  // a Munich district
await resolveCityTimezone({ city: 'Wollbach bei Bad Kissingen', country: 'DE' }); // Europe/Berlin
```

## API

| Function | Returns |
|---|---|
| `loadLocalities(code)` | async; `{ tz, rows }` for a country, or `null`. Row: `[geonameId, name, asciiName, featureCode, population, lat, lng, admin1, admin2, admin3, admin4, tzIndex, parentId]` |
| `listLocalityCountries()` | countries with data |

Usually you don't call these: `findCity`, `searchCities`, `parseLocation` and
`resolveCityTimezone` from `geodata-kit/cities` use them.

MIT. Data from GeoNames (CC BY 4.0); see `NOTICE`.
