import test from 'tape'
import fs from 'fs'
import path from 'path'
import { remark } from 'remark'
import tempy from 'tempy'
import { execFileSync } from 'child_process'
import plugin from '../index.js'
import versionCommitRe from '../lib/version-commit-re.js'

test('lints various', function (t) {
  run('00-various-input', '00-various-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-1:4: Changelog must start with a top-level "Changelog" heading`,
      `${file.path}:1:1-24:58: Releases must be sorted latest-first`,
      `${file.path}:3:1-3:42: Release (3.0.0) is empty`,
      `${file.path}:16:1-16:22: Release date must have format YYYY-MM-DD`,
      `${file.path}:3:1-3:42: Use link reference in release heading`,
      `${file.path}:16:1-16:22: Release version must have a link`
    ])
    t.end()
  })
})

test('fixes various', function (t) {
  run('00-various-input', '00-various-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    if (actual !== expected) {
      console.error(expected + '\n')
      console.error(actual + '\n')
    }
    t.same(file.messages.map(String).sort(), [
      // Can't be fixed
      `${file.path}:16:1-16:22: Release date must have format YYYY-MM-DD`,

      // TODO: write test
      `${file.path}:3:1-3:42: Failed to get commits for release (3.0.0) (> v2.0.1 <= HEAD): Could not find v2.0.1.`
    ])
    t.end()
  })
})

test('lints empty', function (t) {
  run('01-empty-input', '01-empty-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-1:1: Changelog must start with a top-level "Changelog" heading`
    ])
    t.end()
  })
})

test('fixes empty', function (t) {
  run('01-empty-input', '01-empty-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
    t.end()
  })
})

for (const filename of ['RELEASES.md', 'HISTORY.md', 'changelog.md', 'CHANGELOG.markdown', 'changelog.foo', 'CHANGELOG']) {
  test('lints invalid filename: ' + filename, function (t) {
    run('02-minimum', '02-minimum', { filename, options: { fix: false } }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(actual, expected)
      t.same(file.messages.map(String), [
        `${file.path}:1:1-1:12: Filename must be CHANGELOG.md`
      ])
      t.end()
    })
  })
}

test('lints duplicate version', function (t) {
  run('03-duplicate-version', '03-duplicate-version', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:7:1-7:22: Release version must be unique`,
      `${file.path}:3:1-3:22: Release version must have a link`
    ])
    t.end()
  })
})

test('lints group type', function (t) {
  run('04-group-type', '04-group-type', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:5:1-5:8: Group heading must be one of Changed, Added, Deprecated, Removed, Fixed, Security`
    ])
    t.end()
  })
})

test('does not break on wrong release header level', function (t) {
  run('05-wrong-level', '05-wrong-level', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
    t.end()
  })
})

test('sorts releases and definitions', function (t) {
  t.plan(6)

  run('06-unsorted-input', '06-unsorted-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-23:58: Releases must be sorted latest-first`,
      `${file.path}:1:1-23:58: Definitions must be sorted latest-first`
    ])
  })

  run('06-unsorted-input', '06-unsorted-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
  })
})

test('sorts extra definitions lexicographically', function (t) {
  t.plan(6)

  run('07-extra-defs-input', '07-extra-defs-input', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:1:1-27:58: Definitions must be sorted latest-first`
    ])
  })

  run('07-extra-defs-input', '07-extra-defs-output', { options: { fix: true } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [])
  })
})

test('lints empty group', function (t) {
  run('08-empty-group', '08-empty-group', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:5:1-5:10: Remove or fill empty group Added`,
      `${file.path}:7:1-7:10: Remove or fill empty group Fixed`,
      `${file.path}:9:1-9:4: Group must start with a third-level, text-only heading`
    ])
    t.end()
  })
})

test('lints uncategorized changes', function (t) {
  run('09-uncategorized', '09-uncategorized', { options: { fix: false } }, (err, { file, actual, expected }) => {
    t.ifError(err)
    t.is(actual, expected)
    t.same(file.messages.map(String), [
      `${file.path}:9:1-9:10: Remove or fill empty group Fixed`,
      `${file.path}:11:1-11:18: Remove or fill empty group Uncategorized`,
      `${file.path}:19:1-19:18: Categorize the changes`
    ])
    t.end()
  })
})

// Should work regardless of whether a package.json is present
for (const withPackage of [true, false]) {
  test(`add prerelease (withPackage: ${withPackage})`, function (t) {
    const options = {
      fix: true,
      add: 'prerelease',
      Date: function () {
        return new Date('2020-01-02')
      }
    }

    const commits = [
      { version: '1.0.0-rc.9' },
      { message: 'Fix beep boop' }
    ]

    run('10-add-input', '10-add-output', { withPackage, options, commits }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(replaceCommitReferences(actual), expected)
      t.same(file.messages.map(String), [
        `${file.path}:1:1-1:1: Categorize the changes`
      ])
      t.end()
    })
  })

  test(`add prerelease on older release line (withPackage: ${withPackage})`, function (t) {
    const options = {
      fix: true,
      add: 'prerelease',
      Date: function () {
        return new Date('2020-01-02')
      }
    }

    const commits = [
      { version: '1.0.0-rc.9' },
      { message: 'Fix beep boop' },
      { branch: 'v2.x', message: 'Boop' },
      { version: '2.0.0' },
      { branch: 'main' }
    ]

    run('10-add-input', '10-add-output', { withPackage, options, commits }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(replaceCommitReferences(actual), expected)
      t.same(file.messages.map(String), [
        `${file.path}:1:1-1:1: Categorize the changes`
      ])
      t.end()
    })
  })

  test(`add preexisting release (withPackage: ${withPackage})`, function (t) {
    const options = {
      fix: true,
      add: '1.0.0-rc.9'
    }

    const commits = [
      { version: '1.0.0-rc.8' },
      { message: 'Prepare 1.0.0-rc.9' },
      { version: '1.0.0-rc.9' },
      { message: 'Prepare 1.0.0-rc.10' },
      { version: '1.0.0-rc.10' }
    ]

    run('11-add-input', '11-add-output', { withPackage, options, commits }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(replaceCommitReferences(actual), replaceDates(expected))
      t.same(file.messages.map(String), [
        `${file.path}:1:1-1:1: Categorize the changes`
      ])
      t.end()
    })
  })

  for (const type of ['major', 'minor', 'patch']) {
    test(`add initial ${type} release (withPackage: ${withPackage})`, function (t) {
      const options = {
        fix: true,
        add: type,
        Date: function () {
          return new Date('2022-09-18')
        }
      }

      // These should be ignored
      const commits = [
        { message: 'Beep' },
        { message: 'Boop' }
      ]

      run('12-add-input', `12-add-output-${type}`, { withPackage, options, commits }, (err, { file, actual, expected }) => {
        t.ifError(err)
        t.is(replaceCommitReferences(actual), expected)
        t.same(file.messages.map(String), [])
        t.end()
      })
    })
  }

  test(`add release with git trailers (withPackage: ${withPackage})`, function (t) {
    const options = {
      fix: true,
      add: 'major',
      Date: function () {
        return new Date('2024-04-04')
      }
    }

    const commits = [
      { version: '1.0.0' },
      { message: 'Fix vulnerability\nCategory: fix\nCVE-ID: CVE-2024-123\nReviewed-By: beep\nSigned-Off-By: boop' },
      { message: 'Add calendar\nCategory: addition.\nFixes: #44\nRef: #45, #46\nRefs: #47' },
      { message: 'Fix pastel colors\nCategory: fix\nCo-Authored-By: Alice <alice@example.com>' },
      { message: 'Refactor controllers\nCategory: change\nNotice: Foo bar\n  baz.' }
    ]

    run('20-add-input', '20-add-output', { withPackage, options, commits }, (err, { file, actual, expected }) => {
      t.ifError(err)
      t.is(replaceCommitReferences(actual), expected)
      t.same(file.messages.map(String), [])
      t.end()
    })
  })
}

test('versionCommitRe', function (t) {
  t.ok(versionCommitRe.test('3.3.0'))
  t.ok(versionCommitRe.test('0.0.123'))
  t.ok(versionCommitRe.test('3.3.0-rc.1.2.3.abc'))
  t.ok(versionCommitRe.test('v3.3.0'))
  t.ok(versionCommitRe.test('bump 3.3.0'))
  t.ok(versionCommitRe.test('bumped 3.3.0'))
  t.ok(versionCommitRe.test('Bumped v3.3.0'))
  t.ok(versionCommitRe.test('chore: 3.3.0'))
  t.ok(versionCommitRe.test('chore (release):3.3.0'))
  t.ok(versionCommitRe.test('chore(release):3.3.0'))
  t.ok(versionCommitRe.test('chore(release): v3.3.0'))

  t.notOk(versionCommitRe.test(''))
  t.notOk(versionCommitRe.test('a'))
  t.notOk(versionCommitRe.test('x3.3.0'))
  t.notOk(versionCommitRe.test('xbump 3.3.0'))
  t.notOk(versionCommitRe.test('chore: foo'))
  t.notOk(versionCommitRe.test('bump foo'))

  t.end()
})

function run (inputFixture, outputFixture, opts, test) {
  const cwd = tempy.directory()
  const inputFile = new URL('./fixture/' + inputFixture + '.md', import.meta.url)
  const outputFile = new URL('./fixture/' + outputFixture + '.md', import.meta.url)
  const pkgFile = path.join(cwd, 'package.json')
  const dummyFile = path.join(cwd, 'dummy-file')
  const { options, commits } = opts
  const withPackage = opts.withPackage !== false
  const repository = 'https://github.com/test/test.git'
  const stdio = 'ignore'

  const pkg = {
    name: 'test',
    version: '0.0.0',
    repository,
    private: true
  }

  let count = 0

  execFileSync('git', ['init', '-b', 'main', '.'], { cwd, stdio })
  fs.writeFileSync(dummyFile, String(count))

  if (withPackage) {
    fs.writeFileSync(pkgFile, JSON.stringify(pkg))
  } else {
    // Without a package, git origin will be used to get repository
    execFileSync('git', ['remote', 'add', 'origin', repository], { cwd, stdio })
  }

  if (commits) {
    execFileSync('git', ['config', 'user.name', 'test user'], { cwd, stdio })
    execFileSync('git', ['config', 'user.email', 'test@localhost'], { cwd, stdio })
    execFileSync('git', ['add', 'dummy-file'], { cwd, stdio })
    if (withPackage) execFileSync('git', ['add', 'package.json'], { cwd, stdio })
    execFileSync('git', ['commit', '-m', 'Initial'], { cwd, stdio })

    for (const { message, version, branch } of commits) {
      if (branch === 'main') {
        execFileSync('git', ['checkout', branch], { cwd, stdio })
      } else if (branch) {
        execFileSync('git', ['checkout', '-b', branch], { cwd, stdio })
      }

      if (message) {
        fs.writeFileSync(dummyFile, String(++count))
        execFileSync('git', ['commit', '-am', message], { cwd, stdio })
      }

      if (version) {
        if (withPackage) {
          pkg.version = version
          fs.writeFileSync(pkgFile, JSON.stringify(pkg))
        } else {
          fs.writeFileSync(dummyFile, String(++count))
        }

        execFileSync('git', ['commit', '-am', version], { cwd, stdio })
        execFileSync('git', ['tag', '-a', 'v' + version, '-m', 'v' + version], { cwd, stdio })
      }
    }
  }

  const input = fs.readFileSync(inputFile, 'utf8').trim().replace(/\r\n/g, '\n')
  const expected = fs.readFileSync(outputFile, 'utf8').trim().replace(/\r\n/g, '\n')

  remark()
    .use({
      settings: {
        fences: true,
        listItemIndent: 'one',
        bullet: '-',
        emphasis: '_'
      }
    })
    .use(() => (tree, file) => {
      file.path = path.join(cwd, opts.filename || 'CHANGELOG.md')
      file.cwd = cwd
    })
    .use(plugin, options)
    .process(input, (err, file) => {
      const actual = String(file).trim().replace(/\r\n/g, '\n')
      process.nextTick(test, err, { file, cwd, actual, expected })
    })
}

function replaceCommitReferences (str) {
  return str.replace(/\([a-z0-9]{7}\)/g, '(xxxxxxx)')
}

function replaceDates (str) {
  return str.replace(/YYYY-MM-DD/g, releaseDate())
}

function releaseDate () {
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = twoDigits(date.getMonth() + 1)
  const dd = twoDigits(date.getDate())

  return `${yyyy}-${mm}-${dd}`
}

function twoDigits (n) {
  return n < 10 ? `0${n}` : n
}
