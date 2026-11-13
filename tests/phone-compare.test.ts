/**
 * Dev-only safety net for the phone module: 10,000 generated numbers are parsed
 * by geodata-kit and by libphonenumber-js (a dev dependency built from the same
 * Google metadata), and validity, type, region and formatting must agree.
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { describe, expect, it } from 'vitest';

import { formatPhoneNumber, listPhoneRegions, parsePhoneNumber, getExamplePhoneNumber } from 'geodata-kit-phone';

const TYPE_NAMES: Record<string, string> = {
  FIXED_LINE: 'fixed_line', MOBILE: 'mobile', FIXED_LINE_OR_MOBILE: 'fixed_line_or_mobile', PREMIUM_RATE: 'premium_rate',
  TOLL_FREE: 'toll_free', SHARED_COST: 'shared_cost', VOIP: 'voip', PERSONAL_NUMBER: 'personal_number', PAGER: 'pager',
  UAN: 'uan', VOICEMAIL: 'voicemail',
};

/** Small deterministic PRNG so the generated set is the same on every run. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateNumbers(total: number): { e164: string; region: string }[] {
  const random = mulberry32(20261112);
  const seeds: { region: string; callingCode: string; national: string }[] = [];
  const types = ['fixed_line', 'mobile', 'toll_free', 'premium_rate', 'shared_cost', 'voip', 'personal_number', 'pager', 'uan', 'voicemail'] as const;
  for (const region of listPhoneRegions().filter((code) => !code.startsWith('001'))) {
    for (const type of types) {
      const example = getExamplePhoneNumber(region, type);
      if (example) seeds.push({ region, callingCode: example.callingCode, national: example.nationalNumber });
    }
  }
  const numbers: { e164: string; region: string }[] = [];
  for (let index = 0; numbers.length < total; index++) {
    const seed = seeds[index % seeds.length]!;
    let national = seed.national;
    const roll = random();
    if (roll < 0.1) national = national.slice(0, -1); // too short
    else if (roll < 0.2) national += String(Math.floor(random() * 10)); // too long
    const keep = Math.max(1, national.length - 1 - Math.floor(random() * Math.min(5, national.length - 1)));
    let digits = national.slice(0, keep);
    while (digits.length < national.length) digits += String(Math.floor(random() * 10));
    numbers.push({ e164: `+${seed.callingCode}${digits}`, region: seed.region });
  }
  return numbers;
}

describe('phone parity with libphonenumber-js', () => {
  const numbers = generateNumbers(10_000);

  it('agrees on validity, type, region and formatting for 10,000 numbers', () => {
    const mismatches: Record<string, string[]> = { valid: [], type: [], region: [], international: [], national: [], nationalInput: [] };
    for (const { e164, region } of numbers) {
      const ours = parsePhoneNumber(e164);
      const theirs = parsePhoneNumberFromString(e164);
      const theirValid = theirs?.isValid() ?? false;
      if ((ours?.isValid ?? false) !== theirValid) { mismatches.valid!.push(`${e164}: ours ${ours?.isValid} theirs ${theirValid}`); continue; }
      if (!theirValid || !ours || !theirs) continue;
      const theirType = TYPE_NAMES[theirs.getType() ?? ''] ?? 'unknown';
      // Known difference: for regions without a mobile description (e.g. TA),
      // Google's reference library says fixed_line; libphonenumber-js says fixed_line_or_mobile.
      const regionWithoutMobile = ours.country && !getExamplePhoneNumber(ours.country, 'mobile');
      const knownDifference = regionWithoutMobile && ours.type === 'fixed_line' && theirType === 'fixed_line_or_mobile';
      if (ours.type !== theirType && !knownDifference) mismatches.type!.push(`${e164}: ours ${ours.type} theirs ${theirType}`);
      if ((ours.country ?? undefined) !== theirs.country) mismatches.region!.push(`${e164}: ours ${ours.country} theirs ${theirs.country}`);
      if (formatPhoneNumber(ours, 'INTERNATIONAL') !== theirs.formatInternational()) mismatches.international!.push(`${e164}: ours ${formatPhoneNumber(ours, 'INTERNATIONAL')} theirs ${theirs.formatInternational()}`);
      // Known difference: libphonenumber-js leaves out national-only formats (intlFormat "NA"),
      // so it prints such numbers unformatted; Google's reference library formats them.
      const theirsUnformatted = theirs.formatNational().replace(/\D/g, '') === theirs.nationalNumber && !/\D/.test(theirs.formatNational());
      if (formatPhoneNumber(ours, 'NATIONAL') !== theirs.formatNational() && !theirsUnformatted) mismatches.national!.push(`${e164}: ours ${formatPhoneNumber(ours, 'NATIONAL')} theirs ${theirs.formatNational()}`);
      // Parsing the national form back with the region must give the same number.
      const country = theirs.country as CountryCode | undefined;
      // Only where libphonenumber-js itself round-trips its national format (NF does not).
      if (country && parsePhoneNumberFromString(theirs.formatNational(), country)?.number === e164) {
        const back = parsePhoneNumber(theirs.formatNational(), country);
        if (back?.e164 !== e164) mismatches.nationalInput!.push(`${theirs.formatNational()} (${country}): ours ${back?.e164} expected ${e164}`);
      }
      void region;
    }
    const summary = Object.fromEntries(Object.entries(mismatches).map(([key, list]) => [key, { count: list.length, first: list.slice(0, 5) }]));
    const validCount = numbers.filter(({ e164 }) => parsePhoneNumberFromString(e164)?.isValid()).length;
    console.log(`phone parity: ${numbers.length} numbers, ${validCount} valid`, JSON.stringify(summary, null, 1));
    expect(mismatches.valid!.length, 'validity').toBe(0);
    expect(mismatches.type!.length, 'type').toBe(0);
    expect(mismatches.region!.length, 'region').toBe(0);
    expect(mismatches.international!.length, 'international format').toBe(0);
    expect(mismatches.national!.length, 'national format').toBe(0);
    expect(mismatches.nationalInput!.length, 'national input').toBe(0);
  });
});
