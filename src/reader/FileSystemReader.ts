import type { ReaderAdapter } from '../adapters/IFileSystemAdapter';
import type { FileNode, ReadOptions } from './types';

/**
 * Date: 2026-06-07
 * Desc: Coordinates file tree reads through a pluggable adapter
 */

export class FileSystemReader {
  private adapter: ReaderAdapter;

  /**
   * Creates a reader around a pluggable adapter
   * @param adapter Adapter used for initial reads
   */
  constructor(adapter: ReaderAdapter) {
    this.adapter = adapter;
  }

  /**
   * Replaces the active reader adapter
   * @param adapter Adapter used for subsequent reads
   */
  setAdapter(adapter: ReaderAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Returns the active reader adapter
   * @returns Currently configured adapter
   */
  getAdapter(): ReaderAdapter {
    return this.adapter;
  }

  /**
   * Reads a file tree through the active adapter
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree produced by the adapter
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    return await this.adapter.read(options);
  }
}
