/**
 * Country groups: data/core/groups.json.
 *   - continent_*: GeoNames continents (7)
 *   - un_*: UN M49 regions, sub-regions and groupings (CLDR territoryContainment)
 *   - eu, eurozone, schengen, efta, eea: dated memberships (overlays/memberships.json)
 *   - business groups (overlays/groups.json)
 * Current EU and Eurozone members are checked against CLDR and Wikidata; a mismatch fails the build.
 */
import { supplemental } from '../lib/cldr.js';
import { compareStrings, readJson, writeJson } from '../lib/io.js';
import { dataPath, overlayPath } from '../lib/paths.js';
import type { CountryRecord } from './countries.js';

export interface GroupMember { code: string; from?: string; to?: string }
export interface Group {
  slug: string;
  name: string;
  kind: 'continent' | 'un' | 'political' | 'business';
  definition?: string;
  code?: string;
  members: GroupMember[];
}

interface MembershipOverlay {
  groups: { slug: string; name: string; source: string; note?: string; derivedFromEu?: boolean; members: GroupMember[]; overrides?: Record<string, Partial<GroupMember>> }[];
}
interface GroupOverlay {
  groups: { slug: string; name: string; definition: string; members?: string[]; fromM49?: string[]; exclude?: string[] }[];
}

const slugify = (name: string): string => name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export async function buildGroups(): Promise<void> {
  const countries = readJson<CountryRecord[]>(dataPath('core', 'countries.json'));
  const codes = new Set(countries.map((country) => country.code));
  const m49Names = readJson<Record<string, string>>(dataPath('core', 'm49.json'));
  const groups: Group[] = [];

  // Continents (GeoNames continent column).
  const continentNames: Record<string, string> = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };
  for (const [code, name] of Object.entries(continentNames)) {
    groups.push({
      slug: `continent_${slugify(name)}`, name, kind: 'continent', code,
      members: countries.filter((country) => country.continent === code).map((country) => ({ code: country.code })),
    });
  }

  // UN M49 (as published in CLDR territoryContainment, including groupings such as 419 and 202).
  const m49Members = new Map<string, Set<string>>();
  for (const country of countries) {
    for (const region of [country.m49.region, country.m49.subregion, country.m49.intermediate, ...country.m49.groupings]) {
      if (!region) continue;
      m49Members.set(region, new Set([...(m49Members.get(region) ?? []), country.code]));
    }
  }
  for (const [code, members] of [...m49Members.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    groups.push({
      slug: `un_${slugify(m49Names[code] ?? code)}`, name: m49Names[code] ?? code, kind: 'un', code,
      members: [...members].sort(compareStrings).map((member) => ({ code: member })),
    });
  }

  // Political memberships with dates.
  const memberships = readJson<MembershipOverlay>(overlayPath('memberships.json'));
  const eu = memberships.groups.find((group) => group.slug === 'eu')!;
  for (const group of memberships.groups) {
    let members = [...group.members];
    if (group.derivedFromEu) {
      members = [...members, ...eu.members.map((member) => ({ ...member, ...(group.overrides?.[member.code] ?? {}) }))];
    }
    for (const member of members) if (!codes.has(member.code)) throw new Error(`${group.slug}: unknown code ${member.code}`);
    groups.push({
      slug: group.slug, name: group.name, kind: 'political', definition: group.note,
      members: members.sort((a, b) => compareStrings(a.code, b.code)),
    });
  }

  // Business groups.
  for (const group of readJson<GroupOverlay>(overlayPath('groups.json')).groups) {
    const members = new Set(group.members ?? []);
    for (const region of group.fromM49 ?? []) for (const code of m49Members.get(region) ?? []) members.add(code);
    for (const code of group.exclude ?? []) members.delete(code);
    for (const code of members) if (!codes.has(code)) throw new Error(`${group.slug}: unknown code ${code}`);
    groups.push({
      slug: group.slug, name: group.name, kind: 'business', definition: group.definition,
      members: [...members].sort(compareStrings).map((code) => ({ code })),
    });
  }

  // Cross-checks: current EU / Eurozone vs CLDR and Wikidata.
  const containment = supplemental<Record<string, { _contains: string[] }>>('territoryContainment', 'territoryContainment');
  const today = new Date().toISOString().slice(0, 10);
  const current = (slug: string): string[] => groups.find((group) => group.slug === slug)!.members
    .filter((member) => (!member.from || member.from <= today) && (!member.to || member.to >= today))
    .map((member) => member.code).sort(compareStrings);
  const check = (label: string, ours: string[], theirs: string[]): void => {
    const a = ours.join(','); const b = [...theirs].sort(compareStrings).join(',');
    if (a !== b) throw new Error(`${label} mismatch:\n  ours   ${a}\n  theirs ${b}`);
  };
  check('EU vs CLDR', current('eu'), containment.EU!._contains);
  check('Eurozone vs CLDR', current('eurozone'), containment.EZ!._contains);
  const wikidataEu = readJson<{ rows: { country: string; end?: string }[] }>(overlayPath('wikidata', 'euMembership.json')).rows
    .filter((row) => !row.end).map((row) => row.country);
  // Wikidata is a soft check: it records some memberships on a different item
  // (the Netherlands' EU membership sits on "Kingdom of the Netherlands", not on NL).
  const ours = new Set(current('eu'));
  const wikidataSet = new Set(wikidataEu);
  const differences = [
    ...[...ours].filter((code) => !wikidataSet.has(code)).map((code) => `EU: ${code} is a member here but not in Wikidata`),
    ...[...wikidataSet].filter((code) => !ours.has(code)).map((code) => `EU: ${code} is a member in Wikidata but not here`),
  ];
  writeJson(dataPath('reports', 'groups.json'), differences);

  const slugs = new Set<string>();
  for (const group of groups) {
    if (slugs.has(group.slug)) throw new Error(`duplicate group slug ${group.slug}`);
    slugs.add(group.slug);
  }
  writeJson(dataPath('core', 'groups.json'), groups);
  console.log(`  groups: ${groups.length} (${groups.filter((g) => g.kind === 'un').length} UN, ${groups.filter((g) => g.kind === 'political').length} political, ${groups.filter((g) => g.kind === 'business').length} business)`);
}
