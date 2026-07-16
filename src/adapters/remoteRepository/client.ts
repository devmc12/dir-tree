import { RemoteRepositoryError } from './errors';
import { normalizeRemoteRepositoryPath } from './path';
import type {
  ParsedRemoteRepositoryUrl,
  RemoteRepositoryApiClient,
  RemoteRepositoryBranchOption,
  RemoteRepositoryEntry,
  RemoteRepositoryProvider,
  RemoteRepositoryTreeOptions,
} from './types';

/**
 * Date: 2026-06-07
 * Desc: Provides fetch-based GitHub and GitLab repository API clients
 */

interface RemoteRepositoryJsonPage<T> {
  data: T;
  response: Response;
}

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
 * Creates a fetch-based API client for the given repository provider
 * @param provider Repository provider the client should target
 * @param token Optional access token used for authenticated requests
 * @returns API client that reads branches and tree entries
 */
export function createRemoteRepositoryApiClient(
  provider: RemoteRepositoryProvider,
  token?: string
): RemoteRepositoryApiClient {
  return createFetchRemoteRepositoryApiClient(provider, token);
}

/**
 * Creates the provider-specific fetch client implementation
 * @param provider Repository provider the client should target
 * @param token Optional access token used for authenticated requests
 * @returns API client backed by fetch
 */
function createFetchRemoteRepositoryApiClient(
  provider: RemoteRepositoryProvider,
  token?: string
): RemoteRepositoryApiClient {
  return {
    /**
     * Reads the repository default branch from provider metadata
     * @param parsedUrl Parsed repository URL
     * @param signal Optional abort signal
     * @returns Default branch name
     */
    async getDefaultBranch(parsedUrl, signal) {
      const url = createRemoteRepositoryInfoUrl(provider, parsedUrl);
      const data = await requestRemoteRepositoryJson<Record<string, unknown>>(
        provider,
        url,
        token,
        signal
      );
      const defaultBranch = data.default_branch;

      if (typeof defaultBranch !== 'string') {
        throw new RemoteRepositoryError({
          code: 'unknown',
          message: 'Repository response did not include a default branch',
          provider,
        });
      }

      return defaultBranch;
    },
    /**
     * Lists repository branches from the provider API
     * @param parsedUrl Parsed repository URL
     * @param signal Optional abort signal
     * @returns Branch options reported by the provider
     */
    async listBranches(parsedUrl, signal) {
      const url = createRemoteRepositoryBranchesUrl(provider, parsedUrl);
      const data = await requestAllRemoteRepositoryJsonPages(
        provider,
        url,
        token,
        signal
      );

      return mapRemoteRepositoryBranches(data);
    },
    /**
     * Lists repository tree entries for a ref
     * @param parsedUrl Parsed repository URL
     * @param ref Branch, tag, or commit reference to read
     * @param options Tree request options
     * @returns Repository entries for the requested ref
     */
    async listTreeEntries(parsedUrl, ref, options) {
      if (provider === 'github') {
        return await listGitHubTreeEntries(parsedUrl, ref, token, options);
      }

      return await listGitLabTreeEntries(parsedUrl, ref, token, options);
    },
  };
}

/**
 * Builds the provider API URL for repository metadata
 * @param provider Repository provider
 * @param parsedUrl Parsed repository URL
 * @returns Provider API URL for repository metadata
 */
function createRemoteRepositoryInfoUrl(
  provider: RemoteRepositoryProvider,
  parsedUrl: ParsedRemoteRepositoryUrl
): string {
  return provider === 'github'
    ? `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(parsedUrl.projectPath ?? '')}`;
}

/**
 * Builds the provider API URL for repository branches
 * @param provider Repository provider
 * @param parsedUrl Parsed repository URL
 * @returns Provider API URL for branch listing
 */
function createRemoteRepositoryBranchesUrl(
  provider: RemoteRepositoryProvider,
  parsedUrl: ParsedRemoteRepositoryUrl
): string {
  return provider === 'github'
    ? `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}/branches?per_page=100`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(parsedUrl.projectPath ?? '')}/repository/branches?per_page=100`;
}

/**
 * Converts provider branch JSON into branch options
 * @param data Raw branch array returned by the provider
 * @returns Normalized branch options with invalid entries removed
 */
function mapRemoteRepositoryBranches(
  data: unknown[]
): RemoteRepositoryBranchOption[] {
  const branches: RemoteRepositoryBranchOption[] = [];

  data.forEach(branch => {
    if (!branch || typeof branch !== 'object' || !('name' in branch)) {
      return;
    }

    const name = branch.name;

    if (typeof name !== 'string') {
      return;
    }

    const option: RemoteRepositoryBranchOption = { name };

    if ('default' in branch && branch.default === true) {
      option.default = true;
    }

    branches.push(option);
  });

  return branches;
}

/**
 * Lists recursive tree entries from the GitHub git trees API
 * @param parsedUrl Parsed GitHub repository URL
 * @param ref Branch, tag, or commit reference to read
 * @param token Optional access token used for authenticated requests
 * @param options Tree request options including subpath and metadata flags
 * @returns Repository entries optionally limited to the requested subpath
 */
async function listGitHubTreeEntries(
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

/**
 * Lists recursive tree entries from the GitLab repository tree API
 * @param parsedUrl Parsed GitLab repository URL
 * @param ref Branch, tag, or commit reference to read
 * @param token Optional access token used for authenticated requests
 * @param options Tree request options including subpath and metadata flags
 * @returns Repository entries optionally limited to the requested subpath
 */
async function listGitLabTreeEntries(
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

/**
 * Requests a JSON resource and throws a typed error on failed responses
 * @param provider Repository provider used for error context
 * @param url Fully qualified request URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Parsed JSON response body
 */
async function requestRemoteRepositoryJson<T>(
  provider: RemoteRepositoryProvider,
  url: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<T> {
  const page = await requestRemoteRepositoryJsonPage<T>(
    provider,
    url,
    token,
    signal
  );

  return page.data;
}

/**
 * Requests every page from a paginated repository API collection
 * @param provider Repository provider used for headers and errors
 * @param initialUrl First collection page URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Concatenated collection items from every page
 */
async function requestAllRemoteRepositoryJsonPages(
  provider: RemoteRepositoryProvider,
  initialUrl: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<unknown[]> {
  const initialOrigin = new URL(initialUrl).origin;
  const visitedUrls = new Set<string>();
  const items: unknown[] = [];
  let nextUrl: string | null = initialUrl;

  while (nextUrl) {
    const currentUrl = new URL(nextUrl).toString();

    if (visitedUrls.has(currentUrl)) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'Repository API pagination returned a repeated page URL',
        provider,
      });
    }

    visitedUrls.add(currentUrl);

    const page = await requestRemoteRepositoryJsonPage<unknown[]>(
      provider,
      currentUrl,
      token,
      signal
    );

    if (!Array.isArray(page.data)) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'Repository API collection response was not an array',
        provider,
      });
    }

    items.push(...page.data);
    nextUrl = resolveRemoteRepositoryNextPageUrl(
      provider,
      currentUrl,
      initialOrigin,
      page.response
    );
  }

  return items;
}

/**
 * Requests one JSON page and preserves response headers for pagination
 * @param provider Repository provider used for headers and errors
 * @param url Fully qualified request URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Parsed JSON body and original response
 */
async function requestRemoteRepositoryJsonPage<T>(
  provider: RemoteRepositoryProvider,
  url: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<RemoteRepositoryJsonPage<T>> {
  throwIfRemoteRepositoryRequestAborted(signal);

  const requestInit: RequestInit = {
    headers: createRemoteRepositoryHeaders(provider, token),
  };

  if (signal) {
    requestInit.signal = signal;
  }

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    throw await createRemoteRepositoryResponseError(provider, response);
  }

  return {
    data: (await response.json()) as T,
    response,
  };
}

/**
 * Resolves the provider URL for the next collection page
 * @param provider Repository provider used for fallback headers and errors
 * @param currentUrl Current page URL
 * @param initialOrigin Origin that every page must preserve
 * @param response Current page response with pagination headers
 * @returns Validated next page URL, or null at the end of the collection
 */
function resolveRemoteRepositoryNextPageUrl(
  provider: RemoteRepositoryProvider,
  currentUrl: string,
  initialOrigin: string,
  response: Response
): string | null {
  const linkUrl = readRemoteRepositoryNextLink(response.headers.get('link'));
  let candidateUrl = linkUrl;

  if (!candidateUrl && provider === 'gitlab') {
    const nextPage = response.headers.get('x-next-page')?.trim();

    if (nextPage) {
      const url = new URL(currentUrl);

      url.searchParams.set('page', nextPage);
      candidateUrl = url.toString();
    }
  }

  if (!candidateUrl) {
    return null;
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(candidateUrl, currentUrl);
  } catch {
    throw new RemoteRepositoryError({
      code: 'unknown',
      message: 'Repository API pagination returned an invalid next page URL',
      provider,
    });
  }

  if (nextUrl.origin !== initialOrigin) {
    throw new RemoteRepositoryError({
      code: 'unknown',
      message: 'Repository API pagination changed request origin',
      provider,
    });
  }

  return nextUrl.toString();
}

/**
 * Extracts the next relation from an HTTP Link header
 * @param linkHeader Raw Link response header
 * @returns Next page URL, or null when no next relation exists
 */
function readRemoteRepositoryNextLink(
  linkHeader: string | null
): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const linkPart of linkHeader.split(',')) {
    const urlMatch = /<([^>]+)>/u.exec(linkPart);
    const relationMatch = /;\s*rel\s*=\s*"?([^";]+)"?/iu.exec(linkPart);
    const relations =
      relationMatch?.[1]
        ?.trim()
        .split(/\s+/u)
        .map(relation => relation.toLowerCase()) ?? [];

    if (urlMatch?.[1] && relations.includes('next')) {
      return urlMatch[1];
    }
  }

  return null;
}

/**
 * Throws the original abort reason before starting another API request
 * @param signal Optional abort signal shared by the repository read
 */
function throwIfRemoteRepositoryRequestAborted(
  signal: AbortSignal | undefined
): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason !== undefined) {
    throw signal.reason;
  }

  throw new DOMException('The operation was aborted', 'AbortError');
}

/**
 * Builds a typed error describing a failed repository API response
 * @param provider Repository provider used for error context
 * @param response Failed fetch response to inspect
 * @returns Error classified as auth, rate-limit, not-found, or unknown
 */
async function createRemoteRepositoryResponseError(
  provider: RemoteRepositoryProvider,
  response: Response
): Promise<RemoteRepositoryError> {
  const apiMessage = await readRemoteRepositoryErrorMessage(response);
  const rateLimitRemaining =
    response.headers.get('x-ratelimit-remaining') ??
    response.headers.get('ratelimit-remaining');
  const rateLimitReset = Number.parseInt(
    response.headers.get('x-ratelimit-reset') ??
      response.headers.get('ratelimit-reset') ??
      '',
    10
  );
  const isRateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (rateLimitRemaining === '0' ||
        isRemoteRepositoryRateLimitMessage(apiMessage)));

  if (isRateLimited) {
    return new RemoteRepositoryError({
      code: 'rate-limit',
      message: apiMessage || 'Repository API rate limit reached.',
      provider,
      rateLimitRemaining,
      ...(Number.isFinite(rateLimitReset) ? { rateLimitReset } : {}),
      status: response.status,
    });
  }

  if (response.status === 401 || response.status === 403) {
    return new RemoteRepositoryError({
      code: 'auth',
      message: apiMessage || 'Repository access was denied.',
      provider,
      rateLimitRemaining,
      status: response.status,
    });
  }

  if (response.status === 404) {
    return new RemoteRepositoryError({
      code: 'not-found',
      message: apiMessage || 'Repository, ref, or path was not found.',
      provider,
      status: response.status,
    });
  }

  return new RemoteRepositoryError({
    code: 'unknown',
    message:
      apiMessage ||
      `Repository API request failed: ${response.status} ${response.statusText}`,
    provider,
    status: response.status,
  });
}

/**
 * Checks whether an API error message describes rate limiting
 * @param message Provider error message
 * @returns True when the message indicates rate limiting
 */
function isRemoteRepositoryRateLimitMessage(message: string): boolean {
  return /rate limit|too many requests/iu.test(message);
}

/**
 * Attempts to read a provider error message from a failed response
 * @param response Failed fetch response
 * @returns Provider message or an empty string
 */
async function readRemoteRepositoryErrorMessage(
  response: Response
): Promise<string> {
  try {
    const body = (await response.json()) as unknown;

    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    return '';
  }

  return '';
}

/**
 * Creates provider-specific request headers
 * @param provider Repository provider
 * @param token Optional access token
 * @returns Headers accepted by the provider API
 */
function createRemoteRepositoryHeaders(
  provider: RemoteRepositoryProvider,
  token?: string
): HeadersInit {
  const headers = new Headers();

  if (provider === 'github') {
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  headers.set('Accept', 'application/json');

  if (token) {
    headers.set('PRIVATE-TOKEN', token);
  }

  return headers;
}

/**
 * Joins a repository path prefix and relative child path
 * @param pathPrefix Optional repository path prefix
 * @param childPath Relative repository child path
 * @returns Normalized joined repository path
 */
function joinRemoteRepositoryPath(
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
function scopeRemoteRepositoryEntries(
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
function createRemoteRepositorySubPathError(
  provider: RemoteRepositoryProvider
): RemoteRepositoryError {
  return new RemoteRepositoryError({
    code: 'not-found',
    message: 'Repository path was not found or is not a directory',
    provider,
  });
}
