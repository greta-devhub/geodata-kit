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
| `getTimezoneAt(lat, lng)` | async; IANA zone, or `Etc/GMT±N` at sea |
| `getTimezonesAt(lat, lng)` | async; all zones at the point (a few areas overlap), most specific first |
| `listPolygonTimezones()` | async; every zone in the data |
| `nauticalTimezone(lng)` | `Etc/GMT±N` for a longitude |

Code: MIT. Data: © OpenStreetMap contributors, Open Database License (ODbL);
see `LICENSE-DATA`. Credit OpenStreetMap when you show results.
