import type {
  RemoteRepositoryProvider,
  RemoteRepositoryApiClient,
  ParsedRemoteRepositoryUrl,
  RemoteRepositoryBranchOption,
} from './types';
import {
  requestRemoteRepositoryJson,
  requestAllRemoteRepositoryJsonPages,
} from './http';
import { RemoteRepositoryError } from './errors';
import { listGitHubTreeEntries } from './github';
import { listGitLabTreeEntries } from './gitlab';

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
