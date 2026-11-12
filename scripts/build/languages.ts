/**
 * Languages per country (national, regional and all spoken), languages of
 * subdivisions, language names and the alias table behind resolveLanguage:
 * data/core/languages.json.
 *
 * Status and population share come from CLDR territoryInfo. Wikidata P37
 * (official language) only fills gaps: it adds an official language CLDR does
 * not list, or promotes one CLDR lists without a status, and it tells in which
 * subdivisions a regional language is official.
 */
import { fold } from '../../packages/geodata-kit/src/fold.js';
import { localeDisplayNames, supplemental } from '../lib/cldr.js';
import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { dataPath, overlayPath } from '../lib/paths.js';
import { DISPLAY_LOCALES, type CountryRecord } from './countries.js';

type Status = 'official' | 'de_facto_official' | 'official_regional' | 'spoken';

export interface CountryLanguage {
  code: string;
  status: Status;
  share: number | null;
  speakers: number | null;
  writingShare?: number;
  literacyShare?: number;
  regions?: string[];
  locale?: string;
}

interface LanguagePopulation {
  _populationPercent?: string;
  _officialStatus?: string;
  _writingPercent?: string;
  _literacyPercent?: string;
}

interface WikidataLanguageRow { country?: string; iso?: string; iso1?: string; iso3?: string; wikimedia?: string }

const STATUS_ORDER: Record<Status, number> = { official: 0, de_facto_official: 1, official_regional: 2, spoken: 3 };

/** CLDR writes script variants with "_" (zh_Hant); BCP 47 uses "-". */
const toBcp47 = (code: string): string => code.replace(/_/g, '-');

export async function buildLanguages(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const territoryInfo = supplemental<Record<string, { _population?: string; languagePopulation?: Record<string, LanguagePopulation> }>>('territoryInfo', 'territoryInfo');
  const likelySubtags = supplemental<Record<string, string>>('likelySubtags', 'likelySubtags');
  const languageData = supplemental<Record<string, { _scripts?: string[]; _territories?: string[] }>>('languageData', 'languageData');
  const languageAlias = supplemental<{ alias: { languageAlias: Record<string, { _reason: string; _replacement: string }> } }>('aliases', 'metadata').alias.languageAlias;
  const knownLanguages = new Set(Object.keys(localeDisplayNames('en', 'languages')!));

  /** Maps a Wikidata language (ISO 639-1, Wikimedia or ISO 639-3 code) to the code CLDR uses. */
  const wikidataLanguageCode = (row: WikidataLanguageRow): string | null => {
    for (const candidate of [row.iso1, row.wikimedia, row.iso3]) {
      if (!candidate) continue;
      const lower = candidate.toLowerCase();
      const replaced = languageAlias[lower]?._replacement?.split(/[_-]/)[0] ?? lower;
      if (knownLanguages.has(replaced) || languageData[replaced]) return replaced;
    }
    return null;
  };

  // Wikidata: official languages of countries and of subdivisions.
  const wikidataCountry = new Map<string, Set<string>>();
  for (const row of readJson<{ rows: WikidataLanguageRow[] }>(overlayPath('wikidata', 'countryLanguages.json')).rows) {
    const code = wikidataLanguageCode(row);
    if (code && row.country) wikidataCountry.set(row.country, new Set([...(wikidataCountry.get(row.country) ?? []), code]));
  }
  const subdivisionLanguages: Record<string, string[]> = {};
  for (const row of readJson<{ rows: WikidataLanguageRow[] }>(overlayPath('wikidata', 'subdivisionLanguages.json')).rows) {
    const code = wikidataLanguageCode(row);
    if (!code || !row.iso || !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(row.iso)) continue;
    subdivisionLanguages[row.iso] = [...new Set([...(subdivisionLanguages[row.iso] ?? []), code])].sort();
  }

  const byCountry: Record<string, CountryLanguage[]> = {};
  const report: string[] = [];
  for (const country of countries) {
    const info = territoryInfo[country.code];
    const population = Number(info?._population ?? country.population ?? 0) || null;
    const geonamesLocales = new Map(country.geonamesLanguages.map((tag) => [tag.split('-')[0]!.toLowerCase(), tag]));
    const languages = new Map<string, CountryLanguage>();

    for (const [rawCode, entry] of Object.entries(info?.languagePopulation ?? {})) {
      const code = toBcp47(rawCode);
      const share = entry._populationPercent ? Number(entry._populationPercent) : null;
      const language: CountryLanguage = {
        code,
        status: (entry._officialStatus as Status | undefined) ?? 'spoken',
        share,
        speakers: share !== null && population ? Math.round((population * share) / 100) : null,
      };
      if (entry._writingPercent) language.writingShare = Number(entry._writingPercent);
      if (entry._literacyPercent) language.literacyShare = Number(entry._literacyPercent);
      languages.set(code, language);
    }

    // Wikidata adds national languages only where CLDR has none at all: its
    // country-level P37 also lists languages that are official in a territory
    // only (e.g. Chamorro and Samoan on the United States).
    const hasNational = [...languages.values()].some((language) => language.status === 'official' || language.status === 'de_facto_official');
    if (!hasNational) {
      for (const code of wikidataCountry.get(country.code) ?? []) {
        const existing = languages.get(code);
        if (existing) existing.status = 'official';
        else languages.set(code, { code, status: 'official', share: null, speakers: null });
        report.push(`${country.code}: ${code} official from Wikidata (CLDR has no national language)`);
      }
    }

    // Languages that Wikidata says are official in one of the country's subdivisions
    // but that CLDR does not mark official become official_regional.
    for (const [iso, codes] of Object.entries(subdivisionLanguages)) {
      if (!iso.startsWith(`${country.code}-`)) continue;
      for (const code of codes) {
        const existing = languages.get(code);
        if (existing && existing.status !== 'spoken') continue;
        if (existing) existing.status = 'official_regional';
        else languages.set(code, { code, status: 'official_regional', share: null, speakers: null });
      }
    }

    for (const language of languages.values()) {
      const base = language.code.split('-')[0]!;
      if (language.status === 'official_regional') {
        const regions = Object.entries(subdivisionLanguages)
          .filter(([iso, codes]) => iso.startsWith(`${country.code}-`) && codes.includes(base))
          .map(([iso]) => iso)
          .sort();
        if (regions.length) language.regions = regions;
        else report.push(`${country.code}: regional language ${language.code} has no subdivision in Wikidata`);
      }
      const locale = geonamesLocales.get(base);
      if (locale && locale.includes('-')) language.locale = locale;
    }

    const list = [...languages.values()].sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.share ?? -1) - (a.share ?? -1) || compareStrings(a.code, b.code));
    if (!list.some((language) => language.status === 'official' || language.status === 'de_facto_official') && (country.population ?? 0) > 0) {
      report.push(`${country.code}: no national language in CLDR or Wikidata`);
    }
    byCountry[country.code] = list;
  }

  // Default locale per country (CLDR likelySubtags: und-CH → de-Latn-CH → "de-CH").
  const defaultLocales: Record<string, string> = {};
  for (const country of countries) {
    // CLDR has no und-US: en-US is its global default ("und" → en-Latn-US).
    const firstNational = byCountry[country.code]?.find((language) => language.status === 'official' || language.status === 'de_facto_official');
    const likely = likelySubtags[`und-${country.code}`] ?? (firstNational ? `${firstNational.code.split('-')[0]}-${country.code}` : null);
    if (!likely) continue;
    const [language, ...rest] = likely.split('-');
    const script = rest.find((part) => /^[A-Z][a-z]{3}$/.test(part));
    // Keep the script only where it matters (e.g. sr-Cyrl-RS, zh-Hant-TW).
    const needsScript = script && (languageData[language!]?._scripts?.length ?? 0) > 1;
    defaultLocales[country.code] = [language, needsScript ? script : null, country.code].filter(Boolean).join('-');
  }

  // Language names: every language CLDR names in English, in the bundled locales, plus the endonym.
  const namesByLocale = Object.fromEntries(DISPLAY_LOCALES.map((locale) => [locale, localeDisplayNames(locale, 'languages')!]));
  const usedCodes = new Set<string>();
  for (const list of Object.values(byCountry)) for (const language of list) usedCodes.add(language.code);
  for (const codes of Object.values(subdivisionLanguages)) for (const code of codes) usedCodes.add(code);
  for (const code of Object.keys(namesByLocale.en!)) if (!code.includes('-') || usedCodes.has(code)) usedCodes.add(code);

  const languageInfo: Record<string, { names: Record<string, string>; endonym: string | null; scripts: string[] }> = {};
  for (const code of [...usedCodes].sort(compareStrings)) {
    const names: Record<string, string> = {};
    for (const locale of DISPLAY_LOCALES) {
      const name = namesByLocale[locale]![code];
      if (name) names[locale] = name;
    }
    const own = localeDisplayNames(code, 'languages');
    languageInfo[code] = {
      names,
      endonym: own?.[code] ?? null,
      scripts: languageData[code]?._scripts ?? languageData[code.split('-')[0]!]?._scripts ?? [],
    };
  }

  // resolveLanguage aliases: English first, then endonyms, then the other bundled locales;
  // the first language to claim a folded name keeps it. Plus ISO 639-2/3 codes.
  const aliases: Record<string, string> = {};
  const claim = (name: string | null | undefined, code: string): void => {
    if (!name) return;
    const key = fold(name);
    if (key && !(key in aliases)) aliases[key] = code;
  };
  for (const [code, info] of Object.entries(languageInfo)) claim(info.names.en, code);
  for (const [code, info] of Object.entries(languageInfo)) claim(info.endonym, code);
  for (const locale of DISPLAY_LOCALES) for (const [code, info] of Object.entries(languageInfo)) claim(info.names[locale], code);
  const codeAliases: Record<string, string> = {};
  for (const [alias, info] of Object.entries(languageAlias)) {
    if (!/^[a-z]{3}$/.test(alias) || !['overlong', 'bibliographic', 'macrolanguage'].includes(info._reason)) continue;
    const replacement = toBcp47(info._replacement);
    if (/^[a-z]{2,3}$/.test(replacement) && languageInfo[replacement]) codeAliases[alias] = replacement;
  }

  writeJson(dataPath('core', 'languages.json'), {
    countries: byCountry,
    subdivisions: Object.fromEntries(Object.entries(subdivisionLanguages).sort(([a], [b]) => compareStrings(a, b))),
    defaultLocales,
    languages: languageInfo,
    aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => compareStrings(a, b))),
    codeAliases: Object.fromEntries(Object.entries(codeAliases).sort(([a], [b]) => compareStrings(a, b))),
  }, 'lines');
  writeJson(dataPath('reports', 'languages.json'), report.sort(compareStrings));

  console.log(`  languages: ${Object.keys(languageInfo).length} named, ${Object.keys(aliases).length} name aliases, ${Object.keys(subdivisionLanguages).length} subdivisions with official languages; report: ${report.length} notes`);
}
