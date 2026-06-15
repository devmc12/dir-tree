import type { FileNode, ReadOptions } from '../reader/types';

/**
 * Date: 2026-06-07
 * Desc: Defines the reader adapter contract used by the headless core
 */

export interface ReaderAdapter {
  read(options?: Partial<ReadOptions>): Promise<FileNode>;
}

export type IFileSystemAdapter = ReaderAdapter;
