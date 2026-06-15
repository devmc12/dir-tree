import { promises as fs } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
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
    this.resetReadSession(options);

    const absoluteRoot = resolve(this.rootPath);
    const rootName = basename(absoluteRoot) || absoluteRoot;
    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      handle: {
        source: 'node-directory',
        absolutePath: absoluteRoot,
      },
      children: [],
    };

    if (this.useGitignore) {
      await this.loadGitignore(absoluteRoot, rootName);
    }

    const entries = await this.enumerateEntries(absoluteRoot, rootName);

    root.children = await this.traverseEntries(entries, 0);
    sortChildren(root.children, this.sort);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Lists included entries in a filesystem directory
   * @param absoluteDirPath Absolute directory path to read
   * @param treeDirPath Tree-relative directory path
   * @returns Entries that pass hidden, exclude, and gitignore filtering
   */
  private async enumerateEntries(
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

      if (!this.showHidden && dirent.name.startsWith('.')) {
        continue;
      }

      if (this.isPathExcludedByPatterns(childTreePath)) {
        continue;
      }

      if (this.useGitignore && this.isGitIgnored(childTreePath, treeDirPath)) {
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
   * @param entries Filesystem entries to traverse
   * @param currentDepth Current recursion depth
   * @returns Child nodes included by the read options
   */
  private async traverseEntries(
    entries: NodeFileSystemEntry[],
    currentDepth: number
  ): Promise<FileNode[]> {
    if (currentDepth >= this.depth) {
      return [];
    }

    const tasks = entries.map(entry => async (): Promise<FileNode> => {
      const { absolutePath } = entry.handle;

      if (entry.kind === 'directory') {
        if (this.useGitignore) {
          await this.loadGitignore(absolutePath, entry.path);
        }

        const childEntries = await this.enumerateEntries(
          absolutePath,
          entry.path
        );
        const node: FileNode = {
          name: entry.name,
          path: entry.path,
          kind: 'directory',
          handle: {
            source: 'node-directory',
            absolutePath,
          },
          children: await this.traverseEntries(childEntries, currentDepth + 1),
        };

        sortChildren(node.children ?? [], this.sort);
        return node;
      }

      return await this.buildFileNode(entry.name, entry.path, absolutePath);
    });

    return await this.executeTasks(tasks);
  }

  /**
   * Builds a file node from a Node.js filesystem path
   * @param name File name
   * @param treePath Tree-relative file path
   * @param absolutePath Absolute filesystem path
   * @returns File node with optional metadata
   */
  private async buildFileNode(
    name: string,
    treePath: string,
    absolutePath: string
  ): Promise<FileNode> {
    const node: FileNode = {
      name,
      path: treePath,
      kind: 'file',
      handle: {
        source: 'node-file',
        absolutePath,
      },
    };

    if (!this.readFileMeta) {
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
   * @param absoluteDirPath Absolute directory path to inspect
   * @param treeDirPath Tree-relative directory path
   */
  private async loadGitignore(
    absoluteDirPath: string,
    treeDirPath: string
  ): Promise<void> {
    try {
      const content = await fs.readFile(
        join(absoluteDirPath, '.gitignore'),
        'utf8'
      );

      this.registerGitignoreRules(treeDirPath, content);
    } catch {
      // Directories without .gitignore do not add rules
    }
  }
}
