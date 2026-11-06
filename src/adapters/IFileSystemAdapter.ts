import type { FileNode, ReadOptions } from '../reader/types';

/**
 * Date: 2026-06-07
 * Desc: Defines the reader adapter contract used by the headless core
 */

export interface ReaderAdapter {
  /**
   * Reads a source into structural nodes with unique tree-relative paths
   * @param options Overrides for this call, interpreted by the adapter
   * @returns A tree whose nodes contain no source handles
   */
  read(options?: Partial<ReadOptions>): Promise<FileNode>;
}

export type IFileSystemAdapter = ReaderAdapter;
