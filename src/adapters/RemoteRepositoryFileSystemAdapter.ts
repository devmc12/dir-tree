import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import {
  createRemoteRepositoryApiClient,
  mapRemoteRepositoryEntriesToFileTree,
  normalizeRemoteRepositoryPath,
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryRefPath,
  type RemoteRepositoryAdapterOptions,
} from './remoteRepository';

/**
 * Date: 2026-06-07
 * Desc: Reads GitHub or GitLab repository trees through provider APIs
 */

export class RemoteRepositoryFileSystemAdapter extends BaseFileSystemAdapter {
  private readonly adapterOptions: RemoteRepositoryAdapterOptions;

  /**
   * Creates an adapter for a remote GitHub or GitLab repository tree
   * @param adapterOptions Repository URL, ref, path, token, and optional API client
   * @param options Initial read options
   */
  constructor(
    adapterOptions: RemoteRepositoryAdapterOptions,
    options: ReadOptions = {}
  ) {
    super(options);
    this.adapterOptions = adapterOptions;
  }

  /**
   * Reads the remote repository tree through the provider API
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree rooted at the resolved repository subpath
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    this.resetReadSession(options);

    const parsedUrl = parseRemoteRepositoryUrl(
      this.adapterOptions.repositoryUrl
    );
    const apiClient =
      this.adapterOptions.apiClient ??
      createRemoteRepositoryApiClient(
        parsedUrl.provider,
        this.adapterOptions.token
      );
    const resolvedReference = this.adapterOptions.ref
      ? {
          path: normalizeRemoteRepositoryPath(this.adapterOptions.path ?? ''),
          ref: this.adapterOptions.ref,
        }
      : resolveRemoteRepositoryRefPath(
          parsedUrl,
          this.adapterOptions.branchOptions ?? [],
          this.adapterOptions.defaultBranch ?? ''
        );
    const ref =
      resolvedReference.ref ||
      this.adapterOptions.defaultBranch ||
      (await apiClient.getDefaultBranch(parsedUrl, this.adapterOptions.signal));
    const subPath = normalizeRemoteRepositoryPath(resolvedReference.path);
    const treeOptions: {
      readFileMeta?: boolean;
      signal?: AbortSignal;
      subPath?: string;
    } = {
      readFileMeta: this.readFileMeta,
      subPath,
    };

    if (this.adapterOptions.signal) {
      treeOptions.signal = this.adapterOptions.signal;
    }

    const entries = await apiClient.listTreeEntries(
      parsedUrl,
      ref,
      treeOptions
    );
    const rootName =
      subPath.split('/').filter(Boolean).at(-1) ?? parsedUrl.repositoryName;

    return mapRemoteRepositoryEntriesToFileTree({
      entries,
      readOptions: this.getOptions(),
      rootName,
      subPath,
    });
  }
}
