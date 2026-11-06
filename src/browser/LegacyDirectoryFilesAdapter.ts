import {
  BaseFileSystemAdapter,
  type ReadContext,
} from '../adapters/BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import { FileTreeError, throwReadFailure } from '../reader/errors';
import { attachFileTreeMetadata } from '../reader/metadata';
import { sortChildren } from '../reader/sort';

/**
 * Date: 2026-06-07
 * Desc: Rebuilds FileNode trees from legacy webkitdirectory file lists
 */

interface LegacyDirectoryFileEntry {
  file: File;
  fullPath: string;
  parentPath: string;
  relativeSegments: string[];
  name: string;
}

export class LegacyDirectoryFilesAdapter extends BaseFileSystemAdapter {
  private readonly files: File[];

  /**
   * Creates an adapter for files returned by a legacy directory input
   * @param files File list with webkitRelativePath values
   * @param options Initial read options
   */
  constructor(files: File[] | FileList, options: ReadOptions = {}) {
    super(options);
    this.files = Array.from(files);
  }

  /**
   * Rebuilds a FileNode tree from the legacy directory file list
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree reconstructed from webkitdirectory files
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    const context = this.createReadContext(options);

    if (this.files.length === 0) {
      throw new FileTreeError(
        'read_failed',
        'The selected folder is empty, or the browser did not return any available files'
      );
    }

    const { rootName, entries } = this.createSelectedFileEntries(this.files);

    if (context.options.useGitignore) {
      await this.loadGitignoreRules(context, entries);
    }

    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      children: [],
    };

    this.buildTreeFromEntries(context, root, entries);
    this.sortTreeChildren(context, root);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Converts selected files into normalized entries and discovers the root name
   * @param files Files returned by the directory input
   * @returns Root name and normalized file entries
   */
  private createSelectedFileEntries(files: File[]): {
    rootName: string;
    entries: LegacyDirectoryFileEntry[];
  } {
    const firstFile = files[0];

    if (!firstFile) {
      throw new FileTreeError(
        'read_failed',
        'The selected folder is empty, or the browser did not return any available files'
      );
    }

    const firstRelativePath = this.getNormalizedRelativePath(firstFile);
    const rootName = firstRelativePath.split('/')[0];

    if (!rootName) {
      throw new FileTreeError(
        'read_failed',
        'The browser did not return usable directory structure information'
      );
    }

    return {
      rootName,
      entries: files.map(file => this.createSelectedFileEntry(file, rootName)),
    };
  }

  /**
   * Converts a selected file into a normalized tree entry
   * @param file File returned by the browser
   * @param rootName Expected selected root directory name
   * @returns Normalized legacy directory file entry
   */
  private createSelectedFileEntry(
    file: File,
    rootName: string
  ): LegacyDirectoryFileEntry {
    const normalizedRelativePath = this.getNormalizedRelativePath(file);
    const segments = normalizedRelativePath.split('/').filter(Boolean);

    if (segments.length < 2 || segments[0] !== rootName) {
      throw new FileTreeError(
        'read_failed',
        'The browser did not return complete directory-relative paths'
      );
    }

    const relativeSegments = segments.slice(1);
    const name = relativeSegments[relativeSegments.length - 1] ?? file.name;
    const parentSegments = relativeSegments.slice(0, -1);
    const parentPath = parentSegments.length
      ? `${rootName}/${parentSegments.join('/')}`
      : rootName;

    return {
      file,
      fullPath: `${rootName}/${relativeSegments.join('/')}`,
      parentPath,
      relativeSegments,
      name,
    };
  }

  /**
   * Loads gitignore rules from selected .gitignore files
   * @param context Context of the current read
   * @param entries Normalized selected file entries
   */
  private async loadGitignoreRules(
    context: ReadContext,
    entries: LegacyDirectoryFileEntry[]
  ): Promise<void> {
    const tasks = entries
      .filter(entry => entry.name === '.gitignore')
      .map(entry => async (): Promise<void> => {
        try {
          this.registerGitignoreRules(
            context,
            entry.parentPath,
            await context.runIo(() => entry.file.text())
          );
        } catch (error) {
          throwReadFailure(
            'gitignore_read_failed',
            'Could not read .gitignore',
            entry.fullPath,
            error
          );
        }
      });

    await this.executeTasks(context, tasks);
  }

  /**
   * Adds included selected files to the root tree
   * @param context Context of the current read
   * @param root Root directory node
   * @param entries Normalized selected file entries
   */
  private buildTreeFromEntries(
    context: ReadContext,
    root: FileNode,
    entries: LegacyDirectoryFileEntry[]
  ): void {
    const directoryNodeMap = new Map<string, FileNode>([[root.path, root]]);

    entries.forEach(entry => {
      if (!this.shouldIncludeSelectedFile(context, entry)) {
        return;
      }

      const parentNode = this.ensureParentDirectories(
        context,
        root,
        directoryNodeMap,
        entry
      );

      if (!parentNode) {
        return;
      }

      parentNode.children?.push(this.createFileNode(context, entry));
    });
  }

  /**
   * Creates missing parent directories for a selected file entry
   * @param context Context of the current read
   * @param root Root directory node
   * @param directoryNodeMap Directory lookup keyed by path
   * @param entry Selected file entry to place
   * @returns Parent directory node, or null when depth excludes the file
   */
  private ensureParentDirectories(
    context: ReadContext,
    root: FileNode,
    directoryNodeMap: Map<string, FileNode>,
    entry: LegacyDirectoryFileEntry
  ): FileNode | null {
    const maxDirectoryDepth = Math.min(
      entry.relativeSegments.length - 1,
      context.options.depth
    );
    let currentDirectory = root;
    let currentDirectoryPath = root.path;

    for (let index = 0; index < maxDirectoryDepth; index += 1) {
      const segment = entry.relativeSegments[index];

      if (!segment) {
        continue;
      }

      currentDirectoryPath = `${currentDirectoryPath}/${segment}`;
      currentDirectory = this.ensureDirectoryNode(
        directoryNodeMap,
        currentDirectory,
        currentDirectoryPath,
        segment
      );
    }

    return entry.relativeSegments.length > context.options.depth
      ? null
      : currentDirectory;
  }

  /**
   * Checks whether a selected file passes hidden, exclude, and gitignore rules
   * @param context Context of the current read
   * @param entry Selected file entry to test
   * @returns True when the file should be included
   */
  private shouldIncludeSelectedFile(
    context: ReadContext,
    entry: LegacyDirectoryFileEntry
  ): boolean {
    if (this.isUnderHiddenDirectory(context, entry)) {
      return false;
    }

    if (this.isPathExcludedByPatterns(context, entry.fullPath)) {
      return false;
    }

    return !(
      context.options.useGitignore &&
      this.isGitIgnored(context, entry.fullPath, entry.parentPath)
    );
  }

  /**
   * Checks whether an entry belongs to a hidden directory
   * @param context Context of the current read
   * @param entry Selected file entry to test
   * @returns True when hidden directory filtering should exclude the entry
   */
  private isUnderHiddenDirectory(
    context: ReadContext,
    entry: LegacyDirectoryFileEntry
  ): boolean {
    if (context.options.showHidden) {
      return false;
    }

    return entry.relativeSegments.some(segment => segment.startsWith('.'));
  }

  /**
   * Finds or creates a directory node under the provided parent
   * @param directoryNodeMap Directory lookup keyed by path
   * @param parentNode Parent node that should contain the directory
   * @param path Tree-relative directory path
   * @param name Directory name
   * @returns Existing or newly created directory node
   */
  private ensureDirectoryNode(
    directoryNodeMap: Map<string, FileNode>,
    parentNode: FileNode,
    path: string,
    name: string
  ): FileNode {
    const existingNode = directoryNodeMap.get(path);

    if (existingNode) {
      return existingNode;
    }

    const nextNode: FileNode = {
      name,
      path,
      kind: 'directory',
      children: [],
    };
    const parentChildren = parentNode.children ?? (parentNode.children = []);

    parentChildren.push(nextNode);
    directoryNodeMap.set(path, nextNode);

    return nextNode;
  }

  /**
   * Converts a legacy selected file entry into a FileNode
   * @param context Context of the current read
   * @param entry Selected file entry to convert
   * @returns File node with optional metadata
   */
  private createFileNode(
    context: ReadContext,
    entry: LegacyDirectoryFileEntry
  ): FileNode {
    const node: FileNode = {
      name: entry.name,
      path: entry.fullPath,
      kind: 'file',
    };

    if (!context.options.readFileMeta) {
      return node;
    }

    node.size = entry.file.size;
    node.lastModified = entry.file.lastModified;

    if (entry.file.type) {
      node.mimeType = entry.file.type;
    }

    return node;
  }

  /**
   * Sorts a tree node's children recursively
   * @param context Context of the current read
   * @param node Directory node whose descendants should be sorted
   */
  private sortTreeChildren(context: ReadContext, node: FileNode): void {
    if (!node.children?.length) {
      return;
    }

    sortChildren(node.children, context.options.sort);

    node.children.forEach(child => {
      this.sortTreeChildren(context, child);
    });
  }

  /**
   * Reads and normalizes the browser-provided relative file path
   * @param file Selected file with a webkitRelativePath value
   * @returns Slash-normalized relative path without outer slashes
   */
  private getNormalizedRelativePath(file: File): string {
    return file.webkitRelativePath
      .replace(/\\/gu, '/')
      .replace(/^\/+|\/+$/gu, '');
  }
}
