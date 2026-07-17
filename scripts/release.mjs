import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

/**
 * Date: 2026-07-16
 * Desc: Prepares, validates, tags, pushes, and optionally publishes package releases
 */

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseFileNames = ['package.json', 'package-lock.json', 'CHANGELOG.md'];
const minimumNodeVersion = '18.18.0';
const githubApiVersion = '2022-11-28';
const githubRequestTimeoutMs = 30_000;
const npmRegistryUrl = 'https://registry.npmjs.org/';
// Keeps Git's configured EOL normalization while hiding non-fatal conversion warnings
const gitCommandPrefix = ['-c', 'core.safecrlf=false'];
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === 'win32'
    ? 'npm.cmd'
    : 'npm';
let activeReleaseState = null;

class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
  }
}

class GitHubReleaseError extends Error {
  constructor(status, message, releaseUrl = null) {
    super(message);
    this.name = 'GitHubReleaseError';
    this.releaseUrl = releaseUrl;
    this.status = status;
  }
}

/**
 * Normalizes a stable semantic version with an optional v prefix
 * @param {string} value User-provided version
 * @returns {string} Stable version without the v prefix
 */
export function normalizeStableVersion(value) {
  const normalized = value.trim();
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(
    normalized
  );

  if (!match) {
    throw new ReleaseError(
      'Enter a stable semantic version such as 1.0.3 or v1.0.3'
    );
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}

/**
 * Compares two stable semantic versions
 * @param {string} leftVersion Left version
 * @param {string} rightVersion Right version
 * @returns {-1 | 0 | 1} Numeric comparison result
 */
export function compareStableVersions(leftVersion, rightVersion) {
  const left = normalizeStableVersion(leftVersion)
    .split('.')
    .map(part => BigInt(part));
  const right = normalizeStableVersion(rightVersion)
    .split('.')
    .map(part => BigInt(part));

  for (let index = 0; index < 3; index += 1) {
    const leftPart = left[index] ?? 0n;
    const rightPart = right[index] ?? 0n;

    if (leftPart < rightPart) {
      return -1;
    }

    if (leftPart > rightPart) {
      return 1;
    }
  }

  return 0;
}

/**
 * Requires a target version to be newer than the current version
 * @param {string} currentVersion Current stable version
 * @param {string} targetVersion Requested stable version
 * @returns {string} Normalized target version
 */
export function validateVersionIncrement(currentVersion, targetVersion) {
  const normalizedCurrent = normalizeStableVersion(currentVersion);
  const normalizedTarget = normalizeStableVersion(targetVersion);

  if (compareStableVersions(normalizedTarget, normalizedCurrent) <= 0) {
    throw new ReleaseError(
      `Target version ${normalizedTarget} must be greater than ${normalizedCurrent}`
    );
  }

  return normalizedTarget;
}

/**
 * Parses a yes or no response with a configured default
 * @param {string} answer User-provided answer
 * @param {boolean} defaultValue Value selected by an empty answer
 * @returns {boolean | null} Parsed value, or null when invalid
 */
export function parseConfirmation(answer, defaultValue) {
  const normalized = answer.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (normalized === 'y' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'n' || normalized === 'no') {
    return false;
  }

  return null;
}

/**
 * Promotes the Unreleased changelog content into a version section
 * @param {string} changelogText Current changelog text
 * @param {string} version Stable release version
 * @returns {{ changelog: string; text: string }} Updated text and release notes
 */
export function promoteChangelog(changelogText, version) {
  const normalizedVersion = normalizeStableVersion(version);
  const section = inspectUnreleasedChangelog(changelogText);
  const headings = findMarkdownH2Headings(changelogText);

  if (headings.some(heading => heading.title === normalizedVersion)) {
    throw new ReleaseError(
      `CHANGELOG.md already contains version ${normalizedVersion}`
    );
  }

  const prefix = changelogText.slice(0, section.contentStart);
  const suffix = changelogText.slice(section.contentEnd);
  const versionSection = [
    section.newline,
    `## ${normalizedVersion}`,
    section.newline,
    section.newline,
    section.changelog,
  ].join('');
  let text;

  if (suffix) {
    text = [
      prefix,
      versionSection,
      section.newline,
      section.newline,
      suffix,
    ].join('');
  } else {
    text = `${prefix}${versionSection}`;

    if (section.hasTrailingNewline) {
      text += section.newline;
    }
  }

  return {
    changelog: section.changelog,
    text,
  };
}

/**
 * Verifies the prepared changelog contains an empty Unreleased section followed by the release
 * @param {string} changelogText Prepared changelog text
 * @param {string} version Stable release version
 * @param {string} expectedChangelog Promoted Markdown content
 * @returns {string} Verified release Markdown
 */
export function validatePreparedChangelog(
  changelogText,
  version,
  expectedChangelog
) {
  const normalizedVersion = normalizeStableVersion(version);
  const headings = findMarkdownH2Headings(changelogText);
  const unreleasedMatches = headings.filter(
    heading => heading.title === 'Unreleased'
  );
  const versionMatches = headings.filter(
    heading => heading.title === normalizedVersion
  );

  if (unreleasedMatches.length !== 1) {
    throw new ReleaseError(
      'Prepared CHANGELOG.md must contain exactly one ## Unreleased section'
    );
  }

  if (versionMatches.length !== 1) {
    throw new ReleaseError(
      `Prepared CHANGELOG.md must contain exactly one ## ${normalizedVersion} section`
    );
  }

  const newline = changelogText.includes('\r\n') ? '\r\n' : '\n';
  const unreleasedHeading = unreleasedMatches[0];
  const versionHeading = versionMatches[0];
  const unreleasedHeadingIndex = headings.indexOf(unreleasedHeading);
  const nextHeading = headings[unreleasedHeadingIndex + 1];

  if (nextHeading !== versionHeading) {
    throw new ReleaseError(
      `Prepared CHANGELOG.md must place ## ${normalizedVersion} immediately after ## Unreleased`
    );
  }

  if (
    trimBlankLines(
      changelogText.slice(unreleasedHeading.contentStart, versionHeading.start),
      newline
    )
  ) {
    throw new ReleaseError(
      'Prepared CHANGELOG.md ## Unreleased section must be empty'
    );
  }

  const versionHeadingIndex = headings.indexOf(versionHeading);
  const followingHeading = headings[versionHeadingIndex + 1];
  const versionContentEnd = followingHeading?.start ?? changelogText.length;
  const actualChangelog = trimBlankLines(
    changelogText.slice(versionHeading.contentStart, versionContentEnd),
    newline
  );

  if (actualChangelog !== expectedChangelog) {
    throw new ReleaseError(
      `Prepared CHANGELOG.md ## ${normalizedVersion} content changed unexpectedly`
    );
  }

  return actualChangelog;
}

/**
 * Validates package and lockfile version consistency
 * @param {Record<string, unknown>} packageJson Parsed package.json
 * @param {Record<string, unknown>} packageLockJson Parsed package-lock.json
 * @returns {string} Shared stable version
 */
export function validateManifestVersions(packageJson, packageLockJson) {
  const packageVersion = packageJson.version;
  const lockVersion = packageLockJson.version;
  const packages = packageLockJson.packages;
  const rootPackage =
    packages && typeof packages === 'object' && '' in packages
      ? packages['']
      : undefined;
  const rootLockVersion =
    rootPackage && typeof rootPackage === 'object'
      ? rootPackage.version
      : undefined;

  if (
    typeof packageVersion !== 'string' ||
    typeof lockVersion !== 'string' ||
    typeof rootLockVersion !== 'string'
  ) {
    throw new ReleaseError(
      'package.json and package-lock.json must include all version fields'
    );
  }

  const normalizedVersion = normalizeStableVersion(packageVersion);

  if (
    packageVersion !== normalizedVersion ||
    lockVersion !== normalizedVersion ||
    rootLockVersion !== normalizedVersion
  ) {
    throw new ReleaseError(
      `Package versions do not match: package=${packageVersion}, lock=${lockVersion}, root=${rootLockVersion}`
    );
  }

  return normalizedVersion;
}

/**
 * Parses a GitHub HTTPS or SSH repository URL
 * @param {string} remoteUrl Git remote URL
 * @returns {{ owner: string; repo: string; slug: string; webUrl: string }} Repository details
 */
export function parseGitHubRepositoryUrl(remoteUrl) {
  const trimmedUrl = remoteUrl.trim();
  const scpMatch = /^git@github\.com:([^/]+)\/(.+)$/iu.exec(trimmedUrl);
  let owner;
  let repo;

  if (scpMatch) {
    owner = scpMatch[1];
    repo = scpMatch[2];
  } else {
    let url;

    try {
      url = new URL(trimmedUrl);
    } catch {
      throw new ReleaseError(`Unsupported GitHub origin URL: ${remoteUrl}`);
    }

    if (!['http:', 'https:', 'ssh:'].includes(url.protocol)) {
      throw new ReleaseError(
        `Unsupported GitHub origin protocol: ${url.protocol}`
      );
    }

    if (url.hostname.toLowerCase() !== 'github.com') {
      throw new ReleaseError(
        `Origin is not hosted on github.com: ${remoteUrl}`
      );
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length !== 2) {
      throw new ReleaseError(`Unsupported GitHub origin URL: ${remoteUrl}`);
    }

    [owner, repo] = segments;
  }

  const normalizedRepo = repo?.replace(/\.git$/iu, '');

  if (
    !owner ||
    !normalizedRepo ||
    !/^[A-Za-z0-9_.-]+$/u.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/u.test(normalizedRepo)
  ) {
    throw new ReleaseError(`Unsupported GitHub origin URL: ${remoteUrl}`);
  }

  const slug = `${owner}/${normalizedRepo}`;

  return {
    owner,
    repo: normalizedRepo,
    slug,
    webUrl: `https://github.com/${slug}`,
  };
}

/**
 * Builds and validates the GitHub compare URL for two stable release tags
 * @param {string} repositoryWebUrl Canonical or parseable GitHub repository URL
 * @param {string} previousTag Previous stable release tag
 * @param {string} currentTag Current stable release tag
 * @returns {string} GitHub three-dot compare URL
 */
export function buildGitHubCompareUrl(
  repositoryWebUrl,
  previousTag,
  currentTag
) {
  const previousVersion = normalizeStableTag(previousTag);
  const currentVersion = normalizeStableTag(currentTag);

  validateVersionIncrement(previousVersion, currentVersion);

  const repository = parseGitHubRepositoryUrl(repositoryWebUrl);
  return `${repository.webUrl}/compare/${previousTag}...${currentTag}`;
}

/**
 * Parses git diff numstat output into release statistics
 * @param {string} numstatOutput Raw git diff --numstat output
 * @returns {{ deletions: number; filesChanged: number; insertions: number }} Parsed statistics
 */
export function parseGitNumstat(numstatOutput) {
  let deletions = 0;
  let filesChanged = 0;
  let insertions = 0;

  for (const line of numstatOutput.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }

    const [rawInsertions, rawDeletions] = line.split('\t');

    filesChanged += 1;
    insertions += parseGitNumstatValue(rawInsertions);
    deletions += parseGitNumstatValue(rawDeletions);
  }

  return { deletions, filesChanged, insertions };
}

/**
 * Parses Git -z path output without trimming meaningful leading whitespace
 * @param {string} output NUL-separated Git path output
 * @returns {string[]} Paths in source order
 */
export function parseNullSeparatedGitPaths(output) {
  return output.split('\0').filter(path => path.length > 0);
}

/**
 * Builds the complete GitHub Release notes document
 * @param {{ changelog: string; commitSubjects: string[]; currentTag: string; deletions: number; displayName: string; filesChanged: number; insertions: number; previousTag: string; repositoryWebUrl: string; version: string }} options Release note values
 * @returns {string} Markdown release notes
 */
export function buildGitHubReleaseNotes(options) {
  const compareRange = `${options.previousTag}...${options.currentTag}`;
  const compareUrl = buildGitHubCompareUrl(
    options.repositoryWebUrl,
    options.previousTag,
    options.currentTag
  );
  const currentVersion = normalizeStableTag(options.currentTag);

  if (normalizeStableVersion(options.version) !== currentVersion) {
    throw new ReleaseError(
      `Release version ${options.version} does not match ${options.currentTag}`
    );
  }

  const releaseCommitSubject = `release: ${options.currentTag}`;
  const commitSubjects = options.commitSubjects.filter(
    subject => subject !== releaseCommitSubject
  );
  const overview = commitSubjects.map(subject => `- ${subject}`).join('\n');

  return [
    `# ${options.displayName} v${options.version}`,
    '',
    `> ${commitSubjects.length} commits · ${options.filesChanged} files changed · +${options.insertions} / -${options.deletions}`,
    '>',
    `> Full Changelog: [${compareRange}](${compareUrl})`,
    '',
    '## Overview',
    '',
    overview,
    '',
    '## Changelog',
    '',
    options.changelog,
    '',
  ].join('\n');
}

/**
 * Redacts credentials from user-facing error messages
 * @param {string} message Raw error message
 * @param {(string | undefined)[]} sensitiveValues Values that must not be shown
 * @returns {string} Sanitized message
 */
export function redactSensitiveValues(message, sensitiveValues) {
  return sensitiveValues
    .filter(value => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.length - left.length)
    .reduce(
      (sanitized, sensitiveValue) =>
        sanitized.split(sensitiveValue).join('[REDACTED]'),
      String(message)
    );
}

/**
 * Classifies a GitHub Releases API response status
 * @param {number} status HTTP response status
 * @returns {'created' | 'exists' | 'forbidden' | 'not-found' | 'unauthorized' | 'validation' | 'unknown'} Status category
 */
export function classifyGitHubReleaseResponse(status) {
  if (status === 200) {
    return 'exists';
  }

  if (status === 201) {
    return 'created';
  }

  if (status === 401) {
    return 'unauthorized';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'not-found';
  }

  if (status === 422) {
    return 'validation';
  }

  return 'unknown';
}

/**
 * Reads and validates the single Unreleased changelog section
 * @param {string} changelogText Changelog text
 * @returns {{ changelog: string; contentEnd: number; contentStart: number; hasTrailingNewline: boolean; newline: string }} Parsed section
 */
function inspectUnreleasedChangelog(changelogText) {
  const headings = findMarkdownH2Headings(changelogText);
  const matches = headings.filter(heading => heading.title === 'Unreleased');

  if (matches.length !== 1) {
    throw new ReleaseError(
      'CHANGELOG.md must contain exactly one ## Unreleased section'
    );
  }

  const newline = changelogText.includes('\r\n') ? '\r\n' : '\n';
  const heading = matches[0];
  const headingIndex = headings.indexOf(heading);
  const contentStart = heading.contentStart;
  const nextHeading = headings[headingIndex + 1];
  const contentEnd = nextHeading?.start ?? changelogText.length;
  const changelog = trimBlankLines(
    changelogText.slice(contentStart, contentEnd),
    newline
  );

  if (!changelog) {
    throw new ReleaseError('CHANGELOG.md ## Unreleased section is empty');
  }

  return {
    changelog,
    contentEnd,
    contentStart,
    hasTrailingNewline: changelogText.endsWith(newline),
    newline,
  };
}

/**
 * Finds second-level Markdown headings while ignoring fenced code blocks
 * @param {string} text Markdown document
 * @returns {{ contentStart: number; start: number; title: string }[]} Headings in source order
 */
function findMarkdownH2Headings(text) {
  const headings = [];
  let fence = null;
  let lineStart = 0;

  while (lineStart < text.length) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const rawLine = text.slice(lineStart, lineEnd).replace(/\r$/u, '');

    if (fence) {
      const closingFencePattern = new RegExp(
        `^ {0,3}${escapeRegExp(fence.character)}{${fence.length},}[ \\t]*$`,
        'u'
      );

      if (closingFencePattern.test(rawLine)) {
        fence = null;
      }
    } else {
      const openingFence = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(rawLine);

      if (
        openingFence &&
        (openingFence[1][0] !== '`' || !openingFence[2].includes('`'))
      ) {
        fence = {
          character: openingFence[1][0],
          length: openingFence[1].length,
        };
      } else {
        const heading = /^##[ \t]+(.+?)[ \t]*$/u.exec(rawLine);

        if (heading) {
          headings.push({
            contentStart: newlineIndex === -1 ? text.length : newlineIndex + 1,
            start: lineStart,
            title: heading[1],
          });
        }
      }
    }

    if (newlineIndex === -1) {
      break;
    }

    lineStart = newlineIndex + 1;
  }

  return headings;
}

/**
 * Normalizes a stable v-prefixed release tag
 * @param {string} tag Release tag
 * @returns {string} Stable version without the v prefix
 */
function normalizeStableTag(tag) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag)) {
    throw new ReleaseError(`Expected a stable release tag, received ${tag}`);
  }

  return normalizeStableVersion(tag);
}

/**
 * Removes only blank boundary lines while preserving Markdown indentation
 * @param {string} value Section content
 * @param {string} newline Detected file newline
 * @returns {string} Content without separator blank lines
 */
function trimBlankLines(value, newline) {
  const lines = value.split(/\r\n|\n|\r/u);

  while (lines.length > 0 && /^[ \t]*$/u.test(lines[0])) {
    lines.shift();
  }

  while (lines.length > 0 && /^[ \t]*$/u.test(lines.at(-1))) {
    lines.pop();
  }

  return lines.join(newline);
}

/**
 * Escapes text for insertion into a regular expression
 * @param {string} value Text to escape
 * @returns {string} Escaped text
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Parses a numeric numstat field while treating binary markers as zero
 * @param {string | undefined} value Raw numstat field
 * @returns {number} Numeric line count
 */
function parseGitNumstatValue(value) {
  if (!value || value === '-') {
    return 0;
  }

  const parsedValue = Number.parseInt(value, 10);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

/**
 * Executes a child process and optionally permits a non-zero exit status
 * @param {string} command Executable name
 * @param {string[]} args Command arguments
 * @param {{ allowFailure?: boolean; cwd?: string; env?: NodeJS.ProcessEnv; input?: string; stdio?: 'inherit' | 'pipe' | ['pipe', 'inherit', 'inherit'] }} [options] Execution options
 * @returns {{ status: number; stderr: string; stdout: string }} Process result
 */
function executeCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: 'utf8',
    env: createChildProcessEnvironment(options.env ?? process.env),
    input: options.input,
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    if (options.allowFailure) {
      return {
        status: result.status ?? 1,
        stderr: result.error.message,
        stdout: '',
      };
    }

    throw new ReleaseError(
      `Failed to run ${formatCommand(command, args)}: ${result.error.message}`
    );
  }

  const status = result.status ?? 1;
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';

  if (status !== 0 && !options.allowFailure) {
    const detail = stderr.trim() || stdout.trim();

    throw new ReleaseError(
      `${formatCommand(command, args)} failed with exit code ${status}${detail ? `\n${detail}` : ''}`
    );
  }

  return { status, stderr, stdout };
}

/**
 * Prevents GitHub credentials from reaching npm scripts, Git hooks, or CLI output
 * @param {NodeJS.ProcessEnv} sourceEnvironment Parent environment
 * @returns {NodeJS.ProcessEnv} Child environment without GitHub tokens
 */
export function createChildProcessEnvironment(sourceEnvironment) {
  const childEnvironment = { ...sourceEnvironment };

  for (const name of Object.keys(childEnvironment)) {
    if (['GH_TOKEN', 'GITHUB_TOKEN'].includes(name.toUpperCase())) {
      delete childEnvironment[name];
    }
  }

  return childEnvironment;
}

/**
 * Formats a command for user-facing output
 * @param {string} command Executable name
 * @param {string[]} args Command arguments
 * @returns {string} Readable command
 */
function formatCommand(command, args) {
  return [command, ...args]
    .map(part => (/\s/u.test(part) ? JSON.stringify(part) : part))
    .join(' ');
}

/**
 * Executes Git with release-safe EOL warning behavior
 * @param {string[]} args Git arguments
 * @param {{ allowFailure?: boolean; input?: string; stdio?: 'inherit' | 'pipe' | ['pipe', 'inherit', 'inherit'] }} [options] Execution options
 * @returns {{ status: number; stderr: string; stdout: string }} Process result
 */
function executeGit(args, options = {}) {
  return executeCommand('git', [...gitCommandPrefix, ...args], options);
}

/**
 * Executes Git with inherited output
 * @param {string[]} args Git arguments
 */
function runGit(args) {
  executeGit(args, { stdio: 'inherit' });
}

/**
 * Returns captured Git output
 * @param {string[]} args Git arguments
 * @returns {string} Trimmed stdout
 */
function queryGit(args) {
  return executeGit(args).stdout.trim();
}

/**
 * Returns captured Git output without changing status-leading whitespace or NUL separators
 * @param {string[]} args Git arguments
 * @returns {string} Raw stdout
 */
function queryGitRaw(args) {
  return executeGit(args).stdout;
}

/**
 * Checks whether a Git command succeeds
 * @param {string[]} args Git arguments
 * @returns {boolean} True on exit code zero
 */
function gitSucceeds(args) {
  return executeGit(args, { allowFailure: true }).status === 0;
}

/**
 * Executes npm with inherited output
 * @param {string[]} args npm arguments
 */
function runNpm(args) {
  executeCommand(npmCommand, npmExecPath ? [npmExecPath, ...args] : args, {
    stdio: 'inherit',
  });
}

/**
 * Executes npm and captures output while permitting failure
 * @param {string[]} args npm arguments
 * @returns {{ status: number; stderr: string; stdout: string }} npm result
 */
function queryNpmAllowFailure(args) {
  return executeCommand(
    npmCommand,
    npmExecPath ? [npmExecPath, ...args] : args,
    { allowFailure: true }
  );
}

/**
 * Checks whether a command exists
 * @param {string} command Executable name
 * @returns {boolean} True when executable invocation succeeds
 */
function commandExists(command) {
  return (
    executeCommand(command, ['--version'], {
      allowFailure: true,
    }).status === 0
  );
}

/**
 * Reads JSON from a workspace file
 * @param {string} fileName Workspace-relative file name
 * @returns {Record<string, unknown>} Parsed JSON
 */
function readWorkspaceJson(fileName) {
  return JSON.parse(readFileSync(resolve(workspaceRoot, fileName), 'utf8'));
}

/**
 * Compares resolved paths using platform path-case rules
 * @param {string} leftPath Left path
 * @param {string} rightPath Right path
 * @returns {boolean} True when both paths identify the same location
 */
function pathsEqual(leftPath, rightPath) {
  const left = resolve(leftPath);
  const right = resolve(rightPath);

  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/**
 * Verifies the current process and repository before version input
 * @returns {{ changelogText: string; currentVersion: string; originalFiles: Map<string, Buffer>; packageJson: Record<string, unknown>; packageLockJson: Record<string, unknown> }} Current release inputs
 */
function runInitialPreflight() {
  assertMinimumNodeVersion();

  if (!commandExists('git')) {
    throw new ReleaseError('Git is required to prepare a release');
  }

  const npmVersionResult = queryNpmAllowFailure(['--version']);

  if (npmVersionResult.status !== 0) {
    throw new ReleaseError(
      `npm is required to prepare a release: ${npmVersionResult.stderr.trim() || 'command unavailable'}`
    );
  }

  if (!pathsEqual(process.cwd(), workspaceRoot)) {
    throw new ReleaseError(`Run the release script from ${workspaceRoot}`);
  }

  const repositoryRoot = resolve(queryGit(['rev-parse', '--show-toplevel']));

  if (!pathsEqual(repositoryRoot, workspaceRoot)) {
    throw new ReleaseError(
      `Run the release script from ${workspaceRoot}, not ${repositoryRoot}`
    );
  }

  if (queryGit(['branch', '--show-current']) !== 'main') {
    throw new ReleaseError('Releases must be prepared from the main branch');
  }

  if (
    queryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) !==
    'origin/main'
  ) {
    throw new ReleaseError('The main branch upstream must be origin/main');
  }

  assertNoGitOperationInProgress();
  assertCleanWorkingTree();

  if (!queryGit(['config', 'user.name'])) {
    throw new ReleaseError('Git user.name is not configured');
  }

  if (!queryGit(['config', 'user.email'])) {
    throw new ReleaseError('Git user.email is not configured');
  }

  const originalFiles = captureReleaseFiles();
  const packageJson = JSON.parse(
    originalFiles.get('package.json').toString('utf8')
  );
  const packageLockJson = JSON.parse(
    originalFiles.get('package-lock.json').toString('utf8')
  );
  const currentVersion = validateManifestVersions(packageJson, packageLockJson);
  const changelogText = originalFiles.get('CHANGELOG.md').toString('utf8');

  inspectUnreleasedChangelog(changelogText);

  return {
    changelogText,
    currentVersion,
    originalFiles,
    packageJson,
    packageLockJson,
  };
}

/**
 * Verifies Node satisfies the package engine floor
 */
function assertMinimumNodeVersion() {
  if (compareStableVersions(process.versions.node, minimumNodeVersion) < 0) {
    throw new ReleaseError(
      `Node.js ${minimumNodeVersion} or newer is required`
    );
  }
}

/**
 * Rejects merge, rebase, cherry-pick, revert, and bisect states
 */
function assertNoGitOperationInProgress() {
  const gitStatePaths = [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'BISECT_LOG',
    'rebase-apply',
    'rebase-merge',
    'sequencer',
  ];

  for (const gitStatePath of gitStatePaths) {
    const resolvedPath = queryGit(['rev-parse', '--git-path', gitStatePath]);
    const absolutePath = resolve(workspaceRoot, resolvedPath);

    if (existsSync(absolutePath)) {
      throw new ReleaseError(
        `Git operation is still in progress: ${gitStatePath}`
      );
    }
  }
}

/**
 * Requires a completely clean worktree including untracked files
 */
function assertCleanWorkingTree() {
  const status = queryGitRaw([
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]).trimEnd();

  if (status) {
    throw new ReleaseError(
      `The working tree must be clean before a release:\n${status}`
    );
  }
}

/**
 * Requires the reviewed branch tip and repository state to remain unchanged
 * @param {string} releaseBaseSha Reviewed HEAD commit
 * @param {{ requireClean: boolean }} options Verification options
 */
function assertReleaseBaseUnchanged(releaseBaseSha, options) {
  if (queryGit(['branch', '--show-current']) !== 'main') {
    throw new ReleaseError(
      'The current branch changed during release preparation'
    );
  }

  if (
    queryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) !==
    'origin/main'
  ) {
    throw new ReleaseError(
      'The main branch upstream changed during release preparation'
    );
  }

  assertNoGitOperationInProgress();

  if (queryGit(['rev-parse', 'HEAD']) !== releaseBaseSha) {
    throw new ReleaseError(
      'HEAD changed after release preflight; review the new commits and restart'
    );
  }

  if (options.requireClean) {
    assertCleanWorkingTree();
  }
}

/**
 * Requires the previous tag baseline and target-tag absence to remain unchanged
 * @param {string} previousTag Previous release tag
 * @param {string} previousTagCommit Expected previous release commit
 * @param {string} currentTag Target release tag
 */
function assertReleaseTagBaseline(previousTag, previousTagCommit, currentTag) {
  if (
    queryGit(['rev-parse', `${previousTag}^{commit}`]) !== previousTagCommit
  ) {
    throw new ReleaseError(`${previousTag} moved during release preparation`);
  }

  if (gitSucceeds(['rev-parse', '--verify', `refs/tags/${currentTag}`])) {
    throw new ReleaseError(
      `Local tag ${currentTag} appeared during preparation`
    );
  }
}

/**
 * Verifies Git, npm, tags, and remote state for the target version
 * @param {string} currentVersion Current package version
 * @param {string} targetVersion Target package version
 * @param {Record<string, unknown>} packageJson Parsed package metadata
 * @returns {{ currentTag: string; displayName: string; originMainSha: string; previousTag: string; previousTagCommit: string; releaseBaseSha: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} Release context
 */
function runTargetPreflight(currentVersion, targetVersion, packageJson) {
  validateVersionIncrement(currentVersion, targetVersion);

  const previousTag = `v${currentVersion}`;
  const currentTag = `v${targetVersion}`;

  console.log('\nFetching origin and tags...');
  runGit(['fetch', 'origin', '--tags']);
  const releaseBaseSha = queryGit(['rev-parse', 'HEAD']);

  if (!gitSucceeds(['rev-parse', '--verify', `refs/tags/${previousTag}`])) {
    throw new ReleaseError(
      `Previous release tag ${previousTag} does not exist`
    );
  }

  if (
    !gitSucceeds(['merge-base', '--is-ancestor', previousTag, releaseBaseSha])
  ) {
    throw new ReleaseError(`${previousTag} is not an ancestor of HEAD`);
  }

  const localPreviousCommit = queryGit([
    'rev-parse',
    `${previousTag}^{commit}`,
  ]);
  const remotePreviousCommit = queryRemoteTagCommit(previousTag);

  if (!remotePreviousCommit) {
    throw new ReleaseError(`Remote previous tag ${previousTag} does not exist`);
  }

  if (remotePreviousCommit !== localPreviousCommit) {
    throw new ReleaseError(
      `Local and remote ${previousTag} tags do not resolve to the same commit`
    );
  }

  if (
    !gitSucceeds(['merge-base', '--is-ancestor', 'origin/main', releaseBaseSha])
  ) {
    throw new ReleaseError('Local main is behind or diverged from origin/main');
  }

  if (gitSucceeds(['rev-parse', '--verify', `refs/tags/${currentTag}`])) {
    throw new ReleaseError(`Local tag ${currentTag} already exists`);
  }

  if (queryRemoteTag(currentTag)) {
    throw new ReleaseError(`Remote tag ${currentTag} already exists`);
  }

  assertNpmVersionIsUnpublished(packageJson.name, targetVersion);

  if (typeof packageJson.name !== 'string') {
    throw new ReleaseError('package.json name is missing');
  }

  const repository = readOriginRepository();

  const displayName = packageJson.name.split('/').at(-1);

  if (!displayName) {
    throw new ReleaseError('Unable to derive release display name');
  }

  if (queryGit(['rev-parse', 'HEAD']) !== releaseBaseSha) {
    throw new ReleaseError('HEAD changed during release preflight; restart');
  }

  return {
    currentTag,
    displayName,
    originMainSha: queryGit(['rev-parse', 'origin/main']),
    previousTag,
    previousTagCommit: localPreviousCommit,
    releaseBaseSha,
    repository,
  };
}

/**
 * Validates origin fetch and push URLs resolve to one GitHub repository
 * @param {string} [expectedSlug] Previously reviewed owner/repository slug
 * @returns {ReturnType<typeof parseGitHubRepositoryUrl>} Canonical repository details
 */
function readOriginRepository(expectedSlug) {
  const originUrl = queryGit(['remote', 'get-url', 'origin']);
  const repository = parseGitHubRepositoryUrl(originUrl);
  const pushUrls = queryGit(['remote', 'get-url', '--push', '--all', 'origin'])
    .split(/\r?\n/u)
    .filter(Boolean);

  if (pushUrls.length !== 1) {
    throw new ReleaseError(
      'origin must have exactly one push URL for an atomic release'
    );
  }

  const pushRepository = parseGitHubRepositoryUrl(pushUrls[0]);

  if (pushRepository.slug.toLowerCase() !== repository.slug.toLowerCase()) {
    throw new ReleaseError(
      `origin fetch and push URLs target different repositories: ${repository.slug} vs ${pushRepository.slug}`
    );
  }

  if (
    expectedSlug &&
    repository.slug.toLowerCase() !== expectedSlug.toLowerCase()
  ) {
    throw new ReleaseError(
      `origin changed from ${expectedSlug} to ${repository.slug} during release preparation`
    );
  }

  return repository;
}

/**
 * Queries a remote tag and its peeled annotated target
 * @param {string} tag Tag name
 * @returns {string} Raw ls-remote output
 */
function queryRemoteTag(tag) {
  return queryGit([
    'ls-remote',
    '--tags',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
}

/**
 * Resolves a remote lightweight or annotated tag to its commit
 * @param {string} tag Tag name
 * @returns {string | null} Resolved commit SHA
 */
function queryRemoteTagCommit(tag) {
  const output = queryRemoteTag(tag);

  if (!output) {
    return null;
  }

  const refs = new Map(
    output.split(/\r?\n/u).map(line => {
      const [sha, ref] = line.split(/\s+/u);
      return [ref, sha];
    })
  );

  return (
    refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null
  );
}

/**
 * Requires the target npm package version to be explicitly unpublished
 * @param {unknown} packageName Package name
 * @param {string} version Target version
 */
function assertNpmVersionIsUnpublished(packageName, version) {
  if (typeof packageName !== 'string') {
    throw new ReleaseError('package.json name is missing');
  }

  const packageSpec = `${packageName}@${version}`;
  const result = queryNpmAllowFailure([
    'view',
    packageSpec,
    'version',
    '--json',
    ...buildNpmRegistryArgs(packageName),
  ]);

  if (result.status === 0) {
    throw new ReleaseError(`${packageSpec} is already published on npm`);
  }

  const output = `${result.stdout}\n${result.stderr}`;

  if (!isExplicitNpmNotFound(output)) {
    throw new ReleaseError(
      `Unable to verify ${packageSpec} is unpublished:\n${output.trim()}`
    );
  }
}

/**
 * Recognizes only npm's explicit E404 error code as an unpublished version
 * @param {string} output Combined npm stdout and stderr
 * @returns {boolean} True only for an explicit npm E404
 */
export function isExplicitNpmNotFound(output) {
  return /\bE404\b/u.test(output);
}

/**
 * Pins both the default and any package-scope registry to the public npm registry
 * @param {string} packageName npm package name
 * @returns {string[]} npm registry CLI arguments
 */
export function buildNpmRegistryArgs(packageName) {
  const args = ['--registry', npmRegistryUrl];
  const scopeMatch = /^@([^/]+)\//u.exec(packageName);

  if (scopeMatch) {
    args.push(`--@${scopeMatch[1]}:registry=${npmRegistryUrl}`);
  }

  return args;
}

/**
 * Prompts until a valid stable version greater than the current version is entered
 * @param {import('node:readline/promises').Interface} readline Readline interface
 * @param {string} currentVersion Current package version
 * @returns {Promise<string>} Target version
 */
async function askTargetVersion(readline, currentVersion) {
  while (true) {
    const answer = await readline.question('Version to release: ');

    try {
      return validateVersionIncrement(currentVersion, answer);
    } catch (error) {
      console.error(getErrorMessage(error));
    }
  }
}

/**
 * Prompts for a yes or no confirmation
 * @param {import('node:readline/promises').Interface} readline Readline interface
 * @param {string} prompt Prompt text
 * @param {boolean} defaultValue Empty-answer value
 * @returns {Promise<boolean>} Confirmation result
 */
async function askConfirmation(readline, prompt, defaultValue) {
  while (true) {
    const answer = await readline.question(prompt);
    const parsedAnswer = parseConfirmation(answer, defaultValue);

    if (parsedAnswer !== null) {
      return parsedAnswer;
    }

    console.error('Enter y or n');
  }
}

/**
 * Shows the target release preview before modifying files
 * @param {{ changelog: string; currentTag: string; currentVersion: string; previousTag: string; repositoryWebUrl: string; targetVersion: string }} options Preview values
 */
function printReleasePreview(options) {
  console.log('\nRelease preview');
  console.log(`  Current version: ${options.currentVersion}`);
  console.log(`  Target version:  ${options.targetVersion}`);
  console.log(`  Previous tag:    ${options.previousTag}`);
  console.log(`  Target tag:      ${options.currentTag}`);
  console.log('\nUnreleased changelog');
  console.log('--------------------');
  console.log(options.changelog);
  console.log('--------------------\n');
  console.log('Preflight checks passed');

  for (const check of [
    'Node.js, npm, and Git are available',
    'Current directory is the repository root',
    'Branch is main with upstream origin/main',
    'Working tree is clean and no Git operation is in progress',
    'Git user.name and user.email are configured',
    `Package and lockfile versions match ${options.currentVersion}`,
    'CHANGELOG.md has one non-empty Unreleased section and no target section',
    `${options.previousTag} matches origin and is an ancestor of HEAD`,
    'Local main is equal to or ahead of origin/main',
    `${options.currentTag} is absent locally and remotely`,
    `${options.targetVersion} is explicitly unpublished on npm (E404)`,
    `GitHub Compare URL: ${options.repositoryWebUrl}/compare/${options.previousTag}...${options.currentTag}`,
  ]) {
    console.log(`  [x] ${check}`);
  }

  console.log('');
}

/**
 * Captures release files byte-for-byte for failure recovery
 * @returns {Map<string, Buffer>} Original file buffers
 */
function captureReleaseFiles() {
  return new Map(
    releaseFileNames.map(fileName => [
      fileName,
      readFileSync(resolve(workspaceRoot, fileName)),
    ])
  );
}

/**
 * Restores script-owned release files before a release commit exists
 * @param {{ commitCreated: boolean; originalFiles: Map<string, Buffer> | null; restored: boolean }} state Release state
 */
function restoreReleaseFiles(state) {
  if (state.commitCreated || state.restored || !state.originalFiles) {
    return;
  }

  const unstageResult = executeGit(
    ['restore', '--staged', '--', ...releaseFileNames],
    {
      allowFailure: true,
    }
  );

  for (const [fileName, content] of state.originalFiles) {
    writeFileSync(resolve(workspaceRoot, fileName), content);
  }

  state.restored = true;

  if (unstageResult.status !== 0) {
    console.error(
      'Restored original release-file bytes, but Git could not clear their staged state'
    );
    console.error(`Run: git restore --staged -- ${releaseFileNames.join(' ')}`);
    return;
  }

  const stagedResult = executeGit(
    ['diff', '--cached', '--name-only', '--', ...releaseFileNames],
    { allowFailure: true }
  );

  if (stagedResult.status !== 0 || stagedResult.stdout.trim()) {
    console.error(
      'Restored original release-file bytes, but staged release changes may remain'
    );
    console.error(`Run: git restore --staged -- ${releaseFileNames.join(' ')}`);
    return;
  }

  console.error(
    'Restored package.json, package-lock.json, and CHANGELOG.md and cleared their staged state'
  );
}

/**
 * Updates manifests and changelog for the target version
 * @param {string} targetVersion Target version
 * @param {string} changelogText Original changelog
 * @returns {string} Release changelog Markdown
 */
function updateReleaseFiles(targetVersion, changelogText) {
  runNpm([
    'version',
    targetVersion,
    '--no-git-tag-version',
    '--ignore-scripts',
  ]);

  const promotedChangelog = promoteChangelog(changelogText, targetVersion);

  writeFileSync(
    resolve(workspaceRoot, 'CHANGELOG.md'),
    promotedChangelog.text,
    'utf8'
  );

  const packageJson = readWorkspaceJson('package.json');
  const packageLockJson = readWorkspaceJson('package-lock.json');
  const actualVersion = validateManifestVersions(packageJson, packageLockJson);
  const preparedChangelogText = readFileSync(
    resolve(workspaceRoot, 'CHANGELOG.md'),
    'utf8'
  );

  if (actualVersion !== targetVersion) {
    throw new ReleaseError(
      `npm version produced ${actualVersion}, expected ${targetVersion}`
    );
  }

  validatePreparedChangelog(
    preparedChangelogText,
    targetVersion,
    promotedChangelog.changelog
  );

  return promotedChangelog.changelog;
}

/**
 * Requires release files to match the prepared byte snapshots
 * @param {Map<string, Buffer>} expectedFiles Prepared release files
 */
function assertReleaseFilesMatch(expectedFiles) {
  for (const [fileName, expectedContent] of expectedFiles) {
    const actualContent = readFileSync(resolve(workspaceRoot, fileName));

    if (!actualContent.equals(expectedContent)) {
      throw new ReleaseError(
        `${fileName} changed unexpectedly during release checks`
      );
    }
  }
}

/**
 * Runs the complete release verification suite
 * @param {Map<string, Buffer>} expectedFiles Prepared release files
 */
function runReleaseChecks(expectedFiles) {
  const checks = [
    ['Install root dependencies', () => runNpm(['ci'])],
    [
      'Install browser playground dependencies',
      () => runNpm(['ci', '--prefix', 'playground']),
    ],
    [
      'Install Node playground dependencies',
      () => runNpm(['ci', '--prefix', 'playground-node']),
    ],
    ['Lint', () => runNpm(['run', 'lint'])],
    ['Typecheck', () => runNpm(['run', 'typecheck'])],
    ['Test core', () => runNpm(['run', 'test'])],
    ['Test release script', () => runNpm(['run', 'test:release-script'])],
    ['Build package', () => runNpm(['run', 'build'])],
    ['Verify exports', () => runNpm(['run', 'smoke:exports'])],
    ['Verify installed package', () => runNpm(['run', 'smoke:install'])],
    ['Dry-run npm pack', () => runNpm(['run', 'pack:dry'])],
    ['Verify pack boundary', () => runNpm(['run', 'pack:verify'])],
    [
      'Typecheck browser playground',
      () => runNpm(['--prefix', 'playground', 'run', 'typecheck']),
    ],
    ['Build browser playground', () => runNpm(['run', 'build:playground'])],
    [
      'Typecheck Node playground',
      () => runNpm(['run', 'typecheck:playground-node']),
    ],
  ];

  checks.forEach(([label, check], index) => {
    console.log(`\n[${index + 1}/${checks.length}] ${label}`);
    check();
  });

  runGit(['diff', '--check']);
  assertOnlyExpectedReleaseFilesChanged();
  assertReleaseFilesMatch(expectedFiles);
}

/**
 * Requires release preparation to modify exactly the three owned files
 */
function assertOnlyExpectedReleaseFilesChanged() {
  const changedFiles = new Set([
    ...parseNullSeparatedGitPaths(queryGitRaw(['diff', '--name-only', '-z'])),
    ...parseNullSeparatedGitPaths(
      queryGitRaw(['diff', '--cached', '--name-only', '-z'])
    ),
    ...parseNullSeparatedGitPaths(
      queryGitRaw(['ls-files', '--others', '--exclude-standard', '-z'])
    ),
  ]);
  const expectedFiles = new Set(releaseFileNames);

  if (
    changedFiles.size !== releaseFileNames.length ||
    [...changedFiles].some(fileName => !expectedFiles.has(fileName))
  ) {
    const status = queryGitRaw([
      'status',
      '--short',
      '--untracked-files=all',
    ]).trimEnd();

    throw new ReleaseError(
      `Unexpected working tree changes after release checks:\n${status || '(no status output)'}`
    );
  }
}

/**
 * Creates and verifies the release commit and annotated tag
 * @param {{ currentTag: string; expectedFiles: Map<string, Buffer>; previousTag: string; previousTagCommit: string; releaseBaseSha: string }} options Commit inputs
 * @param {{ commitCreated: boolean; tagCreated: boolean }} state Release state
 * @returns {string} Release commit SHA
 */
function createReleaseCommitAndTag(options, state) {
  const currentTag = options.currentTag;

  assertReleaseBaseUnchanged(options.releaseBaseSha, { requireClean: false });
  assertReleaseTagBaseline(
    options.previousTag,
    options.previousTagCommit,
    currentTag
  );
  assertOnlyExpectedReleaseFilesChanged();
  assertReleaseFilesMatch(options.expectedFiles);
  runGit(['add', '--', ...releaseFileNames]);
  runGit(['diff', '--cached', '--check']);

  const stagedFiles = queryGit(['diff', '--cached', '--name-only'])
    .split(/\r?\n/u)
    .filter(Boolean);

  if (
    stagedFiles.length !== releaseFileNames.length ||
    stagedFiles.some(fileName => !releaseFileNames.includes(fileName))
  ) {
    throw new ReleaseError(
      `Unexpected staged files:\n${stagedFiles.join('\n')}`
    );
  }

  const preparedBlobIds = new Map(
    releaseFileNames.map(fileName => [
      fileName,
      queryGit(['rev-parse', `:${fileName}`]),
    ])
  );

  const commitMessage = `release: ${currentTag}`;

  runGit(['commit', '-m', commitMessage]);
  state.commitCreated = true;

  const headSha = queryGit(['rev-parse', 'HEAD']);
  state.releaseCommitSha = headSha;

  try {
    if (queryGit(['log', '-1', '--format=%s']) !== commitMessage) {
      throw new ReleaseError('Release commit message verification failed');
    }

    const committedFiles = queryGit([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      'HEAD',
    ])
      .split(/\r?\n/u)
      .filter(Boolean);

    if (
      committedFiles.length !== releaseFileNames.length ||
      committedFiles.some(fileName => !releaseFileNames.includes(fileName))
    ) {
      throw new ReleaseError(
        `Release commit contains unexpected files:\n${committedFiles.join('\n')}`
      );
    }

    for (const [fileName, expectedBlobId] of preparedBlobIds) {
      const committedBlobId = queryGit(['rev-parse', `HEAD:${fileName}`]);

      if (committedBlobId !== expectedBlobId) {
        throw new ReleaseError(
          `Release commit changed prepared content for ${fileName}`
        );
      }
    }

    assertCleanWorkingTree();
  } catch (error) {
    console.error(
      '\nThe release commit was kept, but it did not pass post-commit verification; no tag was created'
    );
    throw error;
  }

  try {
    runGit(['tag', '-a', currentTag, '-m', `Release ${currentTag}`]);
    state.tagCreated = true;
    state.releaseTagObjectSha = queryGit([
      'rev-parse',
      `refs/tags/${currentTag}`,
    ]);
  } catch (error) {
    console.error('\nThe release commit was kept, but tag creation failed');
    console.error(
      `Create the tag with: ${buildTagCommand(currentTag, headSha)}`
    );
    throw error;
  }

  const tagCommitSha = queryGit(['rev-parse', `${currentTag}^{commit}`]);

  if (queryGit(['cat-file', '-t', `refs/tags/${currentTag}`]) !== 'tag') {
    throw new ReleaseError(`${currentTag} is not an annotated tag`);
  }

  if (headSha !== tagCommitSha) {
    throw new ReleaseError(
      `${currentTag} does not point to the release commit`
    );
  }

  assertCleanWorkingTree();
  return headSha;
}

/**
 * Collects commit subjects and diff statistics for release notes
 * @param {string} previousTag Previous release tag
 * @param {string} currentTag Current release tag
 * @returns {{ commitSubjects: string[]; deletions: number; filesChanged: number; insertions: number }} Release statistics
 */
function collectReleaseStatistics(previousTag, currentTag) {
  const revisionRange = `${previousTag}..${currentTag}`;
  const commitSubjects = queryGit([
    'log',
    '--reverse',
    '--format=%s',
    revisionRange,
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  const numstat = queryGit(['diff', '--numstat', revisionRange]);

  return {
    commitSubjects,
    ...parseGitNumstat(numstat),
  };
}

/**
 * Atomically pushes main and the release tag after rechecking remote state
 * @param {{ currentTag: string; originMainSha: string; previousTag: string; previousTagCommit: string; releaseCommitSha: string; repositorySlug: string }} options Push values
 */
function pushRelease(options) {
  readOriginRepository(options.repositorySlug);
  assertLocalReleaseRefs(options.currentTag, options.releaseCommitSha);
  console.log('\nRefreshing origin before push...');
  runGit(['fetch', 'origin', '--tags']);
  assertLocalReleaseRefs(options.currentTag, options.releaseCommitSha);

  if (
    queryGit(['rev-parse', `${options.previousTag}^{commit}`]) !==
      options.previousTagCommit ||
    queryRemoteTagCommit(options.previousTag) !== options.previousTagCommit
  ) {
    throw new ReleaseError(
      `${options.previousTag} changed locally or remotely during release checks`
    );
  }

  if (queryGit(['rev-parse', 'origin/main']) !== options.originMainSha) {
    throw new ReleaseError(
      'origin/main changed during release checks; review and retry the push manually'
    );
  }

  if (queryRemoteTag(options.currentTag)) {
    throw new ReleaseError(
      `Remote tag ${options.currentTag} appeared during release checks`
    );
  }

  runGit([
    'push',
    '--atomic',
    'origin',
    'refs/heads/main:refs/heads/main',
    `refs/tags/${options.currentTag}:refs/tags/${options.currentTag}`,
  ]);

  verifyRemoteReleaseRefs(options.currentTag, options.releaseCommitSha);
}

/**
 * Requires local HEAD, main, and the annotated tag to remain on the release commit
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Expected release commit
 */
function assertLocalReleaseRefs(currentTag, releaseCommitSha) {
  if (queryGit(['rev-parse', 'HEAD']) !== releaseCommitSha) {
    throw new ReleaseError('HEAD moved after the release commit was created');
  }

  if (queryGit(['rev-parse', 'refs/heads/main']) !== releaseCommitSha) {
    throw new ReleaseError(
      'Local main moved after the release commit was created'
    );
  }

  if (queryGit(['cat-file', '-t', `refs/tags/${currentTag}`]) !== 'tag') {
    throw new ReleaseError(`${currentTag} is no longer an annotated tag`);
  }

  if (queryGit(['rev-parse', `${currentTag}^{commit}`]) !== releaseCommitSha) {
    throw new ReleaseError(
      `${currentTag} moved after the release commit was created`
    );
  }
}

/**
 * Formats the annotated tag repair command
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Release commit SHA
 * @returns {string} Shell command
 */
function buildTagCommand(currentTag, releaseCommitSha) {
  return `git tag -a ${currentTag} -m "Release ${currentTag}" ${releaseCommitSha}`;
}

/**
 * Formats the atomic push retry command
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Release commit SHA
 * @param {string} releaseTagObjectSha Annotated tag object SHA
 * @returns {string} Shell command
 */
function buildAtomicPushCommand(
  currentTag,
  releaseCommitSha,
  releaseTagObjectSha
) {
  return `git push --atomic origin ${releaseCommitSha}:refs/heads/main ${releaseTagObjectSha}:refs/tags/${currentTag}`;
}

/**
 * Verifies remote main and the peeled annotated tag target
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Expected release commit
 */
function verifyRemoteReleaseRefs(currentTag, releaseCommitSha) {
  const output = queryGit([
    'ls-remote',
    'origin',
    'refs/heads/main',
    `refs/tags/${currentTag}`,
    `refs/tags/${currentTag}^{}`,
  ]);
  const refs = new Map(
    output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map(line => {
        const [sha, ref] = line.split(/\s+/u);
        return [ref, sha];
      })
  );

  if (refs.get('refs/heads/main') !== releaseCommitSha) {
    throw new ReleaseError('Remote main does not point to the release commit');
  }

  assertRemoteReleaseTagRefs(refs, currentTag, releaseCommitSha);
}

/**
 * Verifies a remote annotated tag still peels to the release commit
 * @param {Map<string, string>} refs Remote ref map
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Expected release commit
 */
function assertRemoteReleaseTagRefs(refs, currentTag, releaseCommitSha) {
  if (
    !refs.has(`refs/tags/${currentTag}`) ||
    refs.get(`refs/tags/${currentTag}^{}`) !== releaseCommitSha
  ) {
    throw new ReleaseError(
      `Remote annotated tag ${currentTag} does not peel to the release commit`
    );
  }
}

/**
 * Rechecks the remote annotated tag before publishing a GitHub Release
 * @param {string} currentTag Release tag
 * @param {string} releaseCommitSha Expected release commit
 */
function verifyRemoteReleaseTag(currentTag, releaseCommitSha) {
  const output = queryGit([
    'ls-remote',
    'origin',
    `refs/tags/${currentTag}`,
    `refs/tags/${currentTag}^{}`,
  ]);
  const refs = new Map(
    output
      .split(/\r?\n/u)
      .filter(Boolean)
      .map(line => {
        const [sha, ref] = line.split(/\s+/u);
        return [ref, sha];
      })
  );

  assertRemoteReleaseTagRefs(refs, currentTag, releaseCommitSha);
}

/**
 * Publishes a GitHub Release through gh or the REST API
 * @param {{ currentTag: string; notes: string; releaseCommitSha: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} options Release values
 * @returns {Promise<string | null>} Published release URL, or null for manual fallback
 */
async function publishGitHubRelease(options) {
  readOriginRepository(options.repository.slug);
  verifyRemoteReleaseTag(options.currentTag, options.releaseCommitSha);
  let ghResult;

  try {
    ghResult = tryPublishGitHubReleaseWithGh(options);
  } catch (error) {
    console.error(`GitHub Release check failed: ${getErrorMessage(error)}`);
    printManualGitHubRelease({
      ...options,
      existingReleaseUrl:
        error instanceof GitHubReleaseError ? error.releaseUrl : null,
    });
    return null;
  }

  if (ghResult) {
    return ghResult;
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (token) {
    try {
      return await publishGitHubReleaseWithApi(options, token);
    } catch (error) {
      console.error(`GitHub API release failed: ${getErrorMessage(error)}`);
      printManualGitHubRelease({
        ...options,
        existingReleaseUrl:
          error instanceof GitHubReleaseError ? error.releaseUrl : null,
      });
      return null;
    }
  }

  printManualGitHubRelease(options);
  return null;
}

/**
 * Attempts GitHub Release publication through an authenticated gh CLI
 * @param {{ currentTag: string; notes: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} options Release values
 * @returns {string | null} Release URL, or null when gh is unavailable
 */
function tryPublishGitHubReleaseWithGh(options) {
  if (!commandExists('gh')) {
    return null;
  }

  const authStatus = executeCommand(
    'gh',
    ['auth', 'status', '--hostname', 'github.com'],
    { allowFailure: true }
  );

  if (authStatus.status !== 0) {
    console.error('gh is installed but is not authenticated for github.com');
    return null;
  }

  const existingRelease = queryGhRelease(
    options.currentTag,
    options.repository.slug
  );

  if (existingRelease) {
    const releaseUrl = requirePublishedGitHubRelease(
      existingRelease,
      options.currentTag
    );
    console.log(`GitHub Release already exists: ${releaseUrl}`);
    return releaseUrl;
  }

  const createResult = executeCommand(
    'gh',
    [
      'release',
      'create',
      options.currentTag,
      '--repo',
      options.repository.slug,
      '--verify-tag',
      '--title',
      options.currentTag,
      '--notes-file',
      '-',
    ],
    {
      allowFailure: true,
      input: options.notes,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  );

  if (createResult.status !== 0) {
    const recoveredRelease = queryGhRelease(
      options.currentTag,
      options.repository.slug
    );

    if (recoveredRelease) {
      return requirePublishedGitHubRelease(
        recoveredRelease,
        options.currentTag
      );
    }

    console.error('gh failed to create the GitHub Release');
    return null;
  }

  return (
    queryGhRelease(options.currentTag, options.repository.slug)?.url ??
    `${options.repository.webUrl}/releases/tag/${encodeURIComponent(options.currentTag)}`
  );
}

/**
 * Queries a GitHub Release URL through gh
 * @param {string} tag Release tag
 * @param {string} slug GitHub owner/repository slug
 * @returns {{ draft: boolean; prerelease: boolean; url: string } | null} Existing release details
 */
function queryGhRelease(tag, slug) {
  const result = executeCommand(
    'gh',
    [
      'release',
      'view',
      tag,
      '--repo',
      slug,
      '--json',
      'url,isDraft,isPrerelease',
    ],
    { allowFailure: true }
  );

  if (result.status !== 0) {
    return null;
  }

  try {
    const data = JSON.parse(result.stdout);
    return {
      draft: data.isDraft === true,
      prerelease: data.isPrerelease === true,
      url:
        typeof data.url === 'string' && data.url
          ? data.url
          : `https://github.com/${slug}/releases/tag/${encodeURIComponent(tag)}`,
    };
  } catch {
    return null;
  }
}

/**
 * Publishes a GitHub Release through the REST API
 * @param {{ currentTag: string; notes: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} options Release values
 * @param {string} token GitHub token
 * @returns {Promise<string>} Release URL
 */
async function publishGitHubReleaseWithApi(options, token) {
  const existingRelease = await queryGitHubReleaseWithApi(options, token);

  if (existingRelease) {
    const releaseUrl = requirePublishedGitHubRelease(
      existingRelease,
      options.currentTag
    );
    console.log(`GitHub Release already exists: ${releaseUrl}`);
    return releaseUrl;
  }

  const endpoint = `https://api.github.com/repos/${options.repository.slug}/releases`;
  let response;

  try {
    response = await requestGitHubApi(endpoint, token, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: options.currentTag,
        name: options.currentTag,
        body: options.notes,
        draft: false,
        prerelease: false,
        make_latest: 'true',
      }),
    });
  } catch (error) {
    const recoveredRelease = await queryGitHubReleaseWithApi(options, token);

    if (recoveredRelease) {
      return requirePublishedGitHubRelease(
        recoveredRelease,
        options.currentTag
      );
    }

    throw error;
  }

  const responseCategory = classifyGitHubReleaseResponse(response.status);

  if (responseCategory === 'created') {
    const data = await response.json();
    return typeof data.html_url === 'string' && data.html_url
      ? data.html_url
      : `${options.repository.webUrl}/releases/tag/${encodeURIComponent(options.currentTag)}`;
  }

  if (responseCategory === 'validation') {
    const recoveredRelease = await queryGitHubReleaseWithApi(options, token);

    if (recoveredRelease) {
      return requirePublishedGitHubRelease(
        recoveredRelease,
        options.currentTag
      );
    }
  }

  throw await createGitHubReleaseResponseError(response);
}

/**
 * Queries an existing GitHub Release by tag through the REST API
 * @param {{ currentTag: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} options Release values
 * @param {string} token GitHub token
 * @returns {Promise<{ draft: boolean; prerelease: boolean; url: string } | null>} Existing release details
 */
async function queryGitHubReleaseWithApi(options, token) {
  const endpoint = `https://api.github.com/repos/${options.repository.slug}/releases/tags/${encodeURIComponent(options.currentTag)}`;
  const response = await requestGitHubApi(endpoint, token);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await createGitHubReleaseResponseError(response);
  }

  const data = await response.json();
  return {
    draft: data.draft === true,
    prerelease: data.prerelease === true,
    url:
      typeof data.html_url === 'string' && data.html_url
        ? data.html_url
        : `${options.repository.webUrl}/releases/tag/${encodeURIComponent(options.currentTag)}`,
  };
}

/**
 * Treats only a published stable Release as an idempotent success
 * @param {{ draft: boolean; prerelease: boolean; url: string }} release Existing release
 * @param {string} currentTag Release tag
 * @returns {string} Published release URL
 */
export function requirePublishedGitHubRelease(release, currentTag) {
  if (release.draft || release.prerelease) {
    const state = release.draft ? 'draft' : 'prerelease';

    throw new GitHubReleaseError(
      409,
      `GitHub Release ${currentTag} already exists as a ${state} and is not a published stable Release: ${release.url}`,
      release.url
    );
  }

  return release.url;
}

/**
 * Sends an authenticated GitHub API request with a timeout
 * @param {string} url API URL
 * @param {string} token GitHub token
 * @param {RequestInit} [requestInit] Request options
 * @returns {Promise<Response>} GitHub response
 */
async function requestGitHubApi(url, token, requestInit = {}) {
  const abortController = new globalThis.AbortController();
  const timeoutId = globalThis.setTimeout(
    () => abortController.abort(),
    githubRequestTimeoutMs
  );

  try {
    return await globalThis.fetch(url, {
      ...requestInit,
      signal: abortController.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dir-tree-release-script',
        'X-GitHub-Api-Version': githubApiVersion,
        ...requestInit.headers,
      },
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Creates a sanitized GitHub API error
 * @param {Response} response GitHub API response
 * @returns {Promise<GitHubReleaseError>} Sanitized error
 */
async function createGitHubReleaseResponseError(response) {
  let message = `GitHub Releases API returned ${response.status}`;

  try {
    const data = await response.json();

    if (typeof data.message === 'string') {
      message = `${message}: ${data.message}`;
    }
  } catch {
    // Keep the status-only message when the response is not JSON
  }

  return new GitHubReleaseError(response.status, message);
}

/**
 * Prints a manual GitHub Release fallback with the exact generated notes
 * @param {{ currentTag: string; existingReleaseUrl?: string | null; notes: string; repository: ReturnType<typeof parseGitHubRepositoryUrl> }} options Release values
 */
function printManualGitHubRelease(options) {
  const releaseUrl =
    options.existingReleaseUrl ??
    `${options.repository.webUrl}/releases/new?tag=${encodeURIComponent(options.currentTag)}&title=${encodeURIComponent(options.currentTag)}`;

  console.log(
    options.existingReleaseUrl
      ? '\nExisting GitHub Release requires manual review and publication'
      : '\nGitHub Release requires manual publication'
  );
  console.log(`URL: ${releaseUrl}`);
  console.log(`Title: ${options.currentTag}`);
  console.log('\n--- Release notes ---');
  console.log(options.notes);
  console.log('--- End release notes ---');
  console.log(
    '\nInstall and authenticate gh, or set GH_TOKEN/GITHUB_TOKEN, to publish automatically next time'
  );
}

/**
 * Returns a readable error message
 * @param {unknown} error Caught error
 * @returns {string} Error message
 */
function getErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  return redactSensitiveValues(message, [
    process.env.GH_TOKEN,
    process.env.GITHUB_TOKEN,
  ]);
}

/**
 * Prints release script usage
 */
function printHelp() {
  console.log('Usage: npm run release');
  console.log('');
  console.log('Interactively prepares a stable package release from main');
  console.log('No release action runs when --help is provided');
}

/**
 * Runs the interactive release workflow
 */
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  if (process.argv.length > 2) {
    throw new ReleaseError('The release script does not accept CLI arguments');
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ReleaseError(
      'The release script requires an interactive terminal'
    );
  }

  const initial = runInitialPreflight();
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const state = {
    commitCreated: false,
    currentTag: null,
    originalFiles: null,
    publishing: false,
    pushed: false,
    releaseCommitSha: null,
    releasePublished: false,
    releaseTagObjectSha: null,
    repositoryWebUrl: null,
    restored: false,
    tagCreated: false,
  };

  activeReleaseState = state;

  try {
    console.log(`Current version: ${initial.currentVersion}`);

    const targetVersion = await askTargetVersion(
      readline,
      initial.currentVersion
    );
    const promotedPreview = promoteChangelog(
      initial.changelogText,
      targetVersion
    );
    const target = runTargetPreflight(
      initial.currentVersion,
      targetVersion,
      initial.packageJson
    );
    assertReleaseBaseUnchanged(target.releaseBaseSha, { requireClean: true });
    assertReleaseTagBaseline(
      target.previousTag,
      target.previousTagCommit,
      target.currentTag
    );
    assertReleaseFilesMatch(initial.originalFiles);
    state.currentTag = target.currentTag;
    state.repositoryWebUrl = target.repository.webUrl;

    printReleasePreview({
      changelog: promotedPreview.changelog,
      currentTag: target.currentTag,
      currentVersion: initial.currentVersion,
      previousTag: target.previousTag,
      repositoryWebUrl: target.repository.webUrl,
      targetVersion,
    });

    const shouldPrepare = await askConfirmation(
      readline,
      `Prepare local release ${target.currentTag}? [Y/n] `,
      true
    );

    if (!shouldPrepare) {
      console.log('Release preparation cancelled before modifying files');
      return;
    }

    assertReleaseBaseUnchanged(target.releaseBaseSha, { requireClean: true });
    assertReleaseTagBaseline(
      target.previousTag,
      target.previousTagCommit,
      target.currentTag
    );
    assertReleaseFilesMatch(initial.originalFiles);
    state.originalFiles = initial.originalFiles;

    const releaseChangelog = updateReleaseFiles(
      targetVersion,
      initial.changelogText
    );
    const preparedFiles = captureReleaseFiles();

    runReleaseChecks(preparedFiles);

    const releaseCommitSha = createReleaseCommitAndTag(
      {
        currentTag: target.currentTag,
        expectedFiles: preparedFiles,
        previousTag: target.previousTag,
        previousTagCommit: target.previousTagCommit,
        releaseBaseSha: target.releaseBaseSha,
      },
      state
    );
    const statistics = collectReleaseStatistics(
      target.previousTag,
      target.currentTag
    );
    const releaseNotes = buildGitHubReleaseNotes({
      ...statistics,
      changelog: releaseChangelog,
      currentTag: target.currentTag,
      displayName: target.displayName,
      previousTag: target.previousTag,
      repositoryWebUrl: target.repository.webUrl,
      version: targetVersion,
    });

    console.log('\nLocal release commit and annotated tag created');
    console.log(`Commit: ${releaseCommitSha}`);
    console.log(`Tag:    ${target.currentTag}`);

    const shouldPush = await askConfirmation(
      readline,
      `Push main and ${target.currentTag} to origin atomically? [Y/n] `,
      true
    );

    if (!shouldPush) {
      console.log('\nRelease is prepared locally but has not been pushed');
      console.log(
        `Retry with: ${buildAtomicPushCommand(
          target.currentTag,
          releaseCommitSha,
          state.releaseTagObjectSha
        )}`
      );
      return;
    }

    try {
      pushRelease({
        currentTag: target.currentTag,
        originMainSha: target.originMainSha,
        previousTag: target.previousTag,
        previousTagCommit: target.previousTagCommit,
        releaseCommitSha,
        repositorySlug: target.repository.slug,
      });
    } catch (error) {
      console.error('\nThe local release commit and tag were kept');
      console.error(
        `Retry the atomic push with: ${buildAtomicPushCommand(
          target.currentTag,
          releaseCommitSha,
          state.releaseTagObjectSha
        )}`
      );
      throw error;
    }

    state.pushed = true;
    console.log('\nRelease commit and tag pushed successfully');

    const shouldPublishRelease = await askConfirmation(
      readline,
      `Publish GitHub Release ${target.currentTag} now?\nThis will trigger npm publishing. [y/N] `,
      false
    );

    if (!shouldPublishRelease) {
      console.log('GitHub Release publication skipped');
      printManualGitHubRelease({
        currentTag: target.currentTag,
        notes: releaseNotes,
        repository: target.repository,
      });
      return;
    }

    state.publishing = true;
    let releaseUrl;

    try {
      releaseUrl = await publishGitHubRelease({
        currentTag: target.currentTag,
        notes: releaseNotes,
        releaseCommitSha,
        repository: target.repository,
      });
      state.releasePublished = Boolean(releaseUrl);
    } finally {
      state.publishing = false;
    }

    if (releaseUrl) {
      console.log(`\nGitHub Release published: ${releaseUrl}`);
      console.log(
        `Release workflow: ${target.repository.webUrl}/actions/workflows/release.yml`
      );
    }
  } catch (error) {
    if (!state.commitCreated) {
      restoreReleaseFiles(state);
    }

    throw error;
  } finally {
    activeReleaseState = null;
    readline.close();
  }
}

/**
 * Restores owned files when the interactive process is interrupted
 * @param {NodeJS.Signals} signal Received signal
 */
function handleProcessSignal(signal) {
  console.error(`\nRelease interrupted by ${signal}`);

  if (activeReleaseState && !activeReleaseState.commitCreated) {
    restoreReleaseFiles(activeReleaseState);
  } else if (
    activeReleaseState?.commitCreated &&
    !activeReleaseState.tagCreated &&
    activeReleaseState.currentTag &&
    activeReleaseState.releaseCommitSha
  ) {
    console.error('The release commit was kept without a verified tag');
    console.error(
      `Create the tag with: ${buildTagCommand(
        activeReleaseState.currentTag,
        activeReleaseState.releaseCommitSha
      )}`
    );
  } else if (
    activeReleaseState?.pushed &&
    activeReleaseState.currentTag &&
    activeReleaseState.repositoryWebUrl
  ) {
    console.error('The release commit and tag were already pushed to origin');

    if (activeReleaseState.publishing) {
      console.error(
        'The GitHub Release request may have completed before the interruption'
      );
    } else if (activeReleaseState.releasePublished) {
      console.error('The GitHub Release was reported as published');
    } else {
      console.error('The GitHub Release was not published by this process');
    }

    console.error(
      `Check: ${activeReleaseState.repositoryWebUrl}/releases/tag/${encodeURIComponent(activeReleaseState.currentTag)}`
    );
  } else if (
    activeReleaseState?.tagCreated &&
    activeReleaseState.currentTag &&
    activeReleaseState.releaseCommitSha &&
    activeReleaseState.releaseTagObjectSha
  ) {
    console.error('The local release commit and tag were kept');
    console.error(
      `Push later with: ${buildAtomicPushCommand(
        activeReleaseState.currentTag,
        activeReleaseState.releaseCommitSha,
        activeReleaseState.releaseTagObjectSha
      )}`
    );
  }

  process.exit(signal === 'SIGINT' ? 130 : 143);
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  process.once('SIGINT', () => handleProcessSignal('SIGINT'));
  process.once('SIGTERM', () => handleProcessSignal('SIGTERM'));

  main().catch(error => {
    console.error(`Release failed: ${getErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
