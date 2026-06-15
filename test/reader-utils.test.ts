import { describe, expect, it } from 'vitest';
import { isPathExcluded, parseGitignore } from '../src/reader';

/**
 * Date: 2026-06-08
 * Desc: Verifies reader ignore and exclude pattern utilities
 */

function isIgnoredByRules(
  path: string,
  rules: ReturnType<typeof parseGitignore>
): boolean {
  let ignored = false;

  rules.forEach(rule => {
    if (rule.regex.test(path)) {
      ignored = !rule.negate;
    }
  });

  return ignored;
}

describe('reader ignore utilities', () => {
  it('matches exclude globs across root, nested, and Windows-style paths', () => {
    const patterns = [
      'dist',
      '**/*.map',
      '**/src/**/tmp/**',
      '**\\docs\\drafts',
    ];

    expect(isPathExcluded('project/dist/index.js', patterns)).toBe(true);
    expect(isPathExcluded('project/src/app/debug.map', patterns)).toBe(true);
    expect(isPathExcluded('project/src/app/tmp/cache.txt', patterns)).toBe(
      true
    );
    expect(isPathExcluded('project/docs/drafts/notes.md', patterns)).toBe(true);
    expect(isPathExcluded('project/src/app/index.ts', patterns)).toBe(false);
  });

  it('parses root gitignore rules with negation and comments', () => {
    const rules = parseGitignore(
      ['# ignored comment', 'dist/', '*.log', '!important.log', ''].join('\n'),
      'project'
    );

    expect(isIgnoredByRules('project/dist/index.js', rules)).toBe(true);
    expect(isIgnoredByRules('project/src/runtime.log', rules)).toBe(true);
    expect(isIgnoredByRules('project/important.log', rules)).toBe(false);
    expect(isIgnoredByRules('project/src/index.ts', rules)).toBe(false);
  });

  it('parses nested gitignore rules relative to their directory', () => {
    const rootRules = parseGitignore('*.tmp\n', 'project');
    const nestedRules = parseGitignore(
      '/generated\n!generated/keep.tmp\n',
      'project/src'
    );
    const rules = [...rootRules, ...nestedRules];

    expect(isIgnoredByRules('project/readme.tmp', rules)).toBe(true);
    expect(isIgnoredByRules('project/src/generated/index.ts', rules)).toBe(
      true
    );
    expect(isIgnoredByRules('project/generated/index.ts', rules)).toBe(false);
    expect(isIgnoredByRules('project/src/generated/keep.tmp', rules)).toBe(
      false
    );
  });
});
