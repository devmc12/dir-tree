import { normalizeRemoteRepositoryPath } from './path';
import type { RemoteRepositoryEntry, RemoteRepositoryProvider } from './types';
import { RemoteRepositoryError } from './errors';

/**
 * Date: 2026-11-07
 * Desc: Applies repository subpath scoping to provider entries
 */

/**
 * Joins a repository path prefix and relative child path
 * @param pathPrefix Optional repository path prefix
 * @param childPath Relative repository child path
 * @returns Normalized joined repository path
 */
export function joinRemoteRepositoryPath(
  pathPrefix: string,
  childPath: string
): string {
  return normalizeRemoteRepositoryPath(
    pathPrefix ? `${pathPrefix}/${childPath}` : childPath
  );
}

/**
 * Validates and limits entries to an optional repository subpath
 * @param entries Repository entries returned by the provider
 * @param subPath Optional subpath that must exist and be a directory
 * @param provider Repository provider used for error context
 * @returns Original entries or entries scoped to the requested directory
 */
export function scopeRemoteRepositoryEntries(
  entries: RemoteRepositoryEntry[],
  subPath: string | undefined,
  provider: RemoteRepositoryProvider
): RemoteRepositoryEntry[] {
  const normalizedSubPath = normalizeRemoteRepositoryPath(subPath ?? '');

  if (!normalizedSubPath) {
    return entries;
  }

  const hasSubPath = entries.some(entry => {
    return (
      (entry.kind === 'directory' && entry.path === normalizedSubPath) ||
      entry.path.startsWith(`${normalizedSubPath}/`)
    );
  });

  if (!hasSubPath) {
    throw createRemoteRepositorySubPathError(provider);
  }

  return entries.filter(entry => {
    return (
      entry.path === normalizedSubPath ||
      entry.path.startsWith(`${normalizedSubPath}/`)
    );
  });
}

/**
 * Creates a typed error for a missing or non-directory repository subpath
 * @param provider Repository provider used for error context
 * @returns Not-found repository error
 */
export function createRemoteRepositorySubPathError(
  provider: RemoteRepositoryProvider
): RemoteRepositoryError {
  return new RemoteRepositoryError({
    code: 'not-found',
    message: 'Repository path was not found or is not a directory',
    provider,
  });
}
