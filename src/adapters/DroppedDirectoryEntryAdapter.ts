import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { FileNode, ReadOptions } from '../reader/types';
import { attachFileTreeMetadata, sortChildren } from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Reads legacy dropped directory entries into FileNode trees
 */

export interface DroppedFileSystemEntryBase {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
}

export interface DroppedFileSystemFileEntry extends DroppedFileSystemEntryBase {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
  isDirectory: false;
  isFile: true;
}

export interface DroppedFileSystemDirectoryReader {
  readEntries: (
    successCallback: (entries: DroppedFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

export interface DroppedFileSystemDirectoryEntry extends DroppedFileSystemEntryBase {
  createReader: () => DroppedFileSystemDirectoryReader;
  isDirectory: true;
  isFile: false;
}

export type DroppedFileSystemEntry =
  | DroppedFileSystemDirectoryEntry
  | DroppedFileSystemFileEntry;

export class DroppedDirectoryEntryAdapter extends BaseFileSystemAdapter {
  private readonly rootEntry: DroppedFileSystemDirectoryEntry;

  /**
   * Creates an adapter for a legacy dropped directory entry
   * @param rootEntry Dropped directory entry used as the root source
   * @param options Initial read options
   */
  constructor(
    rootEntry: DroppedFileSystemDirectoryEntry,
    options: ReadOptions = {}
  ) {
    super(options);
    this.rootEntry = rootEntry;
  }

  /**
   * Reads the dropped directory entry tree into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree rooted at the dropped directory entry
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    this.resetReadSession(options);

    const rootName = this.rootEntry.name;
    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      children: await this.traverseDirectory(this.rootEntry, rootName, 0),
    };

    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Recursively reads a dropped directory entry into child file nodes
   * @param dirEntry Directory entry to traverse
   * @param currentDirPath Tree-relative directory path
   * @param currentDepth Current recursion depth
   * @returns Child nodes included by the read options
   */
  private async traverseDirectory(
    dirEntry: DroppedFileSystemDirectoryEntry,
    currentDirPath: string,
    currentDepth: number
  ): Promise<FileNode[]> {
    if (currentDepth >= this.depth) {
      return [];
    }

    const entryList = await this.readAllDirectoryEntries(dirEntry);

    if (this.useGitignore) {
      await this.loadGitignoreFromEntries(entryList, currentDirPath);
    }

    const tasks = entryList
      .filter(entry => {
        return this.shouldIncludeEntry(
          entry,
          `${currentDirPath}/${entry.name}`,
          currentDirPath
        );
      })
      .map(entry => async (): Promise<FileNode> => {
        const childPath = `${currentDirPath}/${entry.name}`;

        if (entry.isDirectory) {
          return await this.buildDirectoryNode(
            entry,
            childPath,
            currentDepth + 1
          );
        }

        return await this.buildFileNode(entry, childPath);
      });
    const children = await this.executeTasks(tasks);

    sortChildren(children, this.sort);

    return children;
  }

  /**
   * Checks whether a dropped entry should be included in the tree
   * @param entry Dropped file or directory entry
   * @param childPath Tree-relative path for the entry
   * @param currentDirPath Parent directory path used for gitignore lookup
   * @returns True when the entry should be traversed or added
   */
  private shouldIncludeEntry(
    entry: DroppedFileSystemEntry,
    childPath: string,
    currentDirPath: string
  ): boolean {
    if (!this.showHidden && entry.name.startsWith('.')) {
      return false;
    }

    if (this.isEntryExcludedByPatterns(entry, childPath)) {
      return false;
    }

    return !(this.useGitignore && this.isGitIgnored(childPath, currentDirPath));
  }

  /**
   * Tests dropped entries against file and directory exclude patterns
   * @param entry Dropped entry being tested
   * @param childPath Tree-relative path for the entry
   * @returns True when the entry matches an exclude pattern
   */
  private isEntryExcludedByPatterns(
    entry: DroppedFileSystemEntry,
    childPath: string
  ): boolean {
    return (
      this.isPathExcludedByPatterns(childPath) ||
      (entry.isDirectory && this.isPathExcludedByPatterns(`${childPath}/`))
    );
  }

  /**
   * Builds a directory node and recursively attaches its children
   * @param entry Directory entry to convert
   * @param path Tree-relative path for the node
   * @param currentDepth Current recursion depth
   * @returns FileNode directory for the dropped entry
   */
  private async buildDirectoryNode(
    entry: DroppedFileSystemDirectoryEntry,
    path: string,
    currentDepth: number
  ): Promise<FileNode> {
    return {
      name: entry.name,
      path,
      kind: 'directory',
      children: await this.traverseDirectory(entry, path, currentDepth),
    };
  }

  /**
   * Builds a file node from a dropped file entry
   * @param entry File entry to convert
   * @param filePath Tree-relative path for the node
   * @returns FileNode file with optional metadata
   */
  private async buildFileNode(
    entry: DroppedFileSystemFileEntry,
    filePath: string
  ): Promise<FileNode> {
    const node: FileNode = {
      name: entry.name,
      path: filePath,
      kind: 'file',
    };

    if (!this.readFileMeta) {
      return node;
    }

    try {
      const file = await this.readEntryFile(entry);

      node.handle = {
        source: 'legacy-file',
        file,
      };
      node.size = file.size;
      node.lastModified = file.lastModified;

      if (file.type) {
        node.mimeType = file.type;
      }
    } catch {
      // Keep the node usable when dropped file metadata cannot be read
    }

    return node;
  }

  /**
   * Reads all batches from a legacy directory reader
   * @param dirEntry Directory entry that exposes a reader
   * @returns All child entries returned by the browser
   */
  private async readAllDirectoryEntries(
    dirEntry: DroppedFileSystemDirectoryEntry
  ): Promise<DroppedFileSystemEntry[]> {
    const reader = dirEntry.createReader();
    const entries: DroppedFileSystemEntry[] = [];

    while (true) {
      const batch = await this.readDirectoryEntryBatch(reader);

      if (batch.length === 0) {
        return entries;
      }

      entries.push(...batch);
    }
  }

  /**
   * Reads one batch from a legacy directory reader
   * @param reader Directory reader created from the entry
   * @returns A batch of file system entries
   */
  private async readDirectoryEntryBatch(
    reader: DroppedFileSystemDirectoryReader
  ): Promise<DroppedFileSystemEntry[]> {
    return await new Promise<DroppedFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  }

  /**
   * Loads gitignore rules from a dropped directory entry list when available
   * @param entries Entries in the current directory
   * @param dirRelPath Tree-relative directory path
   */
  private async loadGitignoreFromEntries(
    entries: DroppedFileSystemEntry[],
    dirRelPath: string
  ): Promise<void> {
    const gitignoreEntry = entries.find(
      (entry): entry is DroppedFileSystemFileEntry =>
        entry.isFile && entry.name === '.gitignore'
    );

    if (!gitignoreEntry) {
      return;
    }

    try {
      const file = await this.readEntryFile(gitignoreEntry);

      this.registerGitignoreRules(dirRelPath, await file.text());
    } catch {
      // Directories with unreadable .gitignore files do not add rules
    }
  }

  /**
   * Resolves a legacy file entry into a File object
   * @param entry Legacy file entry to read
   * @returns Browser File object for the entry
   */
  private async readEntryFile(
    entry: DroppedFileSystemFileEntry
  ): Promise<File> {
    return await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
  }
}
