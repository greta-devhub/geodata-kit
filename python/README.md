# geodata-kit

Countries, regions, cities, languages, timezones, addresses and phone numbers
for Python, offline and with no dependencies.

```bash
pip install geodata-kit
pip install "geodata-kit[localities,postal]"   # optional: villages, postal codes
```

```python
from geodata_kit import resolve_country, get_country_name, resolve_city_timezone, normalize_postal_code, parse_phone_number

resolve_country("Deutschland").code                            # 'DE'
get_country_name("CH", "fr")                                   # 'Suisse'
resolve_city_timezone({"city": "München", "country": "DE"})["timezone"]  # 'Europe/Berlin'
normalize_postal_code("sw1a1aa", "GB")                         # 'SW1A 1AA'
parse_phone_number("089 1234567", "DE").e164                   # '+49891234567'
```

The functions are the same as in the npm package
[geodata-kit](https://www.npmjs.com/package/geodata-kit), named in
snake_case (`resolveCountry` → `resolve_country`). Options can be passed as
keyword arguments: `find_city("Springfield", country="US", subdivision="MO")`.
The full list of functions is in the
[npm README](https://www.npmjs.com/package/geodata-kit#api-reference); all of
them exist here except the coordinate timezone lookup of `geodata-kit-tz`.

MIT. Data from GeoNames (CC BY 4.0), Unicode CLDR, IANA tzdata, Wikidata,
Natural Earth, libphonenumber and Google's address metadata; see `NOTICE`.
If you publish data taken from this package, credit GeoNames.
