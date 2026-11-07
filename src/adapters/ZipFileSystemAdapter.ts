import {
  BaseFileSystemAdapter,
  type ReadContext,
} from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import { throwReadFailure } from '../reader/errors';
import { attachFileTreeMetadata } from '../reader/metadata';
import { getParentPath } from '../tree/path';
import { pruneAndSortTree } from '../reader/sort';
import {
  parseCentralDirectory,
  readZipEntryText,
  type ZipEntry,
} from '../reader/zip';

/**
 * Date: 2026-06-07
 * Desc: Reads ZIP archives into FileNode trees
 */

export type ZipSource = Blob | ArrayBuffer | Uint8Array;

interface ZipIndex {
  bytes: Uint8Array;
  entries: ZipEntry[];
  ignoreFiles: Array<{ entry: ZipEntry; directory: string; depth: number }>;
  ignoreContents: Map<string, string>;
}

export class ZipFileSystemAdapter extends BaseFileSystemAdapter {
  private readonly zipName: string;
  private readonly zipSource: ZipSource;
  private cachedIndex: Promise<ZipIndex> | undefined;

  /**
   * Creates an adapter for a ZIP archive source
   * @param source Immutable Blob or mutable bytes read afresh on each call; do not modify bytes while reading
   * @param options Initial read options
   * @param name Optional root name for the archive tree
   */
  constructor(source: ZipSource, options: ReadOptions = {}, name?: string) {
    super(options);
    this.zipSource = source;
    this.zipName = name ?? this.extractZipName(source);
  }

  /**
   * Builds a tree from validated ZIP metadata without inflating ordinary files
   * @param options Optional overrides for this read
   * @returns Directory tree rooted at the archive name
   * @throws FileTreeError for invalid ZIP metadata or unreadable ignore rules
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    const context = this.createReadContext(options);
    const archive = await this.getIndex();
    const root: FileNode = {
      name: this.zipName,
      path: this.zipName,
      kind: 'directory',
      children: [],
    };

    if (context.options.useGitignore) {
      this.loadGitignoreRules(context, archive);
    }

    const directories = new Map<string, FileNode>([[root.path, root]]);

    for (const entry of archive.entries) {
      const fullPath = `${root.path}/${entry.path}`;

      if (this.isHiddenOrExcluded(context, fullPath, entry.isDir)) {
        continue;
      }

      if (entry.isDir) {
        this.getOrCreateDirectory(fullPath, directories, root);
        continue;
      }

      const parentPath = getParentPath(fullPath);
      const parent = this.getOrCreateDirectory(parentPath, directories, root);
      const node: FileNode = {
        name: fullPath.slice(parentPath.length + 1),
        path: fullPath,
        kind: 'file',
      };

      if (context.options.readFileMeta) {
        node.size = entry.size;
      }

      parent.children?.push(node);
    }

    pruneAndSortTree(root, 0, context.options.depth, context.options.sort);
    attachFileTreeMetadata(root);
    this.reportReadTiming(context);
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
   * Shares index initialization for immutable sources and allows retries after failures
   */
  private getIndex(): Promise<ZipIndex> {
    if (
      this.zipSource instanceof Uint8Array ||
      this.zipSource instanceof ArrayBuffer
    ) {
      return this.buildIndex();
    }

    this.cachedIndex ??= this.buildIndex().catch((error: unknown) => {
      this.cachedIndex = undefined;
      throw error;
    });

    return this.cachedIndex;
  }

  /**
   * Indexes archive bytes and orders rule files so parents are loaded first
   */
  private async buildIndex(): Promise<ZipIndex> {
    const bytes = await this.readZipBytes().catch((error: unknown) =>
      throwReadFailure(
        'read_failed',
        'Could not read ZIP source',
        this.zipName,
        error
      )
    );
    const entries = parseCentralDirectory(bytes);
    const ignoreFiles: ZipIndex['ignoreFiles'] = [];

    for (const entry of entries) {
      if (
        !entry.isDir &&
        (entry.path === '.gitignore' || entry.path.endsWith('/.gitignore'))
      ) {
        const directory = getParentPath(entry.path);
        ignoreFiles.push({
          entry,
          directory,
          depth: directory ? directory.split('/').length : 0,
        });
      }
    }

    ignoreFiles.sort((left, right) => left.depth - right.depth);
    return { bytes, entries, ignoreFiles, ignoreContents: new Map() };
  }

  /**
   * Reads a Blob or views mutable bytes without making a full archive copy
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
   * Loads only rules whose scopes can be reached in this read
   */
  private loadGitignoreRules(context: ReadContext, archive: ZipIndex): void {
    for (const { entry, directory, depth } of archive.ignoreFiles) {
      const scope = directory ? `${this.zipName}/${directory}` : this.zipName;

      if (
        depth >= context.options.depth ||
        (directory && this.isHiddenOrExcluded(context, scope, true))
      ) {
        continue;
      }

      let content = archive.ignoreContents.get(entry.path);

      if (content === undefined) {
        try {
          content = readZipEntryText(archive.bytes, entry);
          archive.ignoreContents.set(entry.path, content);
        } catch (error) {
          throwReadFailure(
            'gitignore_read_failed',
            'Could not read .gitignore in ZIP archive',
            `${this.zipName}/${entry.path}`,
            error
          );
        }
      }

      this.registerGitignoreRules(context, scope, content);
    }
  }

  /**
   * Finds a directory or creates the missing directories on the way to it
   */
  private getOrCreateDirectory(
    dirPath: string,
    directories: Map<string, FileNode>,
    root: FileNode
  ): FileNode {
    const missing: string[] = [];
    let currentPath = dirPath;
    let parent = directories.get(currentPath);

    while (!parent && currentPath && currentPath !== root.path) {
      missing.push(currentPath);
      currentPath = getParentPath(currentPath);
      parent = directories.get(currentPath);
    }

    let directory = parent ?? root;

    while (missing.length > 0) {
      const path = missing.pop()!;
      const child: FileNode = {
        name: path.slice(directory.path.length + 1),
        path,
        kind: 'directory',
        children: [],
      };
      directory.children?.push(child);
      directories.set(path, child);
      directory = child;
    }

    return directory;
  }

  /**
   * Checks whether hidden, exclude, or gitignore rules skip an entry
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
