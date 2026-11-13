# geodata-kit

Countries for TypeScript and JavaScript: names in 8 languages, free-text
resolution, search, groups, languages, timezones and currencies. Offline,
typed, no dependencies, about 1.5 MB.

```bash
npm install geodata-kit
```

```ts
import { resolveCountry, getCountryName, getNationalLanguages, getCountriesInGroup } from 'geodata-kit';

resolveCountry('Deutschland')?.code;                     // 'DE'
getCountryName('CH', 'fr');                              // 'Suisse'
getNationalLanguages('CH').map((l) => l.code);           // ['de', 'fr', 'it', 'gsw']
getCountriesInGroup('dach');                             // ['AT', 'CH', 'DE', 'LI']
```

## The geodata-kit family

Install only the parts you need. All packages share one version number and work offline.

| Package | For | Size |
|---|---|---|
| **`geodata-kit`** (this one) | countries, names, search, groups (EU, DACH, …), languages, timezones, currencies | 1.5 MB |
| [`geodata-kit-subdivisions`](https://www.npmjs.com/package/geodata-kit-subdivisions) | states, provinces, cantons and the levels below | 24 MB |
| [`geodata-kit-cities`](https://www.npmjs.com/package/geodata-kit-cities) | 237,000 cities, free-text locations, city timezones | 27 MB |
| [`geodata-kit-airports`](https://www.npmjs.com/package/geodata-kit-airports) | airports by IATA / ICAO code | 1 MB |
| [`geodata-kit-shapes`](https://www.npmjs.com/package/geodata-kit-shapes) | which country or region a coordinate is in | 10 MB |
| [`geodata-kit-address`](https://www.npmjs.com/package/geodata-kit-address) | address formats, required fields, postal-code rules | 0.5 MB |
| [`geodata-kit-phone`](https://www.npmjs.com/package/geodata-kit-phone) | parse, validate and format phone numbers | 0.5 MB |
| [`geodata-kit-localities`](https://www.npmjs.com/package/geodata-kit-localities) | 4.9 million villages and city districts (used by geodata-kit-cities) | 83 MB |
| [`geodata-kit-postal`](https://www.npmjs.com/package/geodata-kit-postal) | postal code → place lookups | 19 MB |
| [`geodata-kit-tz`](https://www.npmjs.com/package/geodata-kit-tz) | exact timezone for any coordinate | 7.5 MB |

## Countries

```ts
import { getCountry, resolveCountry, searchCountries, formatCountry, getCurrency } from 'geodata-kit';

getCountry('DE');                          // { name: 'Germany', alpha3: 'DEU', capital: 'Berlin', callingCode: '49', flag: '🇩🇪', … }
resolveCountry('UK')?.code;                // 'GB' — names in many languages, aliases, alpha-3 codes
resolveCountry('Congo');                   // null — ambiguous, see suggestCountries()
searchCountries('osterr', { locale: 'de' }); // [Österreich] — for country pickers
formatCountry('DE', { withCode: true });   // 'Germany (DE)'
getCurrency('BG');                         // 'EUR'
```

## Groups and regions

```ts
import { getCountriesInGroup, isInGroup, expandGroups, getContinent } from 'geodata-kit';

getCountriesInGroup('dach');               // ['AT', 'CH', 'DE', 'LI']
isInGroup('GB', 'eu', { at: '2019-06-01' }); // true — membership by date
expandGroups(['benelux', 'FR']);           // ['BE', 'LU', 'NL', 'FR']
getContinent('DE')?.name;                  // 'Europe'
```

Groups: continents (`continent_europe`, …), UN regions (`un_western_europe`, …),
`eu`, `eurozone`, `schengen`, `eea`, `efta`, `dach`, `benelux`, `nordic`,
`baltic`, `cee`, `eastern_europe`, `emea`, `mena`, `apac`, `north_america`,
`latin_america`, `caribbean`, `central_asia`.

## Languages

```ts
import { getNationalLanguages, getPrimaryLanguage, getLanguagesOfSubdivision, resolveLanguage, getLanguageName } from 'geodata-kit';

getPrimaryLanguage('BE');                  // 'nl'
getLanguagesOfSubdivision('ES-CT');        // Spanish, Catalan, Occitan (most spoken first)
resolveLanguage('Deutsch');                // 'de'
getLanguageName('de', 'fr');               // 'allemand'
```

## Timezones

```ts
import { getCountryTimezones, getPrimaryTimezone, canonicalTimezone } from 'geodata-kit';

getCountryTimezones('DE');                 // ['Europe/Berlin', 'Europe/Busingen']
getPrimaryTimezone('US');                  // 'America/New_York'
canonicalTimezone('Europe/Kiev');          // 'Europe/Kyiv'
```

## API reference

`code` is an ISO 3166-1 alpha-2 country code ("DE"); most functions also
accept lower case. Options are optional unless shown without `?`.

### Countries

| Function | Returns |
|---|---|
| `getCountry(code)` | `Country` (name, alpha3, numeric, capital, area, population, continent, tld, callingCode, currencies, neighbours, timezones, demonym, drivingSide, weekStart, weekend, measurementSystem, paperSize, flag) or `null` |
| `listCountries({ group?, continent?, language?, currency? })` | all countries, optionally filtered |
| `isCountryCode(value)` | `true` for a known code in upper case |
| `normalizeCountryCode(value)` | `'DE'` for `' de '`, `null` if unknown |
| `normalizeCountryCodes(values)` | `{ codes, invalid }` |
| `COUNTRY_CODE_PATTERN` | regex for two letters |
| `getSuccessorCodes(retiredCode)` | codes that replaced a retired one: `'CS'` → `['RS', 'ME']` |
| `resolveCountry(text)` | `{ code, matchedBy, input }` from a name in many languages, alias, alpha-2/3 or numeric code; `null` if unknown or ambiguous |
| `resolveCountries(texts)` | `{ resolved: Map, unresolved: string[] }` for a whole list |
| `suggestCountries(text, limit?)` | likely countries for a typo or ambiguous name |
| `getCountryName(code, locale?)` | name in en, de, fr, es, it, nl, pt or pl |
| `getCountryAliases(code)` | other names: `['Deutschland', 'BRD', …]` |
| `formatCountry(code, { locale?, withCode?, upperCase? })` | `'Germany'`, `'Germany (DE)'`, `'GERMANY'` |
| `searchCountries(query, { groups?, locale?, limit? })` | ranked matches for a country picker |
| `sortCountries(countries, locale?)` | sorted by localised name |
| `getCurrency(code)` | main currency today: `'EUR'` |
| `getCurrencies(code, { at?, includeNonTender? })` | currencies on a date, with `from` / `to` |
| `getCallingCode(code)` | `'49'` |
| `getCountriesByCallingCode(callingCode)` | `'1'` → US, CA, … |
| `getTld(code)` | `'.de'` |
| `getCapital(code)` | `'Berlin'` |
| `getArea(code)` | km² |
| `getPopulation(code)` | inhabitants |
| `getNeighbours(code)` | bordering countries |
| `getDemonym(code)` | `'German'` |
| `getWeekStart(code)` | `'mon'`, `'sun'`, … |
| `getMeasurementSystem(code)` | `'metric'`, `'US'` or `'UK'` |
| `getPaperSize(code)` | `'A4'` or `'US-Letter'` |
| `getDrivingSide(code)` | `'left'` or `'right'` |
| `getFlagEmoji(code)` | `'🇩🇪'` |


### Groups and regions

| Function | Returns |
|---|---|
| `listGroups(kind?)` | groups; kind is `'continent'`, `'un'`, `'political'` or `'business'` |
| `getGroup(slug)` | one group with members and dates |
| `getCountriesInGroup(slug, { at? })` | member codes on a date (default today) |
| `getGroupsOfCountry(code, { at?, kind? })` | groups a country belongs to |
| `isInGroup(code, slug, { at? })` | `true` / `false` |
| `expandGroups(items, { at? })` | codes from a mix of group slugs, codes and names |
| `listContinents()` | the 7 continents |
| `getContinent(code)` | `{ code, name, slug }` |
| `getM49Region(code)` | UN region, sub-region, intermediate region, groupings |

### Languages

| Function | Returns |
|---|---|
| `getNationalLanguages(code)` | official and de facto languages, most spoken first |
| `getPrimaryLanguage(code)` | first official language: `'de'` |
| `getCountryLanguages(code, { minShare?, status? })` | every language spoken, with share, speakers and status |
| `getRegionalLanguages(code)` | languages official in part of the country, with their subdivisions |
| `getLanguagesOfSubdivision(iso)` | official languages of a subdivision: `'ES-CT'` |
| `getCountriesByLanguage(language, { status?, minShare? })` | countries where a language is used |
| `isOfficialLanguage(language, code, { subdivision? })` | `true` / `false` |
| `getDefaultLocale(code)` | `'de-CH'` |
| `resolveLanguage(text)` | code from a name or code: `'Deutsch'`, `'ger'`, `'de-CH'` → `'de'` |
| `getLanguageName(code, locale?)` | `'allemand'`; locale `'endonym'` for the language's own name |
| `getLanguageScripts(code)` | `['Cyrl', 'Latn']` |

### Timezones

| Function | Returns |
|---|---|
| `getCountryTimezones(code)` | IANA zones of a country |
| `getPrimaryTimezone(code)` | zone of the largest city |
| `isTimezone(value)` | `true` for current and old IANA names |
| `canonicalTimezone(value)` | current name: `'Europe/Kiev'` → `'Europe/Kyiv'` |
| `listTimezones()` | all IANA zones |

### Text helpers

The same helpers every lookup in the family uses.

| Function | Returns |
|---|---|
| `fold(text)` | lower case, no accents or punctuation: `'São Paulo'` → `'sao paulo'` |
| `cleanText(text)` | trimmed text with normalised Unicode and single spaces |
| `editDistance(a, b, max)` | number of edits between two strings, `max + 1` when above `max` |

All types (`Country`, `CountryMatch`, `Group`, `CountryLanguage`, …) are exported for TypeScript.

## License

MIT. The data comes with its own licences and credits, listed in `NOTICE`.
Keep `NOTICE` with the data when you redistribute it.
