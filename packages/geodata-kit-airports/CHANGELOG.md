# geodata-kit-airports

## 0.2.0

### Minor Changes

- Split into separate packages, so you install only what you need.

  `geodata-kit` now contains countries, groups, languages and timezones only (about 2 MB installed instead of 70 MB). The former entry points are their own packages:

  | Before (0.1.0)             | Now                        |
  | -------------------------- | -------------------------- |
  | `geodata-kit/subdivisions` | `geodata-kit-subdivisions` |
  | `geodata-kit/cities`       | `geodata-kit-cities`       |
  | `geodata-kit/airports`     | `geodata-kit-airports`     |
  | `geodata-kit/shapes`       | `geodata-kit-shapes`       |
  | `geodata-kit/address`      | `geodata-kit-address`      |
  | `geodata-kit/phone`        | `geodata-kit-phone`        |

  To migrate, install the packages you use and change the import paths; the functions are the same, with two exceptions:

  - `getSubdivisionAt` (shapes) now returns `{ country, iso, code, name }` and no longer a `subdivision` object, so the package has no dependencies.
  - `geodata-kit` additionally exports the text helpers `cleanText` and `editDistance`.

### Patch Changes

- Updated dependencies
  - geodata-kit@0.2.0
