import type { ReadOptions } from '../../reader/types';

/**
 * Date: 2026-06-07
 * Desc: Defines remote repository adapter shared types
 */

export type RemoteRepositoryProvider = 'github' | 'gitlab';

export type RemoteRepositoryErrorCode =
  | 'auth'
  | 'invalid-url'
  | 'network'
  | 'not-found'
  | 'rate-limit'
  | 'too-large'
  | 'unknown';

export interface ParsedRemoteRepositoryUrl {
  provider: RemoteRepositoryProvider;
  repositoryName: string;
  repositoryUrl: string;
  refPathSegments: string[];
  owner?: string;
  repo?: string;
  projectPath?: string;
}

export interface RemoteRepositoryAdapterOptions {
  apiClient?: RemoteRepositoryApiClient;
  branchOptions?: RemoteRepositoryBranchOption[];
  defaultBranch?: string;
  path?: string;
  ref?: string;
  repositoryUrl: string;
  signal?: AbortSignal;
  token?: string;
}

export interface RemoteRepositoryBranchOption {
  default?: boolean;
  name: string;
}

export interface RemoteRepositoryBranchResolutionOptions {
  input: string;
  signal?: AbortSignal;
  token?: string;
}

export interface RemoteRepositoryBranchResolutionResult {
  branches: RemoteRepositoryBranchOption[];
  defaultBranch: string;
  parsedUrl: ParsedRemoteRepositoryUrl;
  path: string;
  ref: string;
}

export interface RemoteRepositoryEntry {
  kind: 'directory' | 'file';
  path: string;
  size?: number;
}

export interface RemoteRepositoryMapEntriesOptions {
  entries: RemoteRepositoryEntry[];
  readOptions?: ReadOptions;
  rootName: string;
  subPath?: string;
}

export interface RemoteRepositoryTreeOptions {
  readFileMeta?: boolean;
  signal?: AbortSignal;
  subPath?: string;
}

export interface RemoteRepositoryApiClient {
  getDefaultBranch: (
    parsedUrl: ParsedRemoteRepositoryUrl,
    signal?: AbortSignal
  ) => Promise<string>;
  listBranches: (
    parsedUrl: ParsedRemoteRepositoryUrl,
    signal?: AbortSignal
  ) => Promise<RemoteRepositoryBranchOption[]>;
  listTreeEntries: (
    parsedUrl: ParsedRemoteRepositoryUrl,
    ref: string,
    options?: RemoteRepositoryTreeOptions
  ) => Promise<RemoteRepositoryEntry[]>;
}
