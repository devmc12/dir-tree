import { RemoteRepositoryError } from './errors';
import { isPathSegmentsPrefix, splitRemoteRepositoryPath } from './path';
import type {
  ParsedRemoteRepositoryUrl,
  RemoteRepositoryBranchOption,
} from './types';

/**
 * Date: 2026-06-07
 * Desc: Parses remote repository URLs and branch path references
 */

/**
 * Parses a GitHub or GitLab repository URL into provider-specific parts
 * @param input Repository URL or shorthand entered by the user
 * @returns Parsed provider, repository identity, and ref path segments
 */
export function parseRemoteRepositoryUrl(
  input: string
): ParsedRemoteRepositoryUrl {
  const url = createRemoteRepositoryUrl(input);
  const host = url.hostname.toLowerCase();

  if (host === 'github.com') {
    return parseGitHubRepositoryUrl(url);
  }

  if (host === 'gitlab.com') {
    return parseGitLabRepositoryUrl(url);
  }

  throw new RemoteRepositoryError({
    code: 'invalid-url',
    message: 'Only github.com and gitlab.com repository URLs are supported',
  });
}

/**
 * Splits parsed ref path segments into a branch ref and a subpath
 * @param parsedUrl Parsed repository URL with ref path segments
 * @param branchOptions Known branches used to match multi-segment refs
 * @param fallbackRef Branch used when no branch prefix matches
 * @returns Resolved ref and the remaining subpath
 */
export function resolveRemoteRepositoryRefPath(
  parsedUrl: ParsedRemoteRepositoryUrl,
  branchOptions: RemoteRepositoryBranchOption[] = [],
  fallbackRef = ''
): { path: string; ref: string } {
  const refPathSegments = parsedUrl.refPathSegments;
  const fallbackBranch =
    branchOptions.find(branch => branch.default)?.name ??
    fallbackRef ??
    branchOptions[0]?.name ??
    '';

  if (refPathSegments.length === 0) {
    return {
      path: '',
      ref: fallbackBranch,
    };
  }

  const branchMatch = findLongestBranchPrefixMatch(
    refPathSegments,
    branchOptions.map(branch => branch.name)
  );

  if (branchMatch) {
    return {
      path: refPathSegments.slice(branchMatch.segmentCount).join('/'),
      ref: branchMatch.name,
    };
  }

  if (fallbackBranch) {
    const fallbackSegments = splitRemoteRepositoryPath(fallbackBranch);

    if (isPathSegmentsPrefix(fallbackSegments, refPathSegments)) {
      return {
        path: refPathSegments.slice(fallbackSegments.length).join('/'),
        ref: fallbackBranch,
      };
    }
  }

  return {
    path: refPathSegments.slice(1).join('/'),
    ref: refPathSegments[0] ?? fallbackBranch,
  };
}

/**
 * Normalizes user input into an HTTP or HTTPS URL
 * @param input Repository URL or shorthand entered by the user
 * @returns Parsed URL object
 */
function createRemoteRepositoryUrl(input: string): URL {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'Enter a GitHub or GitLab repository URL',
    });
  }

  const normalizedInput = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmedInput)
    ? trimmedInput
    : `https://${trimmedInput}`;

  try {
    const url = new URL(normalizedInput);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Unsupported protocol');
    }

    return url;
  } catch {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'Enter a valid GitHub or GitLab repository URL',
    });
  }
}

/**
 * Parses a github.com URL into owner, repo, and ref path segments
 * @param url Parsed github.com URL
 * @returns Parsed GitHub repository details
 */
function parseGitHubRepositoryUrl(url: URL): ParsedRemoteRepositoryUrl {
  const segments = getDecodedUrlPathSegments(url);
  const [owner, rawRepo, route, ...restSegments] = segments;

  if (!owner || !rawRepo) {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'GitHub repository URL must include owner and repository name',
      provider: 'github',
    });
  }

  if (route === 'blob') {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'GitHub file URLs are not importable',
      provider: 'github',
    });
  }

  if (route && route !== 'tree') {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'Use a GitHub repository URL or /tree/ref URL',
      provider: 'github',
    });
  }

  const repo = stripGitSuffix(rawRepo);

  return {
    provider: 'github',
    repositoryName: repo,
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    refPathSegments: route === 'tree' ? restSegments : [],
    owner,
    repo,
  };
}

/**
 * Parses a gitlab.com URL into project path and ref path segments
 * @param url Parsed gitlab.com URL
 * @returns Parsed GitLab repository details
 */
function parseGitLabRepositoryUrl(url: URL): ParsedRemoteRepositoryUrl {
  const segments = getDecodedUrlPathSegments(url);
  const treeMarkerIndex = segments.findIndex((segment, index) => {
    return segment === '-' && segments[index + 1] === 'tree';
  });
  const blobMarkerIndex = segments.findIndex((segment, index) => {
    return segment === '-' && segments[index + 1] === 'blob';
  });

  if (blobMarkerIndex !== -1) {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'GitLab file URLs are not importable',
      provider: 'gitlab',
    });
  }

  const projectSegments =
    treeMarkerIndex === -1 ? segments : segments.slice(0, treeMarkerIndex);
  const refPathSegments =
    treeMarkerIndex === -1 ? [] : segments.slice(treeMarkerIndex + 2);

  if (projectSegments.length < 2) {
    throw new RemoteRepositoryError({
      code: 'invalid-url',
      message: 'GitLab repository URL must include a group and project path',
      provider: 'gitlab',
    });
  }

  const sanitizedProjectSegments = projectSegments.map((segment, index) => {
    return index === projectSegments.length - 1
      ? stripGitSuffix(segment)
      : segment;
  });
  const projectPath = sanitizedProjectSegments.join('/');

  return {
    provider: 'gitlab',
    repositoryName: sanitizedProjectSegments.at(-1) ?? projectPath,
    repositoryUrl: `https://gitlab.com/${projectPath}`,
    refPathSegments,
    projectPath,
  };
}

/**
 * Splits and decodes URL path segments
 * @param url Parsed repository URL
 * @returns Decoded non-empty path segments
 */
function getDecodedUrlPathSegments(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));
}

/**
 * Removes a trailing .git suffix from a repository path segment
 * @param value Repository name or project segment
 * @returns Segment without a trailing .git suffix
 */
function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/iu, '');
}

/**
 * Finds the branch whose path segments form the longest ref prefix
 * @param refPathSegments Ref path segments parsed from the URL
 * @param branchNames Known branch names to test as prefixes
 * @returns Matching branch name and consumed segment count, or null when none match
 */
function findLongestBranchPrefixMatch(
  refPathSegments: string[],
  branchNames: string[]
): { name: string; segmentCount: number } | null {
  const sortedBranchNames = branchNames.slice().sort((leftName, rightName) => {
    return (
      splitRemoteRepositoryPath(rightName).length -
        splitRemoteRepositoryPath(leftName).length ||
      rightName.length - leftName.length
    );
  });

  for (const branchName of sortedBranchNames) {
    const branchSegments = splitRemoteRepositoryPath(branchName);

    if (isPathSegmentsPrefix(branchSegments, refPathSegments)) {
      return {
        name: branchName,
        segmentCount: branchSegments.length,
      };
    }
  }

  return null;
}
