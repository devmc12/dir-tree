import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import { createRemoteRepositoryApiClient } from './remoteRepository/client';
import { mapRemoteRepositoryEntriesToFileTree } from './remoteRepository/map';
import { normalizeRemoteRepositoryPath } from './remoteRepository/path';
import {
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryRefPath,
} from './remoteRepository/parse';
import type { RemoteRepositoryAdapterOptions } from './remoteRepository/types';

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
   * @param options Overrides for this read; omitted fields use constructor defaults
   * @returns Directory tree rooted at the resolved repository subpath
   * @throws RemoteRepositoryError for provider failures; cancellation propagates unchanged
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    const context = this.createReadContext(options);

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
      readFileMeta: context.options.readFileMeta,
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
      readOptions: context.options,
      rootName,
      subPath,
    });
  }
}
