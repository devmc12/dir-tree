import { promises as fs } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  BaseFileSystemAdapter,
  type ReadContext,
} from './BaseFileSystemAdapter';
import type { Entry, FileNode, ReadOptions } from '../reader/types';
import { attachFileTreeMetadata, sortChildren } from '../reader/utils';

/**
 * Date: 2026-06-14
 * Desc: Reads a Node.js filesystem directory path into a FileNode tree
 */

interface NodeFileSystemEntry extends Entry {
  handle: { absolutePath: string };
}

export class NodeFileSystemAdapter extends BaseFileSystemAdapter {
  private rootPath: string;

  /**
   * Creates an adapter for a Node.js filesystem directory path
   * @param rootPath Filesystem path to use as the root
   * @param options Initial read options
   */
  constructor(rootPath: string, options: ReadOptions = {}) {
    super(options);
    this.rootPath = rootPath;
  }

  /**
   * Reads the configured directory path into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree rooted at the configured path
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    const context = this.createReadContext(options);

    const absoluteRoot = resolve(this.rootPath);
    const rootName = basename(absoluteRoot) || absoluteRoot;
    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      children: [],
    };

    if (context.options.useGitignore) {
      await this.loadGitignore(context, absoluteRoot, rootName);
    }

    const entries = await this.enumerateEntries(
      context,
      absoluteRoot,
      rootName
    );

    root.children = await this.traverseEntries(context, entries, 0);
    sortChildren(root.children, context.options.sort);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Lists included entries in a filesystem directory
   * @param context Context of the current read
   * @param absoluteDirPath Absolute directory path to read
   * @param treeDirPath Tree-relative directory path
   * @returns Entries that pass hidden, exclude, and gitignore filtering
   */
  private async enumerateEntries(
    context: ReadContext,
    absoluteDirPath: string,
    treeDirPath: string
  ): Promise<NodeFileSystemEntry[]> {
    const dirents = await fs.readdir(absoluteDirPath, { withFileTypes: true });
    const entries: NodeFileSystemEntry[] = [];

    for (const dirent of dirents) {
      const isDirectory = dirent.isDirectory();

      if (!isDirectory && !dirent.isFile()) {
        continue;
      }

      const childTreePath = `${treeDirPath}/${dirent.name}`;

      if (!context.options.showHidden && dirent.name.startsWith('.')) {
        continue;
      }

      if (this.isPathExcludedByPatterns(context, childTreePath)) {
        continue;
      }

      if (
        context.options.useGitignore &&
        this.isGitIgnored(
          context,
          childTreePath,
          treeDirPath,
          isDirectory ? 'directory' : 'file'
        )
      ) {
        continue;
      }

      entries.push({
        name: dirent.name,
        path: childTreePath,
        kind: isDirectory ? 'directory' : 'file',
        handle: { absolutePath: join(absoluteDirPath, dirent.name) },
      });
    }

    return entries;
  }

  /**
   * Recursively converts filesystem entries into child file nodes
   * @param context Context of the current read
   * @param entries Filesystem entries to traverse
   * @param currentDepth Current recursion depth
   * @returns Child nodes included by the read options
   */
  private async traverseEntries(
    context: ReadContext,
    entries: NodeFileSystemEntry[],
    currentDepth: number
  ): Promise<FileNode[]> {
    if (currentDepth >= context.options.depth) {
      return [];
    }

    const tasks = entries.map(entry => async (): Promise<FileNode> => {
      const { absolutePath } = entry.handle;

      if (entry.kind === 'directory') {
        if (context.options.useGitignore) {
          await this.loadGitignore(context, absolutePath, entry.path);
        }

        const childEntries = await this.enumerateEntries(
          context,
          absolutePath,
          entry.path
        );
        const node: FileNode = {
          name: entry.name,
          path: entry.path,
          kind: 'directory',
          children: await this.traverseEntries(
            context,
            childEntries,
            currentDepth + 1
          ),
        };

        sortChildren(node.children ?? [], context.options.sort);
        return node;
      }

      return await this.buildFileNode(
        context,
        entry.name,
        entry.path,
        absolutePath
      );
    });

    return await this.executeTasks(context, tasks);
  }

  /**
   * Builds a file node from a Node.js filesystem path
   * @param context Context of the current read
   * @param name File name
   * @param treePath Tree-relative file path
   * @param absolutePath Absolute filesystem path
   * @returns File node with optional metadata
   */
  private async buildFileNode(
    context: ReadContext,
    name: string,
    treePath: string,
    absolutePath: string
  ): Promise<FileNode> {
    const node: FileNode = {
      name,
      path: treePath,
      kind: 'file',
    };

    if (!context.options.readFileMeta) {
      return node;
    }

    try {
      const stats = await fs.stat(absolutePath);

      node.size = stats.size;
      node.lastModified = stats.mtimeMs;
    } catch {
      // Keep the node usable when metadata access is unavailable
    }

    return node;
  }

  /**
   * Loads gitignore rules from a filesystem directory when present
   * @param context Context of the current read
   * @param absoluteDirPath Absolute directory path to inspect
   * @param treeDirPath Tree-relative directory path
   */
  private async loadGitignore(
    context: ReadContext,
    absoluteDirPath: string,
    treeDirPath: string
  ): Promise<void> {
    try {
      const content = await fs.readFile(
        join(absoluteDirPath, '.gitignore'),
        'utf8'
      );

      this.registerGitignoreRules(context, treeDirPath, content);
    } catch {
      // Directories without .gitignore do not add rules
    }
  }
}
