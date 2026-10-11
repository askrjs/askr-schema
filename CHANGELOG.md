# Changelog

## Unreleased

## 0.5.0 - 2026-10-10

### Breaking changes

- Prepare a seven-name root API for 0.5.0, reduced from 21 reachable declaration
  names. Remove `SafeParseResult`, `StringFormat` and twelve leaked implementation
  names through an explicit barrel. [Complete decisions and migration](docs/0.5.0-api.md)
  retain the six real authoring/integration types and the `schema` namespace.
- Reject invalid constructor constraints, non-finite literals, duplicate enums,
  empty combinators and cyclic/projection depth above 256 with construction errors.
- Return one root size issue before visiting children of input exceeding
  `maxItems`/`maxProperties`.

### Added

- Packed positive/negative runtime/type contracts in ordinary three-OS CI,
  implementation coverage and a complete builder projection parity matrix.

### Fixed

- Snapshot constructor options, enum members and object declarations so later
  caller mutation cannot change parsing while leaving its projection frozen.
- Validate sparse array slots explicitly and prevent inherited entries from
  satisfying missing own slots, preserving complete index paths.
- Bound projection construction with cycle/depth guidance while permitting
  shared references and recovery after rejected construction.
- Invoke the packed test's npm CLI through Node so it executes on Windows.
- Update compatible development tooling to clear worker/formatter/source-map
  dependency advisories.

### Development

- First-party development workflows use Vite+; specialized compiler, runtime,
  browser, and package checks remain part of validation.

## 0.4.1 - 2026-09-30

### Fixed

- Accept nil and max UUID sentinel values while continuing to reject malformed values.
