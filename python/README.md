# geodata-kit-py

Countries, regions, cities, languages, timezones, addresses and phone numbers
for Python, offline and with no dependencies. Install name `geodata-kit-py`,
import name `geodata_kit`.

```bash
pip install geodata-kit-py
pip install "geodata-kit-py[localities,postal]"   # optional: villages, postal codes
```

```python
from geodata_kit import resolve_country, get_country_name, resolve_city_timezone, normalize_postal_code, parse_phone_number

resolve_country("Deutschland").code                            # 'DE'
get_country_name("CH", "fr")                                   # 'Suisse'
resolve_city_timezone({"city": "München", "country": "DE"})["timezone"]  # 'Europe/Berlin'
normalize_postal_code("sw1a1aa", "GB")                         # 'SW1A 1AA'
parse_phone_number("089 1234567", "DE").e164                   # '+49891234567'
```

This one package contains what the npm packages `geodata-kit`,
`geodata-kit-subdivisions`, `geodata-kit-cities`, `geodata-kit-airports`,
`geodata-kit-shapes`, `geodata-kit-address` and `geodata-kit-phone` contain,
with the same function names in snake_case (`resolveCountry` →
`resolve_country`). Their READMEs on npm list every function, starting at
[geodata-kit](https://www.npmjs.com/package/geodata-kit). Options can be
passed as keyword arguments:
`find_city("Springfield", country="US", subdivision="MO")`. The coordinate
timezone lookup of `geodata-kit-tz` is not included.

MIT. Data from GeoNames (CC BY 4.0), Unicode CLDR, IANA tzdata, Wikidata,
Natural Earth, libphonenumber and Google's address metadata; see `NOTICE`.
If you publish data taken from this package, credit GeoNames.
