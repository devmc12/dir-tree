import type {
  RemoteRepositoryEntry,
  RemoteRepositoryTreeOptions,
  ParsedRemoteRepositoryUrl,
} from './types';
import { normalizeRemoteRepositoryPath } from './path';
import {
  scopeRemoteRepositoryEntries,
  joinRemoteRepositoryPath,
  createRemoteRepositorySubPathError,
} from './scope';
import { RemoteRepositoryError } from './errors';
import { requestRemoteRepositoryJson } from './http';

/**
 * Date: 2026-11-07
 * Desc: Reads GitHub trees including truncated subtree recovery
 */

interface GitHubTreeResponse {
  tree: unknown[];
  truncated: boolean;
}

type GitHubTreeItemType = 'blob' | 'commit' | 'tree';

interface GitHubTreeItem {
  entry: RemoteRepositoryEntry;
  sha?: string;
  type: GitHubTreeItemType;
}

interface GitHubTreeReadContext {
  cache: Map<string, Promise<GitHubTreeResponse>>;
  options: RemoteRepositoryTreeOptions;
  parsedUrl: ParsedRemoteRepositoryUrl;
  token: string | undefined;
}

/**
 * Lists recursive tree entries from the GitHub git trees API
 * @param parsedUrl Parsed GitHub repository URL
 * @param ref Branch, tag, or commit reference to read
 * @param token Optional access token used for authenticated requests
 * @param options Tree request options including subpath and metadata flags
 * @returns Repository entries optionally limited to the requested subpath
 */
export async function listGitHubTreeEntries(
  parsedUrl: ParsedRemoteRepositoryUrl,
  ref: string,
  token: string | undefined,
  options: RemoteRepositoryTreeOptions = {}
): Promise<RemoteRepositoryEntry[]> {
  const context: GitHubTreeReadContext = {
    cache: new Map(),
    options,
    parsedUrl,
    token,
  };
  const normalizedSubPath = normalizeRemoteRepositoryPath(
    options.subPath ?? ''
  );
  const rootResponse = await requestGitHubTree(context, ref, true);
  const entries =
    rootResponse.truncated && normalizedSubPath
      ? await readGitHubSubPathTree(context, ref, normalizedSubPath)
      : await readCompleteGitHubTree(context, ref, '');

  return scopeRemoteRepositoryEntries(entries, normalizedSubPath, 'github');
}

/**
 * Reads a GitHub tree recursively and splits truncated responses into subtrees
 * @param context GitHub request context with response cache
 * @param treeish Branch, tag, commit, or tree SHA to read
 * @param pathPrefix Repository path prefix applied to returned relative paths
 * @returns Complete normalized entries below the requested tree
 */
async function readCompleteGitHubTree(
  context: GitHubTreeReadContext,
  treeish: string,
  pathPrefix: string
): Promise<RemoteRepositoryEntry[]> {
  const recursiveResponse = await requestGitHubTree(context, treeish, true);

  if (!recursiveResponse.truncated) {
    return mapGitHubTreeItems(
      recursiveResponse.tree,
      context.options,
      pathPrefix
    ).map(item => item.entry);
  }

  const shallowResponse = await requestGitHubTree(context, treeish, false);

  assertGitHubShallowTreeIsComplete(shallowResponse);

  const entries: RemoteRepositoryEntry[] = [];
  const items = mapGitHubTreeItems(
    shallowResponse.tree,
    context.options,
    pathPrefix
  );

  for (const item of items) {
    entries.push(item.entry);

    if (item.type !== 'tree') {
      continue;
    }

    if (!item.sha) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'GitHub tree response did not include a subtree SHA',
        provider: 'github',
      });
    }

    entries.push(
      ...(await readCompleteGitHubTree(context, item.sha, item.entry.path))
    );
  }

  return entries;
}

/**
 * Locates a GitHub repository subpath before expanding only that subtree
 * @param context GitHub request context with response cache
 * @param rootTreeish Root branch, tag, or commit reference
 * @param subPath Normalized directory path to locate
 * @returns Complete entries for the requested directory only
 */
async function readGitHubSubPathTree(
  context: GitHubTreeReadContext,
  rootTreeish: string,
  subPath: string
): Promise<RemoteRepositoryEntry[]> {
  const segments = subPath.split('/').filter(Boolean);
  let currentTreeish = rootTreeish;
  let currentPath = '';

  for (const [index, segment] of segments.entries()) {
    const shallowResponse = await requestGitHubTree(
      context,
      currentTreeish,
      false
    );

    assertGitHubShallowTreeIsComplete(shallowResponse);

    const nextPath = joinRemoteRepositoryPath(currentPath, segment);
    const item = mapGitHubTreeItems(
      shallowResponse.tree,
      context.options,
      currentPath
    ).find(candidate => candidate.entry.path === nextPath);

    if (!item || item.type === 'blob') {
      throw createRemoteRepositorySubPathError('github');
    }

    const isLastSegment = index === segments.length - 1;

    if (item.type === 'commit') {
      if (isLastSegment) {
        return [item.entry];
      }

      throw createRemoteRepositorySubPathError('github');
    }

    if (!item.sha) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'GitHub tree response did not include a subtree SHA',
        provider: 'github',
      });
    }

    if (isLastSegment) {
      return [
        item.entry,
        ...(await readCompleteGitHubTree(context, item.sha, nextPath)),
      ];
    }

    currentTreeish = item.sha;
    currentPath = nextPath;
  }

  throw createRemoteRepositorySubPathError('github');
}

/**
 * Requests and caches a GitHub tree response
 * @param context GitHub request context with response cache
 * @param treeish Branch, tag, commit, or tree SHA to read
 * @param recursive Whether GitHub should return recursive descendants
 * @returns Validated GitHub tree response
 */
function requestGitHubTree(
  context: GitHubTreeReadContext,
  treeish: string,
  recursive: boolean
): Promise<GitHubTreeResponse> {
  const cacheKey = `${recursive ? 'recursive' : 'shallow'}:${treeish}`;
  const cachedResponse = context.cache.get(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  const responsePromise = requestGitHubTreeUncached(
    context,
    treeish,
    recursive
  );

  context.cache.set(cacheKey, responsePromise);
  return responsePromise;
}

/**
 * Requests a GitHub tree response from the provider API
 * @param context GitHub request context
 * @param treeish Branch, tag, commit, or tree SHA to read
 * @param recursive Whether GitHub should return recursive descendants
 * @returns Validated GitHub tree response
 */
async function requestGitHubTreeUncached(
  context: GitHubTreeReadContext,
  treeish: string,
  recursive: boolean
): Promise<GitHubTreeResponse> {
  const url = new URL(
    `https://api.github.com/repos/${context.parsedUrl.owner}/${context.parsedUrl.repo}/git/trees/${encodeURIComponent(treeish)}`
  );

  if (recursive) {
    url.searchParams.set('recursive', '1');
  }

  const data = await requestRemoteRepositoryJson<Record<string, unknown>>(
    'github',
    url.toString(),
    context.token,
    context.options.signal
  );

  if (!Array.isArray(data.tree)) {
    throw new RemoteRepositoryError({
      code: 'unknown',
      message: 'GitHub tree response did not include a tree array',
      provider: 'github',
    });
  }

  return {
    tree: data.tree,
    truncated: data.truncated === true,
  };
}

/**
 * Maps raw GitHub tree nodes with a repository path prefix
 * @param tree Raw GitHub tree array
 * @param options Tree request options controlling metadata extraction
 * @param pathPrefix Repository path prefix applied to relative API paths
 * @returns Valid file, directory, and submodule items
 */
function mapGitHubTreeItems(
  tree: unknown[],
  options: RemoteRepositoryTreeOptions,
  pathPrefix: string
): GitHubTreeItem[] {
  return tree
    .map(entry => mapGitHubTreeItem(entry, options, pathPrefix))
    .filter((item): item is GitHubTreeItem => item !== null);
}

/**
 * Converts a raw GitHub tree node into a normalized repository item
 * @param rawEntry Raw tree node returned by the GitHub API
 * @param options Tree request options controlling metadata extraction
 * @param pathPrefix Repository path prefix applied to the raw path
 * @returns Normalized item, or null when the node type is unsupported
 */
function mapGitHubTreeItem(
  rawEntry: unknown,
  options: RemoteRepositoryTreeOptions,
  pathPrefix: string
): GitHubTreeItem | null {
  if (!rawEntry || typeof rawEntry !== 'object' || !('path' in rawEntry)) {
    return null;
  }

  const rawPath = rawEntry.path;
  const type = 'type' in rawEntry ? rawEntry.type : undefined;

  if (
    typeof rawPath !== 'string' ||
    (type !== 'blob' && type !== 'commit' && type !== 'tree')
  ) {
    return null;
  }

  const path = joinRemoteRepositoryPath(pathPrefix, rawPath);

  if (type === 'tree' || type === 'commit') {
    const item: GitHubTreeItem = {
      entry: { kind: 'directory', path },
      type,
    };

    if ('sha' in rawEntry && typeof rawEntry.sha === 'string') {
      item.sha = rawEntry.sha;
    }

    return item;
  }

  const fileEntry: RemoteRepositoryEntry = { kind: 'file', path };

  if (
    options.readFileMeta &&
    'size' in rawEntry &&
    typeof rawEntry.size === 'number'
  ) {
    fileEntry.size = rawEntry.size;
  }

  return { entry: fileEntry, type };
}

/**
 * Rejects a shallow GitHub tree response that cannot guarantee completeness
 * @param response Non-recursive GitHub tree response
 */
function assertGitHubShallowTreeIsComplete(response: GitHubTreeResponse): void {
  if (!response.truncated) {
    return;
  }

  throw new RemoteRepositoryError({
    code: 'too-large',
    message: 'GitHub could not return a complete non-recursive tree',
    provider: 'github',
  });
}
