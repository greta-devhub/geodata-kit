# geodata-kit — repository

Source of the `geodata-kit` packages: countries, subdivisions, cities,
languages, timezones, address rules and phone numbers, generated from open
data and shipped for TypeScript/JavaScript and Python.

| Package | Registry | Contents | Packed / unpacked |
|---|---|---|---|
| `geodata-kit` | npm | main library, 7 entry points (see [its README](packages/geodata-kit/README.md)) | 19.5 MB / 70 MB |
| `geodata-kit-localities` | npm | 4.9M villages and districts, gzip per country | 83 MB / 83 MB |
| `geodata-kit-postal` | npm | 1.8M postal codes, 124 countries | 19 MB / 19 MB |
| `geodata-kit-tz` | npm | timezone polygons, point → zone (ODbL data) | 5 MB / 7 MB |
| `geodata-kit-py` (+ `[localities]`, `[postal]` extras; import `geodata_kit`) | PyPI — **not published yet** (built and tested in CI) | same API in snake_case, same data | 19 MB wheel |

## Layout

```
scripts/            generator (TypeScript, run with tsx)
  sources.ts        every source URL with its pinned version
  download.ts       → .cache/ (gitignored, ~800 MB)
  extract.ts        one streaming pass over allCountries + alternateNamesV2 → .cache/work/
  wikidata.ts       SPARQL queries in scripts/sparql/ → overlays/wikidata/ (committed snapshot)
  generate.ts       build steps in scripts/build/ → data/
  emit.ts           data/ → package data modules, loader map, Python data
  release/          version sync, release checks, npm publish, release notes
.changeset/         pending version notes (npm run changeset)
.github/workflows/  ci.yml, release.yml, refresh-data.yml
overlays/           hand-edited inputs, each entry with its source
  aliases.json      extra country aliases, ambiguous names (assign / ban)
  groups.json       business groups with definitions
  memberships.json  EU, Eurozone, Schengen, EFTA, EEA with dates
  corrections.json  fixes on top of GeoNames
  names.json        English display-name overrides
  postal.json       postal-code prefixes (D-, CH-, …)
data/               generated, committed: the reviewable output of a refresh
  meta.json         every source with URL, licence, size, SHA-256, download date
  reports/          build notes (ISO match rate, language gaps, …)
packages/           npm packages (sources in src/, data copied in by emit)
python/             Python package and its two data extras (not published yet)
tests/golden/       language-neutral test cases run by Vitest and pytest
```

## Package internals

Details kept out of the published READMEs.

**Data snapshot.** GeoNames 2026-11-12, CLDR 49.0.0, tzdata 2026f,
libphonenumber 9.0.43, Natural Earth 5.1.2, timezone-boundary-builder 2026f,
Google address data and Wikidata retrieved 2026-11-12. All of it is listed in
`data/meta.json`.

**How data loads (npm).**
- **Core data** (countries, names, aliases, groups, languages, timezones) is
  bundled into a shared chunk of about 1 MB and is synchronous.
- **Level-1 subdivisions** are another bundled chunk of about 1.4 MB.
- **Everything else** is emitted as `data/**/*.mjs` modules and loaded with
  literal `import()` calls from `src/loaders.generated.js`, so bundlers split
  it per country:
  - cities: one module per country and tier band;
  - levels 2–4 of subdivisions: one module per country;
  - airports and shapes: one module each.

  An esbuild browser build produces about 1,080 lazy chunks.
- **CommonJS** keeps `import()` (esbuild `supported['dynamic-import']`), so
  CommonJS users load the same ESM data modules.
- **Optional packages** (localities, postal) are imported by a variable name,
  so bundlers don't fail when they aren't installed. They read gzip files with
  `fs`, so they are Node.js only.

**City tiers.** These are GeoNames' own lists, and each tier includes the
bigger ones:

| Tier | Cities |
|---|---|
| 15000 | 34,215 |
| 5000 | 70,029 |
| 1000 | 171,838 |
| 500 | 237,004 |

They are stored as bands, so nothing is duplicated. `tier: 'all'` adds the
localities package.

**`resolveCityTimezone` order:**
1. the city in the country (and subdivision), including alternate names;
2. localities, if installed;
3. the most populous city of the subdivision;
4. the country's most populous city.

**Postal data.** For GB, CA and NL, GeoNames publishes only the first part of
the code. The GB full-postcode file (Royal Mail data) is deliberately left
out.

**Timezone polygons.** `geodata-kit-tz` has ODbL data, so it is a separate
package that `geodata-kit` never imports. The polygons are simplified to about
110 m. Where zones overlap, the smallest polygon wins; `getTimezonesAt`
returns all of them.

**Python.** The Python package reads the same JSON and is synchronous. It has
no polygon timezone lookup; Python users can use `timezonefinder`. The extras
are separate distributions: `geodata-kit-localities` and `geodata-kit-postal`.

## Refreshing the data

GeoNames rebuilds its dump daily and keeps no old snapshots, so the generated
data is committed and a refresh shows up as a diff. `refresh-data.yml` does
this every month and opens a PR into `dev`. To do it by hand:

```bash
npm install
npm run download -- --refresh     # GeoNames, CLDR, tzdata, Natural Earth, libphonenumber, address data, tz polygons
npm run extract -- --force        # ≈1 min
npm run wikidata                  # optional: refresh the Wikidata snapshot
npm run generate                  # ≈1.5 min, deterministic
npm run emit
npm test                          # 830 TypeScript tests
npm run python:test               # 779 Python tests
git diff --stat data/             # review what changed, then bump versions
```

To move to a newer CLDR, tzdata, Natural Earth, libphonenumber or
timezone-boundary-builder release, change the version constant in
`scripts/sources.ts`.

The generator fails instead of guessing when:
- one folded name points to two countries (resolve it in `overlays/aliases.json`);
- the current EU or Eurozone members differ from CLDR;
- a country's timezone is not canonical in tzdata.

## Tests

- `tests/golden/*.json`: 779 cases (countries, languages, groups, subdivisions,
  cities, airports and shapes, address, phone, tz) in a neutral format
  `{ fn, args, path, op, expect }`. Run by `tests/golden.test.ts` and
  `python/tests/test_golden.py`. The cases include the country names and
  aliases found in real project data, and the places `city-timezones` failed on.
- `tests/integrity.test.ts`: codes, timezones, national languages, group members, meta.
- `tests/data-budget.test.ts`: size budgets (measured + ~15%), tier nesting, attribution.
- `tests/phone-compare.test.ts`: 10,000 generated numbers against libphonenumber-js (dev dependency).
- `tests/tz-agreement.test.ts`: polygon timezones against GeoNames for all 34,215 cities15000.

## Branches, CI and releases

```
feature branch ──PR──▶ dev ──PR "Release x.y.z"──▶ main ──▶ npm + GitHub release
                  CI + changeset check     CI + release check     CI again, then publish
```

| When | Workflow | What runs |
|---|---|---|
| push to `dev`, PR into `dev` | `ci.yml`, `changeset.yml` | types, 830 TS tests, version sync, build, npm publish dry run; 779 Python tests, wheel build, `twine check`; for PRs into `dev`: **changeset present** |
| PR `dev` → `main` | `ci.yml` | the same, plus **ready to release**: no unapplied changesets, version newer than npm, changelog entry |
| merge into `main` | `release.yml` | all checks again, then publish every package whose version isn't on npm yet (with provenance), git tag `vX.Y.Z`, GitHub release with the changelog. A merge without a new version publishes nothing. Python packages are not published yet. |
| 3rd of every month, or by hand | `refresh-data.yml` | download and regenerate all data, run all tests, open a PR into `dev` with a patch changeset if anything changed |

### Day to day

1. Branch off `dev` and make the change.
2. Run `npm run changeset`. Pick the package and patch, minor or major (rules
   below), and write one line for the changelog. This creates
   `.changeset/<name>.md`; commit it with the change.
   - Changes users never see (CI, tests, the repository README) don't need
     one: add the label `no-changeset` to the PR.
3. Open a PR into `dev`. CI must pass.

### Releasing

1. On `dev`, run `npm run release:version`. It:
   - turns all changesets into one new version for every package;
   - writes the changelogs;
   - copies the version into the Python packages;
   - updates the lockfile.
2. Commit, push, and open a PR from `dev` into `main` titled "Release x.y.z".
3. Merge it. `release.yml` publishes everything; nothing else to do.

## Versions

All four npm packages and the Python packages always carry the **same version**
(a Changesets "fixed" group, synced to Python by `scripts/release/sync-versions.ts`).
That way users simply install the same version of everything. When a release
has several changesets, the biggest bump wins.

| Bump | When |
|---|---|
| **patch** 0.1.0 → 0.1.1 | data refresh (new GeoNames / CLDR / tzdata snapshot); bug fixes; new aliases or corrections; README fixes |
| **minor** 0.1.0 → 0.2.0 | new function, option, field, group, entry point or data source; resolving more inputs than before |
| **major** 0.x → 1.0.0, 1.x → 2.0.0 | removing or renaming a function, option, field or group slug; changing a return shape or a default (e.g. the default city tier); changing the data format shared by the main and optional packages; dropping a Node.js or Python version |

While the version starts with 0, users expect the API to settle. Release 1.0.0
once the API is stable; from then on, majors are only for breaking changes.

## One-time setup

Do these once, in this order, when the repository moves to GitHub:

1. **Branches.** Create `dev` from `main`. Protect both: changes only through
   pull requests, with the CI checks required.
   - `main`: require TypeScript, Python and "Ready to release".
   - `dev`: require TypeScript, Python and "Changeset present".
2. **Label.** Create a label named `no-changeset`.
3. **Environment.** Create an environment named `release`. Optionally add
   required reviewers, so every publish needs one click of approval.
4. **PyPI: not set up yet** (separate ticket). Two findings for it:
   - `geodata-kit` is blocked on PyPI as too similar to the existing
     `geodatakit`, so the package is named `geodata-kit-py`.
   - PyPI accepts a pending trusted publisher configuration (owner, repo,
     workflow, environment) for one new project only. The three projects need
     different environments or workflows, or two of them a first manual upload.
5. **npm.**
   1. Turn on 2FA with an authenticator app (npmjs.com → Account → Two-Factor
      Authentication).
   2. Publish version 0.1.0 once from your machine, because npm can only set
      up trusted publishing for packages that already exist:
      ```bash
      npm login
      npm ci && npm run build
      npm run release:publish-npm   # npm asks for the 2FA code
      ```
   3. On npmjs.com, for each of the four packages, open Settings → Trusted
      publisher → GitHub Actions. Enter this repository, workflow
      `release.yml`, environment `release`, and allow direct publish.
   4. Set "Require two-factor authentication and disallow tokens" under
      Settings → Publishing access.
   5. From then on every merge into `main` publishes without any token.
      Don't use npm tokens that bypass 2FA: npm is removing their publish
      rights (around January 2027).
6. **Optional:** add a fine-grained token with contents and pull-requests write
   as `REFRESH_PR_TOKEN`. Without it, GitHub doesn't run CI on the monthly
   data-refresh PRs (the refresh job runs all tests itself, so they are
   still checked).

The four npm packages were first published as 0.1.0 on 2026-11-12.

## Known limits

- **ISO 3166-2 on level 1:** 3,481 of 3,865 GeoNames level-1 subdivisions have
  an ISO code. The others mostly belong to places without ISO subdivisions,
  such as Puerto Rico's municipalities. The list is in `data/reports/subdivisions.json`.
- **Regional languages:** 67 regional languages have no subdivision mapping in
  Wikidata; they are listed in `data/reports/languages.json`.
- **Phone numbers:** two deliberate differences from libphonenumber-js, both
  following Google's reference library.
  - Regions without a mobile pattern (e.g. TA) give `fixed_line`.
  - National-only formats are used for national formatting.
- **Polygon timezones:** they agree with GeoNames for 99.67% of cities by zone
  name and 99.96% by current offset. The source has deliberate overlaps
  (Asia/Urumqi inside Asia/Shanghai); the smaller polygon wins.
- **`geodata-kit-localities` size:** it is 83 MB packed. If the npm registry
  rejects that size, split it per continent: `scripts/build/localities.ts`
  already writes one file per country.
- **Business groups:** they follow common definitions (written in
  `overlays/groups.json`). Teams that count differently can add codes, e.g.
  `expandGroups(['cee', 'AT'])`.

## Licences

Code MIT. Data keeps the licences of its sources; see [NOTICE](NOTICE) and
`data/meta.json`. `geodata-kit-tz` data is ODbL 1.0 (see its LICENSE-DATA).
