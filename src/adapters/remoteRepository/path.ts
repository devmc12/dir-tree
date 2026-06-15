/**
 * Date: 2026-06-07
 * Desc: Provides remote repository path helpers
 */

/**
 * Normalizes a repository path to forward slashes without surrounding slashes
 * @param path Raw repository path
 * @returns Normalized path using forward slashes
 */
export function normalizeRemoteRepositoryPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '');
}

/**
 * Splits a repository path into non-empty segments
 * @param path Raw repository path
 * @returns Path segments with empty parts removed
 */
export function splitRemoteRepositoryPath(path: string): string[] {
  return normalizeRemoteRepositoryPath(path).split('/').filter(Boolean);
}

/**
 * Checks whether the prefix segments match the start of the path segments
 * @param prefixSegments Candidate prefix segments
 * @param pathSegments Path segments to test against
 * @returns True when every prefix segment matches in order
 */
export function isPathSegmentsPrefix(
  prefixSegments: string[],
  pathSegments: string[]
): boolean {
  return prefixSegments.every(
    (segment, index) => segment === pathSegments[index]
  );
}
