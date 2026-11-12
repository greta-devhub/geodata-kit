/**
 * The country alias table behind resolveCountry: data/core/aliases.json.
 *
 * Every alias is stored folded (see fold()). Sources, merged per country:
 *   - CLDR names (incl. -alt-short / -alt-variant) in the bundled locales and
 *     in the country's own national and regional languages ("names");
 *   - GeoNames alternate names in those languages, unlabeled ones and all
 *     Latin-script ones, skipping historic and colloquial names ("aliases");
 *   - overlays/aliases.json ("aliases", and "subdivisions" such as England → GB).
 *
 * A folded alias that points to two countries fails the build, unless one of
 * them owns it as a CLDR name and the others only as an alternate name, or
 * overlays/aliases.json assigns or bans it.
 */
import { fold } from '../../packages/geodata-kit/src/fold.js';
import { localeDisplayNames } from '../lib/cldr.js';
import { compareStrings, readJson, readTsv, writeJson } from '../lib/io.js';
import { cachePath, dataPath, overlayPath } from '../lib/paths.js';
import { DISPLAY_LOCALES, type CountryRecord } from './countries.js';
import type { CountryLanguage } from './languages.js';

type Kind = 'name' | 'alias' | 'subdivision';
interface Claim { code: string; kind: Kind; source: string }

interface AliasOverlay {
  aliases: Record<string, string[]>;
  subdivisions: Record<string, string[]>;
  assign: Record<string, string>;
  ban: Record<string, string>;
}

const LATIN_ONLY = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{M}'’ʻ`´.-]+$/u;

export async function buildAliases(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const languages = readJson<{ countries: Record<string, CountryLanguage[]> }>(dataPath('core', 'languages.json'));
  const overlay = readJson<AliasOverlay>(overlayPath('aliases.json'));
  const byGeonameId = new Map(countries.map((country) => [country.geonameId, country.code]));

  const claims = new Map<string, Claim[]>();
  const displayAliases = new Map<string, Set<string>>(countries.map((country) => [country.code, new Set<string>()]));
  const add = (raw: string, code: string, kind: Kind, source: string, display = false): void => {
    const key = fold(raw);
    if (!key || key.length < 2) return;
    const list = claims.get(key) ?? [];
    if (!list.some((claim) => claim.code === code && claim.kind === kind)) list.push({ code, kind, source });
    claims.set(key, list);
    if (display) displayAliases.get(code)!.add(raw);
  };

  // Which languages count for each country: bundled locales + its own national/regional languages.
  const ownLanguages = new Map<string, Set<string>>();
  for (const country of countries) {
    const own = new Set<string>();
    for (const language of languages.countries[country.code] ?? []) {
      if (language.status !== 'spoken') own.add(language.code.split('-')[0]!);
    }
    ownLanguages.set(country.code, own);
  }

  // CLDR names.
  const territoryCache = new Map<string, Record<string, string> | null>();
  const territories = (locale: string): Record<string, string> | null => {
    if (!territoryCache.has(locale)) territoryCache.set(locale, localeDisplayNames(locale, 'territories'));
    return territoryCache.get(locale)!;
  };
  for (const country of countries) {
    const locales = new Set<string>([...DISPLAY_LOCALES, ...ownLanguages.get(country.code)!]);
    for (const locale of locales) {
      const names = territories(locale);
      if (!names) continue;
      const own = ownLanguages.get(country.code)!.has(locale);
      for (const [key, name] of Object.entries(names)) {
        if (key !== country.code && !key.startsWith(`${country.code}-alt-`)) continue;
        const isMain = key === country.code;
        add(name, country.code, isMain ? 'name' : 'alias', `cldr:${locale}`, locale === 'en' ? !isMain : own);
      }
    }
    add(country.name, country.code, 'name', 'display', false);
    add(country.alpha3, country.code, 'alias', 'alpha3');
  }

  // GeoNames alternate names of the countries themselves.
  for await (const [id, language, name, , , colloquial, historic] of readTsv(cachePath('work', 'altnames.tsv'))) {
    const code = byGeonameId.get(Number(id));
    if (!code || !name || colloquial === '1' || historic === '1') continue;
    const lang = (language ?? '').split('-')[0]!;
    if (['iata', 'icao', 'unlc', 'wkdt', 'abbr'].includes(lang)) continue;
    const relevant = lang === '' || (DISPLAY_LOCALES as readonly string[]).includes(lang) || ownLanguages.get(code)!.has(lang) || LATIN_ONLY.test(name);
    // Short GeoNames forms ("DU", "RA" for the UK) are abbreviations that would capture unrelated input.
    if (relevant && fold(name).replace(/ /g, '').length >= 4) add(name, code, 'alias', `geonames:${lang || '-'}`);
  }

  // Curated aliases.
  for (const [code, list] of Object.entries(overlay.aliases)) for (const alias of list) add(alias, code, 'alias', 'overlay', true);
  for (const [code, list] of Object.entries(overlay.subdivisions)) for (const alias of list) add(alias, code, 'subdivision', 'overlay', true);

  // Resolve claims.
  const names: Record<string, string> = {};
  const aliases: Record<string, string> = {};
  const subdivisions: Record<string, string> = {};
  const unresolved: string[] = [];
  for (const [key, list] of [...claims.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (overlay.ban[key]) continue;
    const codes = [...new Set(list.map((claim) => claim.code))];
    let winner: string | undefined;
    if (overlay.assign[key]) winner = overlay.assign[key];
    else if (codes.length === 1) winner = codes[0];
    else {
      const nameOwners = [...new Set(list.filter((claim) => claim.kind === 'name').map((claim) => claim.code))];
      const overlayOwners = [...new Set(list.filter((claim) => claim.source === 'overlay').map((claim) => claim.code))];
      if (overlayOwners.length === 1) winner = overlayOwners[0];
      else if (nameOwners.length === 1) winner = nameOwners[0];
    }
    if (!winner) {
      unresolved.push(`${key}: ${list.map((claim) => `${claim.code} (${claim.kind}, ${claim.source})`).join(' | ')}`);
      continue;
    }
    const kinds = list.filter((claim) => claim.code === winner).map((claim) => claim.kind);
    if (kinds.includes('name')) names[key] = winner;
    else if (kinds.includes('alias')) aliases[key] = winner;
    else subdivisions[key] = winner;
  }
  if (unresolved.length) {
    throw new Error(`Ambiguous country aliases; assign or ban them in overlays/aliases.json:\n  ${unresolved.join('\n  ')}`);
  }

  // Readable aliases per country for pickers and getCountryAliases (no folded keys).
  const display: Record<string, string[]> = {};
  for (const country of countries) {
    const seen = new Set([fold(country.name)]);
    display[country.code] = [...displayAliases.get(country.code)!]
      .sort(compareStrings)
      .filter((alias) => {
        const key = fold(alias);
        if (seen.has(key) || !(names[key] === country.code || aliases[key] === country.code || subdivisions[key] === country.code)) return false;
        seen.add(key);
        return true;
      });
  }

  writeJson(dataPath('core', 'aliases.json'), { names, aliases, subdivisions, display }, 'lines');
  const count = Object.keys(names).length + Object.keys(aliases).length + Object.keys(subdivisions).length;
  console.log(`  aliases: ${count} folded keys (${Object.keys(names).length} names, ${Object.keys(aliases).length} aliases, ${Object.keys(subdivisions).length} subdivisions)`);
}
