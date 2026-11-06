import type { GitignoreRule } from './types';

/**
 * Date: 2026-11-07
 * Desc: Compiles exclude patterns and scoped gitignore rules
 */

// Glob expression cache keyed by raw glob pattern
const globRegexCache = new Map<string, RegExp>();

// Exclude pattern regex cache keyed by pattern list
const excludePatternRegexCache = new Map<string, RegExp[]>();

/**
 * Compiles a glob pattern into a cached regular expression
 * @param glob Glob pattern using * and ? wildcards
 * @returns Regular expression matching paths against the glob
 */
export function globToRegex(glob: string): RegExp {
  const cachedRegex = globRegexCache.get(glob);

  if (cachedRegex) {
    return cachedRegex;
  }

  const normalized = glob.replace(/\\/gu, '/').replace(/^\.?\//u, '');
  let source = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];
    const followingCharacter = normalized[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (followingCharacter === '/') {
        source += '(?:.*/)?';
        index += 2;
        continue;
      }

      source += '.*';
      index += 1;
      continue;
    }

    if (character === '*') {
      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExpCharacter(character ?? '');
  }

  source = normalized.includes('/') ? `^${source}` : `(^|.*/)${source}`;
  source = `${source}(/.*)?$`;

  const regex = new RegExp(source);
  globRegexCache.set(glob, regex);

  return regex;
}

/**
 * Escapes a single character for use inside a regular expression
 * @param character Character to escape
 * @returns Escaped character text
 */
function escapeRegExpCharacter(character: string): string {
  return /[.+^${}()|[\]\\]/u.test(character) ? `\\${character}` : character;
}

/**
 * Parses gitignore content into compiled ignore rules
 * @param content Raw gitignore file content
 * @param baseDir Tree-relative directory the rules are anchored to
 * @returns Compiled gitignore rules
 */
export function parseGitignore(
  content: string,
  baseDir: string
): GitignoreRule[] {
  const rules: GitignoreRule[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    let pattern = line;
    let negate = false;

    if (pattern.startsWith('!')) {
      negate = true;
      pattern = pattern.slice(1);
    }

    const directoryOnly = pattern.endsWith('/');
    pattern = pattern.replace(/\/$/u, '');

    const isAnchored = pattern.startsWith('/');
    const normalizedPattern = pattern.replace(/^\//u, '');
    const hasPathSeparator = normalizedPattern.includes('/');
    const relativePattern =
      isAnchored || hasPathSeparator
        ? normalizedPattern
        : `**/${normalizedPattern}`;
    const fullPattern = baseDir
      ? `${baseDir}/${relativePattern}`
      : relativePattern;

    try {
      rules.push({
        negate,
        regex: globToRegex(fullPattern),
        ...(directoryOnly ? { directoryOnly: true } : {}),
      });
    } catch {
      // Ignore invalid ignore patterns
    }
  }

  return rules;
}

/**
 * Builds a stable cache key for an exclude pattern list
 * @param excludePatterns Exclude glob patterns
 * @returns Cache key for the pattern list
 */
function getExcludePatternCacheKey(excludePatterns: string[]): string {
  return excludePatterns.join('\u0000');
}

/**
 * Returns cached regular expressions for exclude patterns
 * @param excludePatterns Exclude glob patterns
 * @returns Compiled regular expressions
 */
function getExcludePatternRegexes(excludePatterns: string[]): RegExp[] {
  const cacheKey = getExcludePatternCacheKey(excludePatterns);
  const cachedRegexes = excludePatternRegexCache.get(cacheKey);

  if (cachedRegexes) {
    return cachedRegexes;
  }

  const regexes = excludePatterns.map(pattern => globToRegex(pattern));
  excludePatternRegexCache.set(cacheKey, regexes);

  return regexes;
}

/**
 * Checks whether a path matches any exclude pattern
 * @param fullPath Path to test
 * @param excludePatterns Exclude glob patterns
 * @returns True when the path matches an exclude pattern
 */
export function isPathExcluded(
  fullPath: string,
  excludePatterns: string[]
): boolean {
  return getExcludePatternRegexes(excludePatterns).some(regex =>
    regex.test(fullPath)
  );
}
