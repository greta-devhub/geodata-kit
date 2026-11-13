/**
 * geodata-kit — countries, names, resolution, search, groups, languages,
 * timezones and country facts. Synchronous, no runtime dependencies.
 *
 * Subdivisions, cities, airports, shapes, address rules and phone numbers are
 * separate packages (geodata-kit-cities, …) so this one stays small.
 */
import { dataDate } from '../../../data/meta.json';
export * from './types.js';
export { fold } from './fold.js';
export { cleanInput as cleanText, editDistance } from './internal/util.js';
export {
  COUNTRY_CODE_PATTERN,
  formatCountry,
  getArea,
  getCallingCode,
  getCapital,
  getCountriesByCallingCode,
  getCountry,
  getCountryAliases,
  getCountryName,
  getCurrencies,
  getCurrency,
  getDemonym,
  getDrivingSide,
  getFlagEmoji,
  getMeasurementSystem,
  getNeighbours,
  getPaperSize,
  getPopulation,
  getSuccessorCodes,
  getTld,
  getWeekStart,
  isCountryCode,
  listCountries,
  normalizeCountryCode,
  normalizeCountryCodes,
  resolveCountries,
  resolveCountry,
  searchCountries,
  sortCountries,
  suggestCountries,
  type CountryFilter,
  type FormatCountryOptions,
  type SearchCountriesOptions,
} from './countries.js';
export {
  expandGroups,
  getContinent,
  getCountriesInGroup,
  getGroup,
  getGroupsOfCountry,
  getM49Region,
  isInGroup,
  listContinents,
  listGroups,
  type Continent,
  type M49Region,
} from './groups.js';
export {
  getCountriesByLanguage,
  getCountryLanguages,
  getDefaultLocale,
  getLanguageName,
  getLanguageScripts,
  getLanguagesOfSubdivision,
  getNationalLanguages,
  getPrimaryLanguage,
  getRegionalLanguages,
  isOfficialLanguage,
  resolveLanguage,
  type CountryLanguagesOptions,
} from './languages.js';
export { canonicalTimezone, getCountryTimezones, getPrimaryTimezone, isTimezone, listTimezones } from './timezones.js';

/**
 * Date of the data in this version, as YYYY-MM-DD. The data is refreshed about
 * once a month; every package of one version carries the same date.
 */
export const DATA_DATE: string = dataDate;
