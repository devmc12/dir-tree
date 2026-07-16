import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGitHubCompareUrl,
  buildGitHubReleaseNotes,
  buildNpmRegistryArgs,
  classifyGitHubReleaseResponse,
  compareStableVersions,
  createChildProcessEnvironment,
  isExplicitNpmNotFound,
  normalizeStableVersion,
  parseConfirmation,
  parseGitHubRepositoryUrl,
  parseGitNumstat,
  parseNullSeparatedGitPaths,
  promoteChangelog,
  redactSensitiveValues,
  requirePublishedGitHubRelease,
  validateManifestVersions,
  validatePreparedChangelog,
  validateVersionIncrement,
} from './release.mjs';

/**
 * Date: 2026-07-16
 * Desc: Verifies pure release preparation and GitHub note generation helpers
 */

describe('release version helpers', () => {
  it('normalizes stable versions and compares them numerically', () => {
    assert.equal(normalizeStableVersion('1.0.3'), '1.0.3');
    assert.equal(normalizeStableVersion(' v2.10.0 '), '2.10.0');
    assert.equal(compareStableVersions('1.0.3', '1.0.2'), 1);
    assert.equal(compareStableVersions('1.0.2', '1.0.2'), 0);
    assert.equal(compareStableVersions('1.0.2', '1.1.0'), -1);
    assert.equal(
      compareStableVersions('9007199254740993.0.0', '9007199254740992.999.999'),
      1
    );
  });

  it('requires the target version to be newer than the current version', () => {
    assert.equal(validateVersionIncrement('1.0.2', 'v1.0.3'), '1.0.3');
    assert.throws(() => validateVersionIncrement('1.0.2', '1.0.2'));
    assert.throws(() => validateVersionIncrement('1.0.2', '1.0.1'));
  });

  it('rejects prerelease, metadata, and leading-zero versions', () => {
    for (const invalidVersion of [
      '1.0.3-beta.1',
      '1.0.3+build.1',
      '01.0.3',
      '1.00.3',
      '1.0',
      'release-1.0.3',
    ]) {
      assert.throws(() => normalizeStableVersion(invalidVersion));
    }
  });

  it('parses confirmations with explicit defaults', () => {
    assert.equal(parseConfirmation('', true), true);
    assert.equal(parseConfirmation('', false), false);
    assert.equal(parseConfirmation('Y', false), true);
    assert.equal(parseConfirmation('yes', false), true);
    assert.equal(parseConfirmation('N', true), false);
    assert.equal(parseConfirmation('no', true), false);
    assert.equal(parseConfirmation('maybe', true), null);
  });
});

describe('release changelog helpers', () => {
  it('promotes LF Unreleased content and preserves release notes', () => {
    const changelog = [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '- Fixed one',
      '- Added two',
      '',
      '## 1.0.2',
      '',
      '- Previous',
      '',
    ].join('\n');
    const result = promoteChangelog(changelog, '1.0.3');

    assert.equal(result.changelog, '- Fixed one\n- Added two');
    assert.equal(
      result.text,
      [
        '# Changelog',
        '',
        '## Unreleased',
        '',
        '## 1.0.3',
        '',
        '- Fixed one',
        '- Added two',
        '',
        '## 1.0.2',
        '',
        '- Previous',
        '',
      ].join('\n')
    );
    assert.equal(
      validatePreparedChangelog(result.text, '1.0.3', result.changelog),
      result.changelog
    );
  });

  it('preserves CRLF changelog line endings and Markdown blocks', () => {
    const changelog = [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '### Added',
      '',
      '```text',
      'example',
      '```',
      '',
      '## 1.0.2',
      '',
    ].join('\r\n');
    const result = promoteChangelog(changelog, '1.0.3');

    assert.match(result.text, /## Unreleased\r\n\r\n## 1\.0\.3\r\n/u);
    assert.equal(
      result.changelog,
      ['### Added', '', '```text', 'example', '```'].join('\r\n')
    );
    assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  });

  it('preserves indented Markdown and ignores headings inside fenced blocks', () => {
    const changelog = [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      '    indented code',
      '',
      '```md',
      '## Unreleased',
      '## 9.9.9',
      '```',
      '',
      '- Final item  ',
      '',
      '## 1.0.2',
      '',
      '- Previous',
      '',
    ].join('\n');
    const expectedChangelog = [
      '    indented code',
      '',
      '```md',
      '## Unreleased',
      '## 9.9.9',
      '```',
      '',
      '- Final item  ',
    ].join('\n');
    const result = promoteChangelog(changelog, '1.0.3');

    assert.equal(result.changelog, expectedChangelog);
    assert.equal(
      validatePreparedChangelog(result.text, '1.0.3', expectedChangelog),
      expectedChangelog
    );
  });

  it('preserves the trailing newline state when Unreleased is last', () => {
    const withoutTrailingNewline = '## Unreleased\n\n- Final item';
    const withTrailingNewline = `${withoutTrailingNewline}\n`;
    const withoutResult = promoteChangelog(withoutTrailingNewline, '1.0.3');
    const withResult = promoteChangelog(withTrailingNewline, '1.0.3');

    assert.equal(withoutResult.text.endsWith('\n'), false);
    assert.equal(withResult.text.endsWith('\n'), true);
    assert.equal(withResult.text.endsWith('\n\n'), false);
  });

  it('rejects missing, duplicate, empty, and existing version sections', () => {
    assert.throws(() => promoteChangelog('# Changelog\n', '1.0.3'));
    assert.throws(() =>
      promoteChangelog(
        '## Unreleased\n\n- One\n\n## Unreleased\n\n- Two\n',
        '1.0.3'
      )
    );
    assert.throws(() =>
      promoteChangelog('## Unreleased\n\n## 1.0.2\n', '1.0.3')
    );
    assert.throws(() =>
      promoteChangelog(
        '## Unreleased\n\n- One\n\n## 1.0.3\n\n- Existing\n',
        '1.0.3'
      )
    );
  });
});

describe('release metadata helpers', () => {
  it('validates all package and lockfile version fields', () => {
    assert.equal(
      validateManifestVersions(
        { version: '1.0.3' },
        { version: '1.0.3', packages: { '': { version: '1.0.3' } } }
      ),
      '1.0.3'
    );

    assert.throws(() =>
      validateManifestVersions(
        { version: '1.0.3' },
        { version: '1.0.2', packages: { '': { version: '1.0.3' } } }
      )
    );
    assert.throws(() =>
      validateManifestVersions(
        { version: '1.0.3' },
        { version: '1.0.3', packages: { '': { version: '1.0.2' } } }
      )
    );
    assert.throws(() =>
      validateManifestVersions(
        { version: 'v1.0.3' },
        { version: '1.0.3', packages: { '': { version: '1.0.3' } } }
      )
    );
    assert.throws(() =>
      validateManifestVersions(
        { version: '1.0.3' },
        { version: '1.0.3', packages: {} }
      )
    );
  });

  it('parses GitHub HTTPS, SCP-style, and SSH origins', () => {
    for (const remoteUrl of [
      'https://github.com/devmc12/dir-tree.git',
      'git@github.com:devmc12/dir-tree.git',
      'ssh://git@github.com/devmc12/dir-tree.git',
    ]) {
      assert.deepEqual(parseGitHubRepositoryUrl(remoteUrl), {
        owner: 'devmc12',
        repo: 'dir-tree',
        slug: 'devmc12/dir-tree',
        webUrl: 'https://github.com/devmc12/dir-tree',
      });
    }

    assert.throws(() =>
      parseGitHubRepositoryUrl('https://gitlab.com/devmc12/dir-tree.git')
    );
    assert.throws(() =>
      parseGitHubRepositoryUrl('ftp://github.com/devmc12/dir-tree.git')
    );
    assert.throws(() =>
      parseGitHubRepositoryUrl('git@github.com:devmc12/nested/dir-tree.git')
    );
  });

  it('builds an ordered GitHub compare URL and rejects reversed tags', () => {
    assert.equal(
      buildGitHubCompareUrl(
        'https://github.com/devmc12/dir-tree',
        'v1.0.2',
        'v1.0.3'
      ),
      'https://github.com/devmc12/dir-tree/compare/v1.0.2...v1.0.3'
    );
    assert.throws(() =>
      buildGitHubCompareUrl(
        'https://github.com/devmc12/dir-tree',
        'v1.0.3',
        'v1.0.2'
      )
    );
  });

  it('counts text and binary numstat rows', () => {
    assert.deepEqual(
      parseGitNumstat(
        ['10\t2\tsrc/index.ts', '-\t-\timage.png', '0\t4\told.ts', ''].join(
          '\n'
        )
      ),
      {
        deletions: 6,
        filesChanged: 3,
        insertions: 10,
      }
    );
  });

  it('parses NUL-separated Git paths without losing leading spaces', () => {
    assert.deepEqual(
      parseNullSeparatedGitPaths(
        'CHANGELOG.md\0package-lock.json\0package.json\0 leading-name.txt\0'
      ),
      ['CHANGELOG.md', 'package-lock.json', 'package.json', ' leading-name.txt']
    );
  });

  it('accepts only an explicit npm E404 as an unpublished version', () => {
    assert.equal(isExplicitNpmNotFound('npm error code E404'), true);
    assert.equal(isExplicitNpmNotFound('404 Not Found'), false);
    assert.equal(isExplicitNpmNotFound('network error ECONNRESET'), false);
  });

  it('pins scoped and unscoped package lookups to the public npm registry', () => {
    assert.deepEqual(buildNpmRegistryArgs('dir-tree'), [
      '--registry',
      'https://registry.npmjs.org/',
    ]);
    assert.deepEqual(buildNpmRegistryArgs('@devmc12/dir-tree'), [
      '--registry',
      'https://registry.npmjs.org/',
      '--@devmc12:registry=https://registry.npmjs.org/',
    ]);
  });
});

describe('GitHub Release notes', () => {
  it('builds statistics, compare link, overview, and changelog Markdown', () => {
    const notes = buildGitHubReleaseNotes({
      changelog: [
        '- Fixed remote repository completeness',
        '- Added GitHub `truncated` recovery',
      ].join('\n'),
      commitSubjects: [
        'fix: complete remote repository tree reads',
        'feat: add interactive release script',
        'release: v1.0.3',
      ],
      currentTag: 'v1.0.3',
      deletions: 83,
      displayName: 'dir-tree',
      filesChanged: 12,
      insertions: 520,
      previousTag: 'v1.0.2',
      repositoryWebUrl: 'https://github.com/devmc12/dir-tree',
      version: '1.0.3',
    });

    assert.equal(
      notes,
      [
        '# dir-tree v1.0.3',
        '',
        '> 3 commits · 12 files changed · +520 / -83',
        '>',
        '> Full Changelog: [v1.0.2...v1.0.3](https://github.com/devmc12/dir-tree/compare/v1.0.2...v1.0.3)',
        '',
        '## Overview',
        '',
        '- fix: complete remote repository tree reads',
        '- feat: add interactive release script',
        '- release: v1.0.3',
        '',
        '## Changelog',
        '',
        '- Fixed remote repository completeness',
        '- Added GitHub `truncated` recovery',
        '',
      ].join('\n')
    );
  });

  it('keeps the supplied changelog Markdown byte-for-byte within the notes', () => {
    const changelog = [
      '    indented code',
      '',
      '```md',
      '## Nested heading',
      '```',
      '',
      '- trailing spaces stay  ',
    ].join('\n');
    const notes = buildGitHubReleaseNotes({
      changelog,
      commitSubjects: ['release: v1.0.3'],
      currentTag: 'v1.0.3',
      deletions: 0,
      displayName: 'dir-tree',
      filesChanged: 3,
      insertions: 3,
      previousTag: 'v1.0.2',
      repositoryWebUrl: 'https://github.com/devmc12/dir-tree',
      version: '1.0.3',
    });

    assert.ok(notes.includes(`## Changelog\n\n${changelog}\n`));
  });

  it('classifies GitHub Releases API statuses without response data', () => {
    assert.equal(classifyGitHubReleaseResponse(200), 'exists');
    assert.equal(classifyGitHubReleaseResponse(201), 'created');
    assert.equal(classifyGitHubReleaseResponse(401), 'unauthorized');
    assert.equal(classifyGitHubReleaseResponse(403), 'forbidden');
    assert.equal(classifyGitHubReleaseResponse(404), 'not-found');
    assert.equal(classifyGitHubReleaseResponse(422), 'validation');
    assert.equal(classifyGitHubReleaseResponse(500), 'unknown');
  });

  it('treats only a published stable GitHub Release as idempotent', () => {
    assert.equal(
      requirePublishedGitHubRelease(
        {
          draft: false,
          prerelease: false,
          url: 'https://github.com/devmc12/dir-tree/releases/tag/v1.0.3',
        },
        'v1.0.3'
      ),
      'https://github.com/devmc12/dir-tree/releases/tag/v1.0.3'
    );
    assert.throws(
      () =>
        requirePublishedGitHubRelease(
          { draft: true, prerelease: false, url: 'https://example.test/draft' },
          'v1.0.3'
        ),
      error =>
        error.status === 409 &&
        error.releaseUrl === 'https://example.test/draft'
    );
    assert.throws(() =>
      requirePublishedGitHubRelease(
        {
          draft: false,
          prerelease: true,
          url: 'https://example.test/prerelease',
        },
        'v1.0.3'
      )
    );
  });

  it('redacts GitHub tokens from errors without changing other text', () => {
    assert.equal(
      redactSensitiveValues(
        'Request failed with Bearer secret-token-123 at endpoint',
        ['secret-token-123', undefined]
      ),
      'Request failed with Bearer [REDACTED] at endpoint'
    );
  });

  it('does not pass GitHub tokens to npm, Git, gh, or hooks', () => {
    assert.deepEqual(
      createChildProcessEnvironment({
        GH_TOKEN: 'gh-secret',
        GitHub_Token: 'github-secret',
        PATH: 'test-path',
      }),
      { PATH: 'test-path' }
    );
  });
});
