import { unzip } from 'fflate';
import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions, ZipEntry } from '../reader/types';
import {
  attachFileTreeMetadata,
  getParentPath,
  parseCentralDirectory,
  pruneAndSortTree,
} from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Reads ZIP archives into FileNode trees
 */

export type ZipSource = Blob | ArrayBuffer | Uint8Array;

export class ZipFileSystemAdapter extends BaseFileSystemAdapter {
  private readonly zipName: string;
  private readonly zipSource: ZipSource;

  /**
   * Creates an adapter for a ZIP archive source
   * @param source ZIP bytes or browser Blob
   * @param options Initial read options
   * @param name Optional root name for the archive tree
   */
  constructor(source: ZipSource, options: ReadOptions = {}, name?: string) {
    super(options);
    this.zipSource = source;
    this.zipName = name ?? this.extractZipName(source);
  }

  /**
   * Reads the ZIP archive into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree rooted at the archive name
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    this.resetReadSession(options);

    const bytes = await this.readZipBytes();
    const centralDirectoryEntries = parseCentralDirectory(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );

    if (!centralDirectoryEntries) {
      throw new Error('Could not parse the ZIP file structure');
    }

    const zipData = await this.unzipEntries(bytes);
    const root: FileNode = {
      name: this.zipName,
      path: this.zipName,
      kind: 'directory',
      children: [],
      handle: {
        source: 'zip-directory',
        entries: zipData,
      },
    };

    if (this.useGitignore) {
      this.loadGitignoreFromZip(zipData, centralDirectoryEntries);
    }

    const nodeMap = new Map<string, FileNode>();

    nodeMap.set(root.path, root);

    centralDirectoryEntries.forEach(entry => {
      const relativePath = entry.name.replace(/\/$/u, '');

      if (!relativePath) {
        return;
      }

      const fullPath = `${root.path}/${relativePath}`;

      if (this.isHiddenOrExcluded(fullPath)) {
        return;
      }

      if (entry.isDir) {
        this.getOrCreateDirectory(fullPath, nodeMap, root);
        return;
      }

      const parentPath = getParentPath(fullPath);
      const parentNode = this.getOrCreateDirectory(parentPath, nodeMap, root);
      const fileNode: FileNode = {
        name: fullPath.substring(parentPath.length + 1),
        path: fullPath,
        kind: 'file',
        handle: {
          source: 'zip-file',
          bytes: zipData[entry.name] ?? new Uint8Array(),
        },
      };

      if (this.readFileMeta) {
        fileNode.size = zipData[entry.name]?.length ?? 0;
      }

      parentNode.children?.push(fileNode);
    });

    pruneAndSortTree(root, 0, this.depth, this.sort);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Resolves a display name for the archive root
   * @param source ZIP source that may expose a name
   * @returns Archive root name
   */
  private extractZipName(source: ZipSource): string {
    if (typeof File !== 'undefined' && source instanceof File && source.name) {
      return source.name;
    }

    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      const namedSource = source as Blob & { name?: string };

      if (namedSource.name) {
        return namedSource.name;
      }
    }

    return 'archive.zip';
  }

  /**
   * Converts the configured ZIP source into bytes
   * @returns ZIP archive bytes
   */
  private async readZipBytes(): Promise<Uint8Array> {
    if (this.zipSource instanceof Uint8Array) {
      return this.zipSource;
    }

    if (this.zipSource instanceof ArrayBuffer) {
      return new Uint8Array(this.zipSource);
    }

    return new Uint8Array(await this.zipSource.arrayBuffer());
  }

  /**
   * Inflates ZIP archive entries into byte arrays
   * @param bytes ZIP archive bytes
   * @returns Mapping from ZIP entry name to file bytes
   */
  private async unzipEntries(
    bytes: Uint8Array
  ): Promise<Record<string, Uint8Array>> {
    return await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(bytes, (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ ...result });
      });
    });
  }

  /**
   * Loads gitignore rules from .gitignore files inside the ZIP
   * @param zipData Inflated ZIP entry bytes keyed by entry name
   * @param entries Parsed central directory entries
   */
  private loadGitignoreFromZip(
    zipData: Record<string, Uint8Array>,
    entries: ZipEntry[]
  ): void {
    entries.forEach(entry => {
      if (entry.isDir) {
        return;
      }

      const name = entry.name.split('/').filter(Boolean).at(-1);

      if (name !== '.gitignore') {
        return;
      }

      const fileData = zipData[entry.name];

      if (!fileData) {
        return;
      }

      const slashIndex = entry.name.lastIndexOf('/');
      const dirRelPath =
        slashIndex === -1
          ? this.zipName
          : `${this.zipName}/${entry.name.substring(0, slashIndex)}`;

      this.registerGitignoreRules(
        dirRelPath,
        new TextDecoder('utf-8').decode(fileData)
      );
    });
  }

  /**
   * Finds or creates a directory node for a ZIP path
   * @param dirPath Tree-relative directory path
   * @param nodeMap Directory lookup keyed by path
   * @param root Archive root node
   * @returns Existing or newly created directory node
   */
  private getOrCreateDirectory(
    dirPath: string,
    nodeMap: Map<string, FileNode>,
    root: FileNode
  ): FileNode {
    const normalizedDirPath = dirPath.replace(/\/$/u, '');

    if (!normalizedDirPath || normalizedDirPath === root.path) {
      return root;
    }

    const cachedNode = nodeMap.get(normalizedDirPath);

    if (cachedNode) {
      return cachedNode;
    }

    const parentPath = getParentPath(normalizedDirPath);
    const parentNode = this.getOrCreateDirectory(parentPath, nodeMap, root);
    const nextNode: FileNode = {
      name: normalizedDirPath.substring(parentPath.length + 1),
      path: normalizedDirPath,
      kind: 'directory',
      children: [],
    };

    parentNode.children?.push(nextNode);
    nodeMap.set(normalizedDirPath, nextNode);

    return nextNode;
  }

  /**
   * Checks whether a ZIP entry path should be skipped
   * @param fullPath Tree-relative path to test
   * @returns True when hidden, exclude, or gitignore rules skip the path
   */
  private isHiddenOrExcluded(fullPath: string): boolean {
    return (
      (!this.showHidden &&
        fullPath.split('/').some(part => part.startsWith('.'))) ||
      this.isPathExcludedByPatterns(fullPath) ||
      (this.useGitignore && this.isGitIgnored(fullPath))
    );
  }
}
