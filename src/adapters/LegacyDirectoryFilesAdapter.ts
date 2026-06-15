import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import { attachFileTreeMetadata, sortChildren } from '../reader/utils';

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
    this.resetReadSession(options);

    if (this.files.length === 0) {
      throw new Error(
        'The selected folder is empty, or the browser did not return any available files'
      );
    }

    const { rootName, entries } = this.createSelectedFileEntries(this.files);

    if (this.useGitignore) {
      await this.loadGitignoreRules(entries);
    }

    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      children: [],
    };

    this.buildTreeFromEntries(root, entries);
    this.sortTreeChildren(root);
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
      throw new Error(
        'The selected folder is empty, or the browser did not return any available files'
      );
    }

    const firstRelativePath = this.getNormalizedRelativePath(firstFile);
    const rootName = firstRelativePath.split('/')[0];

    if (!rootName) {
      throw new Error(
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
      throw new Error(
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
   * @param entries Normalized selected file entries
   */
  private async loadGitignoreRules(
    entries: LegacyDirectoryFileEntry[]
  ): Promise<void> {
    const tasks = entries
      .filter(entry => entry.name === '.gitignore')
      .map(entry => async (): Promise<void> => {
        const dirRelPath =
          entry.relativeSegments.length === 1 ? '' : entry.parentPath;

        this.registerGitignoreRules(dirRelPath, await entry.file.text());
      });

    await this.executeTasks(tasks);
  }

  /**
   * Adds included selected files to the root tree
   * @param root Root directory node
   * @param entries Normalized selected file entries
   */
  private buildTreeFromEntries(
    root: FileNode,
    entries: LegacyDirectoryFileEntry[]
  ): void {
    const directoryNodeMap = new Map<string, FileNode>([[root.path, root]]);

    entries.forEach(entry => {
      if (!this.shouldIncludeSelectedFile(entry)) {
        return;
      }

      const parentNode = this.ensureParentDirectories(
        root,
        directoryNodeMap,
        entry
      );

      if (!parentNode) {
        return;
      }

      parentNode.children?.push(this.createFileNode(entry));
    });
  }

  /**
   * Creates missing parent directories for a selected file entry
   * @param root Root directory node
   * @param directoryNodeMap Directory lookup keyed by path
   * @param entry Selected file entry to place
   * @returns Parent directory node, or null when depth excludes the file
   */
  private ensureParentDirectories(
    root: FileNode,
    directoryNodeMap: Map<string, FileNode>,
    entry: LegacyDirectoryFileEntry
  ): FileNode | null {
    const maxDirectoryDepth = Math.min(
      entry.relativeSegments.length - 1,
      this.depth
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

    return entry.relativeSegments.length > this.depth ? null : currentDirectory;
  }

  /**
   * Checks whether a selected file passes hidden, exclude, and gitignore rules
   * @param entry Selected file entry to test
   * @returns True when the file should be included
   */
  private shouldIncludeSelectedFile(entry: LegacyDirectoryFileEntry): boolean {
    if (this.isUnderHiddenDirectory(entry)) {
      return false;
    }

    if (this.isPathExcludedByPatterns(entry.fullPath)) {
      return false;
    }

    return !(
      this.useGitignore && this.isGitIgnored(entry.fullPath, entry.parentPath)
    );
  }

  /**
   * Checks whether an entry belongs to a hidden directory
   * @param entry Selected file entry to test
   * @returns True when hidden directory filtering should exclude the entry
   */
  private isUnderHiddenDirectory(entry: LegacyDirectoryFileEntry): boolean {
    if (this.showHidden) {
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
   * @param entry Selected file entry to convert
   * @returns File node with optional metadata
   */
  private createFileNode(entry: LegacyDirectoryFileEntry): FileNode {
    const node: FileNode = {
      name: entry.name,
      path: entry.fullPath,
      kind: 'file',
      handle: {
        source: 'legacy-file',
        file: entry.file,
      },
    };

    if (!this.readFileMeta) {
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
   * @param node Directory node whose descendants should be sorted
   */
  private sortTreeChildren(node: FileNode): void {
    if (!node.children?.length) {
      return;
    }

    sortChildren(node.children, this.sort);

    node.children.forEach(child => {
      this.sortTreeChildren(child);
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
