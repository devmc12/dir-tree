import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import {
  attachFileTreeMetadata,
  createFileTreeFromSnapshot,
} from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Reads a prebuilt FileNode tree as a refreshable in-memory source
 */

export class InMemoryFileTreeAdapter extends BaseFileSystemAdapter {
  private readonly sourceTree: FileNode;

  /**
   * Creates an adapter around an existing FileNode snapshot
   * @param sourceTree Tree snapshot to clone on each read
   * @param options Initial read options
   */
  constructor(sourceTree: FileNode, options: ReadOptions = {}) {
    super(options);
    this.sourceTree = createFileTreeFromSnapshot(
      sourceTree,
      { readFileMeta: true },
      'default-on'
    );
  }

  /**
   * Reads the prebuilt source tree into a fresh FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree cloned from the in-memory snapshot
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    this.resetReadSession(options);

    const root = createFileTreeFromSnapshot(
      this.sourceTree,
      this.getOptions(),
      'default-off'
    );

    attachFileTreeMetadata(root);
    return root;
  }
}
