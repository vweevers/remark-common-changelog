# Changelog

## [2.0.0] - 2021-11-14

### Changed

- **Breaking:** use ESM and drop Node.js < 12.20 ([`a8eacb4`](https://github.com/vweevers/remark-common-changelog/commit/a8eacb4))
- Bump dependencies ([`c8c8352`](https://github.com/vweevers/remark-common-changelog/commit/c8c8352))

## [1.0.0] - 2021-11-14

_First stable release._

### Fixed

- Ensure git tags are not used in lint mode ([`3e6ed2d`](https://github.com/vweevers/remark-common-changelog/commit/3e6ed2d))

## [0.0.3] - 2021-11-13

### Changed

- Refactor: use `find-githost` ([`d4230e8`](https://github.com/vweevers/remark-common-changelog/commit/d4230e8))

### Added

- Add `commits` option to disable populating a release with commits ([`7b63df0`](https://github.com/vweevers/remark-common-changelog/commit/7b63df0))

### Fixed

- When fetching commits, stop if a tagged object is encountered ([`559e8b8`](https://github.com/vweevers/remark-common-changelog/commit/559e8b8))
- When fetching commits, use nearest tag as lower bound ([`a9e87ca`](https://github.com/vweevers/remark-common-changelog/commit/a9e87ca))
- Detect dependabot as bot ([`ec1c31c`](https://github.com/vweevers/remark-common-changelog/commit/ec1c31c))

## [0.0.2] - 2021-11-12

### Fixed

- Take date from git tag (if any) when adding a release ([`9cde534`](https://github.com/vweevers/remark-common-changelog/commit/9cde534))

## [0.0.1] - 2021-11-12

_:seedling: Initial release._

[2.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v2.0.0

[1.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v1.0.0

[0.0.3]: https://github.com/vweevers/remark-common-changelog/releases/tag/v0.0.3

[0.0.2]: https://github.com/vweevers/remark-common-changelog/releases/tag/v0.0.2

[0.0.1]: https://github.com/vweevers/remark-common-changelog/releases/tag/v0.0.1
