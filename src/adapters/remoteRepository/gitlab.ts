import type {
  ParsedRemoteRepositoryUrl,
  RemoteRepositoryTreeOptions,
  RemoteRepositoryEntry,
} from './types';
import { normalizeRemoteRepositoryPath } from './path';
import { requestAllRemoteRepositoryJsonPages } from './http';
import { scopeRemoteRepositoryEntries } from './scope';

/**
 * Date: 2026-11-07
 * Desc: Reads paginated GitLab tree entries
 */

/**
 * Lists recursive tree entries from the GitLab repository tree API
 * @param parsedUrl Parsed GitLab repository URL
 * @param ref Branch, tag, or commit reference to read
 * @param token Optional access token used for authenticated requests
 * @param options Tree request options including subpath and metadata flags
 * @returns Repository entries optionally limited to the requested subpath
 */
export async function listGitLabTreeEntries(
  parsedUrl: ParsedRemoteRepositoryUrl,
  ref: string,
  token: string | undefined,
  options: RemoteRepositoryTreeOptions = {}
): Promise<RemoteRepositoryEntry[]> {
  const url = new URL(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(parsedUrl.projectPath ?? '')}/repository/tree`
  );

  url.searchParams.set('ref', ref);
  url.searchParams.set('recursive', 'true');
  url.searchParams.set('pagination', 'keyset');
  url.searchParams.set('per_page', '100');

  if (options.subPath) {
    url.searchParams.set(
      'path',
      normalizeRemoteRepositoryPath(options.subPath)
    );
  }

  const data = await requestAllRemoteRepositoryJsonPages(
    'gitlab',
    url.toString(),
    token,
    options.signal
  );
  const entries = data
    .map(entry => mapGitLabTreeEntry(entry, options))
    .filter((entry): entry is RemoteRepositoryEntry => entry !== null);

  return scopeRemoteRepositoryEntries(entries, options.subPath, 'gitlab');
}

/**
 * Converts a raw GitLab tree node into a normalized repository entry
 * @param entry Raw tree node returned by the GitLab API
 * @param options Tree request options controlling metadata extraction
 * @returns Normalized entry, or null when the node is not a file or directory
 */
function mapGitLabTreeEntry(
  entry: unknown,
  options: RemoteRepositoryTreeOptions
): RemoteRepositoryEntry | null {
  if (!entry || typeof entry !== 'object' || !('path' in entry)) {
    return null;
  }

  const path = entry.path;
  const type = 'type' in entry ? entry.type : undefined;

  if (typeof path !== 'string') {
    return null;
  }

  if (type === 'tree') {
    return { kind: 'directory', path };
  }

  if (type !== 'blob') {
    return null;
  }

  const fileEntry: RemoteRepositoryEntry = { kind: 'file', path };

  if (
    options.readFileMeta &&
    'size' in entry &&
    typeof entry.size === 'number'
  ) {
    fileEntry.size = entry.size;
  }

  return fileEntry;
}
