import { createRemoteRepositoryApiClient } from './client';
import {
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryRefPath,
} from './parse';
import type {
  RemoteRepositoryBranchOption,
  RemoteRepositoryBranchResolutionOptions,
  RemoteRepositoryBranchResolutionResult,
} from './types';

/**
 * Date: 2026-06-14
 * Desc: Resolves remote repository default branch, branch list, ref, and path
 */

/**
 * Reads the default branch and branch list for a repository URL, then resolves
 * the ref and subpath encoded in the URL
 * @param options Repository URL with optional abort signal and access token
 * @returns Resolved branches, default branch, parsed URL, ref, and path
 */
export async function resolveRemoteRepositoryBranches({
  input,
  signal,
  token,
}: RemoteRepositoryBranchResolutionOptions): Promise<RemoteRepositoryBranchResolutionResult> {
  const parsedUrl = parseRemoteRepositoryUrl(input);
  const apiClient = createRemoteRepositoryApiClient(parsedUrl.provider, token);
  const [defaultBranch, branches] = await Promise.all([
    apiClient.getDefaultBranch(parsedUrl, signal),
    apiClient.listBranches(parsedUrl, signal),
  ]);
  const normalizedBranches = normalizeRemoteRepositoryBranches(
    branches,
    defaultBranch
  );
  const resolvedReference = resolveRemoteRepositoryRefPath(
    parsedUrl,
    normalizedBranches,
    defaultBranch
  );

  return {
    branches: normalizedBranches,
    defaultBranch,
    parsedUrl,
    path: resolvedReference.path,
    ref: resolvedReference.ref,
  };
}

/**
 * Deduplicates branches, flags the default branch, and sorts it to the front
 * @param branches Branch list returned by the provider API
 * @param defaultBranch Default branch name reported by the provider
 * @returns Normalized branch list with the default branch first
 */
function normalizeRemoteRepositoryBranches(
  branches: RemoteRepositoryBranchOption[],
  defaultBranch: string
): RemoteRepositoryBranchOption[] {
  const branchMap = new Map<string, RemoteRepositoryBranchOption>();

  branches.forEach(branch => {
    if (!branch.name) {
      return;
    }

    branchMap.set(branch.name, {
      name: branch.name,
      default: branch.name === defaultBranch || branch.default === true,
    });
  });

  if (defaultBranch && !branchMap.has(defaultBranch)) {
    branchMap.set(defaultBranch, {
      name: defaultBranch,
      default: true,
    });
  }

  return Array.from(branchMap.values()).sort((leftBranch, rightBranch) => {
    if (leftBranch.name === defaultBranch) {
      return -1;
    }

    if (rightBranch.name === defaultBranch) {
      return 1;
    }

    return leftBranch.name.localeCompare(rightBranch.name);
  });
}
