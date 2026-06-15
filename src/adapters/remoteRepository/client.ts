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
      const data = await requestRemoteRepositoryJson<unknown[]>(
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
  const url = new URL(
    `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}/git/trees/${encodeURIComponent(ref)}`
  );

  url.searchParams.set('recursive', '1');

  const data = await requestRemoteRepositoryJson<Record<string, unknown>>(
    'github',
    url.toString(),
    token,
    options.signal
  );
  const tree = Array.isArray(data.tree) ? data.tree : [];
  const entries = tree
    .map(entry => mapGitHubTreeEntry(entry, options))
    .filter((entry): entry is RemoteRepositoryEntry => entry !== null);

  assertRemoteRepositorySubPathExists(entries, options.subPath);
  return entries;
}

/**
 * Converts a raw GitHub tree node into a normalized repository entry
 * @param entry Raw tree node returned by the GitHub API
 * @param options Tree request options controlling metadata extraction
 * @returns Normalized entry, or null when the node is not a file or directory
 */
function mapGitHubTreeEntry(
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

  if (type === 'tree' || type === 'commit') {
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
  url.searchParams.set('per_page', '100');

  if (options.subPath) {
    url.searchParams.set(
      'path',
      normalizeRemoteRepositoryPath(options.subPath)
    );
  }

  const data = await requestRemoteRepositoryJson<unknown[]>(
    'gitlab',
    url.toString(),
    token,
    options.signal
  );
  const entries = data
    .map(entry => mapGitLabTreeEntry(entry, options))
    .filter((entry): entry is RemoteRepositoryEntry => entry !== null);

  assertRemoteRepositorySubPathExists(entries, options.subPath);
  return entries;
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

  return (await response.json()) as T;
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
 * Throws a not-found error when no entry matches the requested subpath
 * @param entries Repository entries returned by the provider
 * @param subPath Optional subpath that must exist within the entries
 */
function assertRemoteRepositorySubPathExists(
  entries: RemoteRepositoryEntry[],
  subPath?: string
): void {
  const normalizedSubPath = normalizeRemoteRepositoryPath(subPath ?? '');

  if (!normalizedSubPath) {
    return;
  }

  const hasSubPath = entries.some(entry => {
    return (
      entry.path === normalizedSubPath ||
      entry.path.startsWith(`${normalizedSubPath}/`)
    );
  });

  if (!hasSubPath) {
    throw new RemoteRepositoryError({
      code: 'not-found',
      message: 'Repository path was not found or is not a directory',
    });
  }
}
