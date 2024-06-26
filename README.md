# remark-common-changelog

**Lint or fix a changelog written in markdown, following [`Common Changelog`](https://common-changelog.org).** Changelogs should be written by humans, for humans. This tool focuses on helping you do that.

[![npm status](http://img.shields.io/npm/v/remark-common-changelog.svg)](https://www.npmjs.org/package/remark-common-changelog)
[![Node version](https://img.shields.io/node/v/remark-common-changelog.svg)](https://www.npmjs.org/package/remark-common-changelog)
[![Test](https://img.shields.io/github/workflow/status/vweevers/remark-common-changelog/Test?label=test)](https://github.com/vweevers/remark-common-changelog/actions/workflows/test.yml)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript\&logoColor=fff)](https://standardjs.com)
[![Markdown Style Guide](https://img.shields.io/badge/hallmark-informational?logo=markdown)](https://github.com/vweevers/hallmark)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)

## Usage

_This package is ESM-only._

```js
import changelog from 'remark-common-changelog'
import vfile from 'to-vfile'
import { remark } from 'remark'

remark()
  .use(changelog)
  .process(vfile.readSync('CHANGELOG.md'), function (err, file) {
    if (err) throw err
    console.log(String(file))
  })
```

Pair with [`remark-github`](https://github.com/remarkjs/remark-github) for ultimate pleasure. If you're looking for a CLI that includes both, checkout [`hallmark`](https://github.com/vweevers/hallmark), a markdown style guide with linter and automatic fixer.

## Rules

### `title`

Changelog must start with a top-level "Changelog" heading. In `fix` mode, it is either added or updated.

### `release-heading-depth`

Release must start with second-level heading.

### `release-heading`

Release heading must have the format `<version> - <date>`.

### `release-version`

Release must have a semver-valid version, without `v` prefix. Releases that have no matching git tag are _not_ rejected, to support adding a git tag after updating the changelog.

### `release-version-link`

Release version must have a link. The destination URL is not linted. In `fix` mode links are automatically inserted (to `https://github.com/OWNER/REPO/releases/tag/$tag`) requiring a nearby `package.json` with a `repository` field. The link is optional for the oldest (last listed) release.

### `release-version-link-reference`

Use a link reference for version link.

Valid:

```md
## [1.0.0] - 2019-08-23

[1.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v1.0.0
```

Invalid:

```md
## [1.0.0](https://github.com/vweevers/remark-common-changelog/releases/tag/v1.0.0) - 2019-08-23
```

### `release-date`

Release must have a date with format `YYYY-MM-DD`.

### `latest-release-first`

Releases must be sorted latest-first according to semver rules. In `fix` mode, releases are reordered.

### `latest-definition-first`

Definitions must be sorted latest-first, same as releases. Any additional definitions (that don't describe a release) must be last. In `fix` mode, definitions are reordered.

Valid:

```md
[2.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v2.0.0
[1.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v1.0.0
```

Invalid:

```md
[1.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v1.0.0
[2.0.0]: https://github.com/vweevers/remark-common-changelog/releases/tag/v2.0.0
```

### `unique-release`

Each release must have a unique version.

### `no-empty-release`

A release must have content.

In fix mode, an empty release is filled with a commit log as a leg up. Merge commits are skipped. GitHub merge commits ("Merge pull request #n") are used to annotate commits with a PR number (best effort). Squashed GitHub commits that have a default commit description (a list of squashed commits) are converted to sublists.

Valid:

```md
## [2.0.0] - 2019-09-02

foo

## [1.0.0] - 2019-09-01

bar
```

Invalid:

```md
## [2.0.0] - 2019-09-02

## [1.0.0] - 2019-09-01
```

### `group-heading`

A "group" (of changes) must start with a third-level, text-only heading.

### `group-heading-type`

A group heading must be one of Changed, Added, Deprecated, Removed, Fixed, Security.

### `no-empty-group`

A group must not be empty. Invalid:

```md
### Added
### Fixed
```

### `no-uncategorized-changes`

There should not be a group with heading Uncategorized. This group is added by `remark-common-changelog` if the `fix` option is true and it populates an empty release with commits. This rule then hints that changes should be categorized.

### `filename`

Filename must be `CHANGELOG.md`.

To support using `remark-common-changelog` in a pipeline that runs on other files too, `remark-common-changelog` ignores files other than `CHANGELOG.md` but it does reject alternative extensions and the alternative names `HISTORY` and `RELEASES`.

## API

### `changelog([options])`

Options:

- `fix` (boolean): attempt to fix issues
- `cwd` (string): working directory, defaults to `cwd` of file or `process.cwd()`
- `pkg` (object): a parsed `package.json`, defaults to reading a nearby `package.json` (starting in `cwd` and then its parent directories)
- `repository` (string or object): defaults to `repository` field of `pkg`. Used to construct diff URLs.
- `version` (string): defaults to `version` field of `pkg` or the last tag. Used to identify a new release (anything that's greater than `version` and would normally be rejected in fix mode because it has no git tag yet) to support the workflow of updating a changelog before tagging.
- `add` (string): add a new release (only if `fix` is true) and populate it with commits. Value must be one of:
  - A release type: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`
    - These take the current version from the semver-latest tag, release or `package.json` (whichever is greatest if found) and bump it
    - The `major` type bumps the major version (for example `2.4.1 => 3.0.0`); `minor` and `patch` work the same way.
    - The `premajor` type bumps the version up to the next major version and down to a prerelease of that major version; `preminor` and `prepatch` work the same way.
    - The `prerelease` type works the same as `prepatch` if the current version is a non-prerelease. If the current is already a prerelease then it's simply incremented (for example `4.0.0-rc.2` to `4.0.0-rc.3`).
  - A [semver-valid](https://semver.org/) version like 2.4.0.
- `commits` (boolean, default `true`, only relevant for `add`): if `false`, don't populate the release with commits.
- `submodules` (boolean, only relevant for `add`): enable experimental git submodule support. Will collect commits from submodules and list them in the changelog as `<name>: <message>`.

#### Notes on `add`

If the (resulting) version is greater than the current version then commits will be taken from the semver-latest tag until HEAD. I.e. documenting a new release before it's git-tagged. If the version matches an existing tag then a release will be inserted at the appriopriate place, populated with commits between that version's tag and the one before it. I.e. documenting a past release after it's git-tagged. If the version equals `0.0.1`, `0.1.0` or `1.0.0` and zero versions exist, then a [notice](https://common-changelog.org/#23notice) will be inserted (rather than commits) containing the text `:seedling: Initial release.`.

Works best on a linear git history without merge commits. If `remark-common-changelog` encounters other tags in the commit range it will stop there and not include further (older) commits.

Git [trailers](https://git-scm.com/docs/git-interpret-trailers) ("lines that look similar to RFC 822 e-mail headers, at the end of the otherwise free-form part of a commit message") can provide structured information to the generated changelog. The following trailer keys are supported (case-insensitive):

- `Category`: one of `change`, `addition`, `removal`, `fix`, or `none`. If `none` then the commit will be excluded from the changelog. If not present then the change will be listed under Uncategorized and will require manual categorization.
- `Notice`: a [notice](https://common-changelog.org/#23-notice) for the release. If multiple commits contain a notice, they will be joined as sentences (i.e. ending with a dot) separated by a space.
- `Ref`, `Refs`, `Fixes`, `Closes` or `CVE-ID`: a numeric reference in the form of `#N`, `PREFIX-N` or `CVE-N-N` where `N` is a number and `PREFIX` is at least 2 letters. For example `#123`, `GH-123`, `JIRA-123` or `CVE-2024-123`. Can be repeated, either with multiple trailer lines or by separating references with a comma - e.g. `Ref: #1, #2`. Non-numeric references are ignored.
- `Co-Authored-By`: co-author in the form of `name <email>`. Can be repeated.

For example, the following commit (which has Bob as git author, let's say):

```
Bump math-utils to 4.5.6

Ref: JIRA-123
Category: change
Co-Authored-By: Alice <alice@example.com>
```

Turns into:

```md
## Changed

- Bump math-utils to 4.5.6 (d23ba8f) (JIRA-123) (Bob, Alice)
```

## Install

With [npm](https://npmjs.org) do:

```
npm install remark-common-changelog
```

## License

[MIT](LICENSE)
