"""geodata-kit — countries, subdivisions, cities, languages, timezones, address and phone data.

Offline, no runtime dependencies. Data licences and credits: see NOTICE.
"""
from .address import (
    format_address, get_address_format, get_postal_code_rules, get_required_address_fields, is_valid_postal_code,
    is_valid_region, list_regions, normalize_postal_code, parse_address, resolve_region,
)
from .airports import Airport, get_airport_by_iata, get_airport_by_icao, list_airports, search_airports
from .cities import (
    City, distance_km, find_city, find_nearest_cities, get_city, get_city_by_unlocode, get_place_by_wikidata_id,
    has_localities, list_cities, parse_location, preload_cities, resolve_city_timezone, search_cities,
)
from .countries import (
    Country, CountryMatch, format_country, get_area, get_calling_code, get_capital, get_countries_by_calling_code,
    get_country, get_country_aliases, get_country_name, get_currencies, get_currency, get_demonym, get_driving_side,
    get_flag_emoji, get_measurement_system, get_neighbours, get_paper_size, get_population, get_successor_codes, get_tld,
    get_week_start, is_country_code, list_countries, normalize_country_code, normalize_country_codes, resolve_countries,
    resolve_country, search_countries, sort_countries, suggest_countries,
)
from .fold import clean_input as clean_text, edit_distance, fold
from .groups import (
    expand_groups, get_continent, get_countries_in_group, get_group, get_groups_of_country, get_m49_region, is_in_group,
    list_continents, list_groups,
)
from .languages import (
    get_countries_by_language, get_country_languages, get_default_locale, get_language_name, get_language_scripts,
    get_languages_of_subdivision, get_national_languages, get_primary_language, get_regional_languages,
    is_official_language, resolve_language,
)
from .phone import (
    PhoneNumber, format_phone_number, get_example_phone_number, get_phone_number_type, is_possible_phone_number,
    is_valid_phone_number, list_phone_regions, parse_phone_number, parse_phone_numbers,
)
from .shapes import get_country_at, get_subdivision_at
from .subdivisions import (
    Subdivision, find_subdivision, get_subdivision, get_subdivision_chain, get_subdivision_name, is_subdivision_code,
    list_subdivisions, load_subdivisions, resolve_subdivision,
)
from .timezones import canonical_timezone, get_country_timezones, get_primary_timezone, is_timezone, list_timezones

__version__ = "0.2.1"
__all__ = [name for name in dir() if not name.startswith("_")]
