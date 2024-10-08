const CATEGORIES = new Map([
  ['change', 'Changed'],
  ['addition', 'Added'],
  ['removal', 'Removed'],
  ['fix', 'Fixed'],
  ['uncategorized', 'Uncategorized'],

  // Means to exclude commit
  ['none', null]
])

const TRAILER_CATEGORY = 1
const TRAILER_NOTICE = 2
const TRAILER_CO_AUTHOR = 3
const TRAILER_REF = 4
const TRAILER_EXCLUDE = 5

export default function getChanges (commits) {
  const grouped = {
    Changed: [],
    Added: [],
    Removed: [],
    Fixed: [],
    Uncategorized: []
  }

  for (const commit of commits) {
    if (commit.isMergeCommit) {
      continue
    }

    let title = commit.title

    const shortRef = commit.oid.slice(0, 7)
    const author = isBot(commit.author) ? merger(commit) : commit.author
    const metadata = getMetadata(commit.description || '', author)

    // Add references to GH PRs and commits, and include links if we know the
    // github repository, else let remark-github handle that. For submodules,
    // remark-github lacks the necessary context and would link to the wrong
    // repo. Plus, for commit references, we can shorten the link text a bit,
    // e.g. [abcdef0] rather than [owner/repo@abcdef0].

    if (commit.ghrepo) {
      title = title.replace(/#\d+/g, (ref) => {
        return issueLink(commit.ghrepo, ref.slice(1))
      })
    }

    title = prefixTitle(title, commit.submodule)

    if (metadata.references.length > 0) {
      const refs = metadata.references.map(ref => {
        if (commit.ghrepo && ref.startsWith('#')) {
          return issueLink(commit.ghrepo, ref.slice(1))
        } else {
          return ref
        }
      })

      title += ` (${refs.join(', ')})`
    }

    if (commit.ghrepo) {
      if (commit.pr) title += ` (${issueLink(commit.ghrepo, commit.pr)})`
      else if (shortRef) title += ` (${commitLink(commit.ghrepo, shortRef)})`
    } else if (!commit.submodule) {
      if (commit.pr) title += ` (#${commit.pr})`
      else if (shortRef) title += ` (${shortRef})`
    }

    if (metadata.authors.length > 0) {
      title += ` (${metadata.authors.join(', ')})`
    }

    const category = metadata.category
      ? CATEGORIES.get(metadata.category)
      : 'Uncategorized'

    if (category) {
      grouped[category].push({
        title,
        description: metadata.description,
        notice: metadata.notice
      })
    }
  }

  return grouped
}

function issueLink (repo, issue) {
  return `[#${issue}](https://github.com/${repo}/issues/${issue})`
}

function commitLink (repo, commit) {
  return `[\`${commit}\`](https://github.com/${repo}/commit/${commit})`
}

function prefixTitle (title, subsystem) {
  if (/^breaking:/i.test(title)) {
    title = title.slice(9).trim()
    subsystem = subsystem ? `${subsystem} (breaking)` : 'Breaking'
  }

  return subsystem ? `**${subsystem}:** ${title}` : title
}

function getMetadata (description, author) {
  const metadata = {
    description: null,
    category: null,
    notice: null,
    references: [],
    authors: null
  }

  const lines = description.split(/\r?\n/)
  const authors = new Set()

  // Rebuild a clean description
  description = ''

  // Parse git trailers (https://git-scm.com/docs/git-interpret-trailers)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const pos = line.indexOf(':')
    const key = pos > 0 ? getTrailerKey(line.slice(0, pos)) : null

    if (!key) {
      description += line + '\n'
      continue
    }

    let value = line.slice(pos + 1).trim()

    // Take multiline value
    while (i + 1 < lines.length && lines[i + 1].startsWith('  ')) {
      if (value.length !== 0) value += ' '
      value += lines[++i].trim()
    }

    switch (key) {
      case TRAILER_CATEGORY: {
        if (value.endsWith('.')) value = value.slice(0, value.length - 1)
        if (CATEGORIES.has(value)) metadata.category = value
        break
      }
      case TRAILER_NOTICE: {
        if (value) metadata.notice = value
        break
      }
      case TRAILER_CO_AUTHOR: {
        // Loosely parse "name <email>" because we only want the name anyway
        const sep = value.indexOf('<')

        if (sep > 0) {
          const author = value.slice(0, sep).trim()

          if (author.length !== 0 && !isBot({ name: author })) {
            authors.add(author)
          }
        }

        break
      }
      case TRAILER_REF: {
        if (value.endsWith('.')) value = value.slice(0, value.length - 1)
        const refs = value.split(/\s*,\s*/)
        metadata.references.push(...refs.filter(isNumericReference))
        break
      }
    }
  }

  // Exclude bot authors unless that's the only author
  if (author && author.name && (authors.size === 0 || !isBot(author)) && !authors.has(author.name)) {
    metadata.authors = [author.name, ...authors]
  } else {
    metadata.authors = Array.from(authors)
  }

  metadata.description = description.trim()
  return metadata
}

function merger (commit) {
  return commit.mergeCommit ? commit.mergeCommit.author : commit.committer
}

function isBot (author) {
  return author.name === 'Greenkeeper' ||
    author.name === 'greenkeeper[bot]' ||
    (author.email && author.email.endsWith('@greenkeeper.io')) ||
    author.name === 'dependabot[bot]' ||
    author.name === 'github-actions'
}

function getTrailerKey (key) {
  if (/^Category$/i.test(key)) return TRAILER_CATEGORY
  if (/^Notice$/i.test(key)) return TRAILER_NOTICE
  if (/^Co-Authored-By$/i.test(key)) return TRAILER_CO_AUTHOR
  if (/^(Ref|Refs|Fixes|Closes|CVE-ID)$/i.test(key)) return TRAILER_REF

  // Parsed only to exclude them from the changelog
  if (/^(Reviewed-By|Signed-Off-By|Acked-By)$/i.test(key)) return TRAILER_EXCLUDE
}

function isNumericReference (ref) {
  // E.g. #123, GH-123, JIRA-123, CVE-2024-123.
  return /^(#\d+|[a-z]{2,4}-\d+|CVE-\d+-\d+)$/i.test(ref)
}
