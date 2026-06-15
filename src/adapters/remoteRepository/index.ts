/**
 * Date: 2026-06-07
 * Desc: Exposes remote repository adapter helpers
 */

export { resolveRemoteRepositoryBranches } from './branches';
export { createRemoteRepositoryApiClient } from './client';
export { RemoteRepositoryError } from './errors';
export {
  isPathSegmentsPrefix,
  normalizeRemoteRepositoryPath,
  splitRemoteRepositoryPath,
} from './path';
export {
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryRefPath,
} from './parse';
export { mapRemoteRepositoryEntriesToFileTree } from './map';
export type {
  ParsedRemoteRepositoryUrl,
  RemoteRepositoryAdapterOptions,
  RemoteRepositoryApiClient,
  RemoteRepositoryBranchOption,
  RemoteRepositoryBranchResolutionOptions,
  RemoteRepositoryBranchResolutionResult,
  RemoteRepositoryEntry,
  RemoteRepositoryErrorCode,
  RemoteRepositoryMapEntriesOptions,
  RemoteRepositoryProvider,
  RemoteRepositoryTreeOptions,
} from './types';
