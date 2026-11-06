import { unzip } from 'fflate';
import {
  BaseFileSystemAdapter,
  type ReadContext,
} from './BaseFileSystemAdapter';
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
    const context = this.createReadContext(options);

    const bytes = await this.readZipBytes();
    const centralDirectoryEntries = parseCentralDirectory(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );

    if (!centralDirectoryEntries) {
      throw new Error('Could not parse the ZIP file structure');
    }

    const zipData = this.normalizeEntryNames(
      await this.unzipEntries(bytes),
      centralDirectoryEntries
    );
    const root: FileNode = {
      name: this.zipName,
      path: this.zipName,
      kind: 'directory',
      children: [],
    };

    if (context.options.useGitignore) {
      this.loadGitignoreFromZip(context, zipData, centralDirectoryEntries);
    }

    const nodeMap = new Map<string, FileNode>();

    nodeMap.set(root.path, root);

    centralDirectoryEntries.forEach(entry => {
      const relativePath = entry.name.replace(/\/$/u, '');

      if (!relativePath) {
        return;
      }

      const fullPath = `${root.path}/${relativePath}`;

      if (this.isHiddenOrExcluded(context, fullPath, entry.isDir)) {
        return;
      }

      if (entry.isDir) {
        this.getOrCreateDirectory(fullPath, nodeMap, root);
        return;
      }

      const parentPath = getParentPath(fullPath);
      const parentNode = this.getOrCreateDirectory(parentPath, nodeMap, root);
      const fileData = zipData[entry.name];

      if (!fileData) {
        throw new Error('ZIP file content could not be matched to its entry');
      }

      const fileNode: FileNode = {
        name: fullPath.substring(parentPath.length + 1),
        path: fullPath,
        kind: 'file',
      };

      if (context.options.readFileMeta) {
        fileNode.size = fileData.length;
      }

      parentNode.children?.push(fileNode);
    });

    pruneAndSortTree(root, 0, context.options.depth, context.options.sort);
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
   * Associates inflated bytes with the display names decoded from the central directory
   * @param inflatedEntries Inflated bytes using the ZIP decoder's filename keys
   * @param entries Central directory entries with display and content keys
   * @returns Entry bytes indexed by the same names used for tree paths
   */
  private normalizeEntryNames(
    inflatedEntries: Record<string, Uint8Array>,
    entries: ZipEntry[]
  ): Record<string, Uint8Array> {
    const normalizedEntries: Record<string, Uint8Array> = Object.create(null);
    const usedContentKeys = new Set<string>();

    for (const entry of entries) {
      const contentKey = entry.contentKey ?? entry.name;

      if (
        Object.prototype.hasOwnProperty.call(normalizedEntries, entry.name) ||
        usedContentKeys.has(contentKey)
      ) {
        throw new Error('ZIP entries contain ambiguous duplicate filenames');
      }

      const fileData = Object.prototype.hasOwnProperty.call(
        inflatedEntries,
        contentKey
      )
        ? inflatedEntries[contentKey]
        : undefined;

      if (!fileData) {
        throw new Error('ZIP file content could not be matched to its entry');
      }

      normalizedEntries[entry.name] = fileData;
      usedContentKeys.add(contentKey);
    }

    return normalizedEntries;
  }

  /**
   * Loads gitignore rules from .gitignore files inside the ZIP
   * @param context Context of the current read
   * @param zipData Inflated ZIP entry bytes keyed by entry name
   * @param entries Parsed central directory entries
   */
  private loadGitignoreFromZip(
    context: ReadContext,
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
        context,
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
   * @param context Context of the current read
   * @param fullPath Tree-relative path to test
   * @param isDirectory Whether the entry represents a directory
   * @returns True when hidden, exclude, or gitignore rules skip the path
   */
  private isHiddenOrExcluded(
    context: ReadContext,
    fullPath: string,
    isDirectory: boolean
  ): boolean {
    return (
      (!context.options.showHidden &&
        fullPath.split('/').some(part => part.startsWith('.'))) ||
      this.isPathExcludedByPatterns(context, fullPath) ||
      (context.options.useGitignore &&
        this.isGitIgnored(
          context,
          fullPath,
          getParentPath(fullPath),
          isDirectory ? 'directory' : 'file'
        ))
    );
  }
}
