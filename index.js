'use strict'

const is = require('unist-util-is')
const u = require('unist-builder')
const semver = require('semver')
const isSorted = require('is-array-sorted')
const Githost = require('find-githost')
const closest = require('read-closest-package')
const path = require('path')
const execFileSync = require('child_process').execFileSync
const Changelog = require('./lib/changelog')
const getCommits = require('./lib/git-log-between')
const getChanges = require('./lib/get-changes')
const plugin = require('./package.json').name

const REJECT_NAMES = new Set(['history', 'releases', 'changelog'])
const GROUP_TYPES = new Set(['Changed', 'Added', 'Deprecated', 'Removed', 'Fixed', 'Security'])
const UNCATEGORIZED = 'Uncategorized'

module.exports = function attacher (opts) {
  opts = opts || {}

  const fix = !!opts.fix
  const submodules = !!opts.submodules
  const add = opts.add
  const parse = (str) => this.parse(str).children

  return async function transform (root, file) {
    if (file.basename && file.basename !== 'CHANGELOG.md') {
      if (REJECT_NAMES.has(file.stem.toLowerCase())) {
        warn('Filename must be CHANGELOG.md', root, 'filename')
      }

      return
    }

    if (!is(root, 'root') || !root.children) {
      throw new Error('Expected a root node')
    }

    const cwd = path.resolve(opts.cwd || file.cwd)
    const pkg = lazyPkg(cwd, opts.pkg)
    const githubUrl = repo(cwd, opts, pkg)
    const tags = gitTags(cwd)
    const currentVersion = opts.version || pkg().version || lastTagVersion(tags) || '0.0.0'

    if (semver.valid(currentVersion) !== currentVersion) {
      throw new Error('No valid version found in package.json or options')
    }

    const changelog = Changelog(parse, root.children)
    const versions = new Set()

    if (fix) {
      changelog.buildHeading()
    } else if (!changelog.hasValidHeading()) {
      warn('Changelog must start with a top-level "Changelog" heading', changelog.heading || root, 'title')
    }

    if (fix) {
      if (add) {
        addRelease(add)
      }

      changelog.children.sort(cmpRelease)
    } else if (!isSorted(changelog.children, { comparator: cmpRelease })) {
      warn('Releases must be sorted latest-first', root, 'latest-release-first')

      // Sort anyway (doesn't affect original tree) so that we
      // can correctly compute diff urls and commit ranges below.
      changelog.children.sort(cmpRelease)
    }

    changelog.children.forEach(relateVersions)
    await Promise.all(changelog.children.map(lintRelease))

    // Lint or rebuild headings, with links and definitions
    for (let i = 0; i < changelog.children.length; i++) {
      const { version, date, linkType, heading } = changelog.children[i]

      if (!version) continue

      const identifier = version.toLowerCase()
      const oldUrl = (changelog.definitions.get(identifier) || {}).url
      const url = oldUrl || defaultReleaseUrl(githubUrl, tags, version)
      const isFirstRelease = i === changelog.children.length - 1

      if (fix) {
        const label = identifier
        const referenceType = 'shortcut'

        heading.children = [u('linkReference', { identifier, label, referenceType }, [
          u('text', version)
        ])]

        heading.children.push(u('text', ` - ${date || 'YYYY-MM-DD'}`))
        changelog.definitions.set(identifier, u('definition', { identifier, label, url, title: null }))
      } else if (!isFirstRelease) {
        if (!linkType) {
          warn('Release version must have a link', heading, 'release-version-link')
        } else if (linkType !== 'linkReference') {
          warn('Use link reference in release heading', heading, 'release-version-link-reference')
        }
      }
    }

    if (fix) {
      changelog.definitions = sortMap(changelog.definitions, cmpVersion)
    } else if (!isMapSorted(changelog.definitions, cmpVersion)) {
      warn('Definitions must be sorted latest-first', root, 'latest-definition-first')
    }

    if (fix) {
      // Reconstruct tree
      root.children = changelog.tree()
      return root
    }

    // Add previousVersion property to releases, used to find commits between releases
    function relateVersions (release, i, arr) {
      release.previousVersion = arr[i + 1] ? arr[i + 1].version : null

      if (release.version) {
        // For when not all tags have releases, find a tag between this release and the previous
        // TODO: use a binary search
        const ti = tags.findIndex(el => el.version === release.version)
        const previousTag = ti >= 0 ? tags[ti + 1] && tags[ti + 1].version : tags[0] && tags[0].version
        const gt = (v) => release.previousVersion ? semver.gt(v, release.previousVersion) : true

        // Take it if previous release < previous tag < version
        if (previousTag && gt(previousTag) && semver.gt(release.version, previousTag)) {
          release.previousVersion = previousTag
        }
      }
    }

    function addRelease (add) {
      if (Array.isArray(add)) {
        add.forEach(addRelease)
        return
      } else if (typeof add !== 'string' || add === '') {
        warn('Target must be a non-empty string', root, 'add-new-release')
        return
      }

      let target = semver.valid(add)
      const specificVersion = !!target

      if (!target) {
        let from = currentVersion

        // Take version of last release if greater than current version
        const lastRelease = changelog.children[0] && changelog.children[0].version

        if (lastRelease && semver.gt(lastRelease, from)) {
          from = lastRelease
        }

        target = semver.inc(from, add)
      }

      if (!target) {
        warn(`Target (${add}) must be a version or release type ([pre]major, [pre]minor, [pre]patch or prerelease)`, root, 'add-new-release')
        return
      } else if (changelog.children.some(release => release.version === target)) {
        warn(`Target version ${target} already exists`, root, 'add-new-release')
        return
      }

      // Take date from tag if it exists and was annotated
      const date = specificVersion ? tagDate(cwd, 'v' + target) : null
      const Ctor = opts.Date || Date

      // Will be sorted and populated by other code
      changelog.createRelease(target, releaseDate(date || new Ctor()))
    }

    async function lintRelease (release) {
      const { heading } = release

      if (!is(heading, { depth: 2 })) {
        warn('Release must start with second-level heading', heading, 'release-heading-depth')
        return
      } else if (!release.parseable) {
        warn('Release heading must have the format "<version> - <date>"', heading, 'release-heading')
        return
      }

      if (release.version) {
        if (versions.has(release.version)) {
          warn('Release version must be unique', heading, 'unique-release')
        }

        versions.add(release.version)
      }

      if (!release.version) {
        warn('Release must have a version', heading, 'release-version')
      } else if (semver.valid(release.version) !== release.version) {
        warn('Release version must be semver-valid', heading, 'release-version')
      }

      if (!release.date) {
        warn('Release must have date', heading, 'release-date')
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) {
        warn('Release date must have format YYYY-MM-DD', heading, 'release-date')
      }

      if (release.isEmpty()) {
        await lintEmptyRelease(release)
      }

      const hasUncategorizedChanges = release.children.some(function (group) {
        return group.type() === UNCATEGORIZED && !group.isEmpty()
      })

      release.children.forEach(function (group) {
        lintGroup(group, hasUncategorizedChanges)
      })
    }

    async function lintEmptyRelease (release) {
      const { heading, version, previousVersion } = release

      if (fix && version && previousVersion) {
        const gt = forgivingTag(previousVersion, tags)
        const opts = { cwd, gt, limit: 100, submodules }

        if (isNewVersion(version, previousVersion)) {
          opts.lte = 'HEAD'
        } else {
          opts.lt = forgivingTag(version, tags)
        }

        let commits

        try {
          commits = await getCommits(opts)
        } catch (err) {
          const msg = `Failed to get commits for release (${version}): ${err.message}`
          warn(msg, heading, 'no-empty-release')
          return
        }

        const grouped = getChanges(commits)

        // Add other types as a hint to categorize
        const insertEmpty = grouped[UNCATEGORIZED].length > 0

        for (const type in grouped) {
          const changes = grouped[type]

          if (!changes.length && (!insertEmpty || type === UNCATEGORIZED)) {
            continue
          }

          const group = release.createGroup(type)

          if (changes.length) {
            group.createList(changes)
          }
        }

        if (!release.isEmpty()) return
      }

      warn(`Release (${version || 'n/a'}) is empty`, heading, 'no-empty-release')
    }

    function lintGroup (group, hasUncategorizedChanges) {
      if (!group.hasValidHeading()) {
        warn('Group must start with a third-level, text-only heading', group.heading, 'group-heading')
        return
      }

      const type = group.type()
      const types = Array.from(GROUP_TYPES).join(', ')

      if (!type) {
        warn(`Group heading must be one of ${types}`, group.heading, 'group-heading-type')
      } else if ((type === UNCATEGORIZED || !hasUncategorizedChanges) && group.isEmpty()) {
        warn(`Remove empty group ${type}`, group.heading, 'no-empty-group')
      } else if (!GROUP_TYPES.has(type)) {
        if (type === UNCATEGORIZED) {
          warn('Categorize the changes', group.heading, 'no-uncategorized-changes')
        } else {
          warn(`Group heading must be one of ${types}`, group.heading, 'group-heading-type')
        }
      }
    }

    function warn (msg, node, rule) {
      file.message(msg, node, `${plugin}:${rule}`)
    }

    function lazyPkg (cwd, pkg) {
      return function () {
        pkg = pkg || closest.sync({ cwd }) || {}
        return pkg
      }
    }

    function isNewVersion (nextVersion, previousVersion) {
      return previousVersion === currentVersion &&
        cmpVersion(nextVersion, currentVersion) < 0
    }
  }
}

function cmpRelease (a, b) {
  // Retain original sort order of invalid releases
  if (!a.version || !b.version) return a.index - b.index
  return cmpVersion(a.version, b.version)
}

function cmpVersion (a, b) {
  if (a === b) return 0

  let av = semver.valid(a)
  let bv = semver.valid(b)

  // Make -rc9 vs -rc10 sortable by converting to (proper) -rc.9 vs -rc.10
  if (av) av = av.replace(/-rc(\d+)$/, (m, p1) => '-rc.' + p1)
  if (bv) bv = bv.replace(/-rc(\d+)$/, (m, p1) => '-rc.' + p1)

  return av && bv ? semver.compare(bv, av) : av ? -1 : bv ? 1 : a.localeCompare(b)
}

function defaultReleaseUrl (githubUrl, tags, version) {
  return `${githubUrl}/releases/tag/${forgivingTag(`v${version}`, tags)}`
}

// If a (historical) tag without "v" prefix exists, use that.
function forgivingTag (tag, tags) {
  if (tag[0] !== 'v') tag = 'v' + tag
  const match = tags.find(el => el.normalTag === tag)
  if (match) return match.tag
  return tag
}

function gitTags (cwd) {
  const output = execFileSync('git', ['tag'], {
    cwd, maxBuffer: 1024 * 1024 * 16, encoding: 'utf8'
  })

  const tags = output.split(/\r?\n/).map(tag => {
    const version = tag && semver.valid(tag)
    return version ? { tag, normalTag: 'v' + version, version } : null
  })

  return tags.filter(Boolean).sort((a, b) => cmpVersion(a.version, b.version))
}

function tagDate (cwd, tag) {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%aI', tag], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()

    return iso ? new Date(iso) : null
  } catch {
    return null
  }
}

function lastTagVersion (tags) {
  return tags.length ? tags[0].version : null
}

function repo (cwd, options, pkg) {
  if (options.repository) {
    return Githost.fromUrl(options.repository, { committish: false }).homepage()
  }

  const host = (
    Githost.fromPkg(pkg(), { committish: false, optional: true }) ||
    Githost.fromGit(cwd, { committish: false })
  )

  return host.homepage()
}

function isMapSorted (map, comparator) {
  return isSorted(Array.from(map.keys()), { comparator })
}

function sortMap (map, comparator) {
  const entries = Array.from(map.entries())
  entries.sort((a, b) => comparator(a[0], b[0]))
  return new Map(entries)
}

function releaseDate (date) {
  const yyyy = date.getFullYear()
  const mm = twoDigits(date.getMonth() + 1)
  const dd = twoDigits(date.getDate())

  return `${yyyy}-${mm}-${dd}`
}

function twoDigits (n) {
  return n < 10 ? `0${n}` : n
}
