import { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
import type { Entry, FileNode, ReadOptions } from '../reader/types';
import { attachFileTreeMetadata, sortChildren } from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Reads local browser directory handles into FileNode trees
 */

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

type IterableDirectoryHandle = FileSystemDirectoryHandle &
  AsyncIterable<[string, FileSystemHandle]>;

export class LocalFileSystemAdapter extends BaseFileSystemAdapter {
  private rootHandle: FileSystemDirectoryHandle | undefined;

  /**
   * Creates an adapter for the File System Access API
   * @param options Initial read options
   * @param rootHandle Optional directory handle to use without prompting
   */
  constructor(
    options: ReadOptions = {},
    rootHandle?: FileSystemDirectoryHandle
  ) {
    super(options);
    this.rootHandle = rootHandle;
  }

  /**
   * Reads the selected directory handle into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree rooted at the picked directory handle
   */
  async read(options?: Partial<ReadOptions>): Promise<FileNode> {
    this.resetReadSession(options);

    this.rootHandle ??= await this.pickDirectory();

    const rootName = this.rootHandle.name;
    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      handle: {
        source: 'file-system-directory',
        handle: this.rootHandle,
      },
      children: [],
    };

    if (this.useGitignore) {
      await this.loadGitignore(this.rootHandle, rootName);
    }

    const entries = await this.enumerateEntries(this.rootHandle, rootName);

    root.children = await this.traverseEntries(entries, 0);
    sortChildren(root.children, this.sort);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Lists the included child entries of a directory handle
   * @param dirHandle Directory handle to enumerate
   * @param currentDirPath Tree-relative path of the directory being listed
   * @returns Entries that pass hidden, exclude, and gitignore filtering
   */
  async enumerateEntries(
    dirHandle: FileSystemDirectoryHandle,
    currentDirPath: string
  ): Promise<Entry[]> {
    const entries: Entry[] = [];

    for await (const [, childHandle] of dirHandle as IterableDirectoryHandle) {
      const childPath = `${currentDirPath}/${childHandle.name}`;

      if (!this.showHidden && childHandle.name.startsWith('.')) {
        continue;
      }

      if (this.isPathExcludedByPatterns(childPath)) {
        continue;
      }

      if (this.useGitignore && this.isGitIgnored(childPath, currentDirPath)) {
        continue;
      }

      entries.push({
        name: childHandle.name,
        path: childPath,
        kind: childHandle.kind === 'directory' ? 'directory' : 'file',
        handle: childHandle,
      });
    }

    return entries;
  }

  /**
   * Opens the native directory picker and returns the selected handle
   * @returns Directory handle selected by the user
   */
  private async pickDirectory(): Promise<FileSystemDirectoryHandle> {
    if (typeof window === 'undefined') {
      throw new Error('Directory picking requires a browser runtime');
    }

    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;

    if (!picker) {
      throw new Error('Browser does not support showDirectoryPicker API');
    }

    return await picker({ mode: this.mode });
  }

  /**
   * Recursively converts directory entries into child file nodes
   * @param entries Directory entries to traverse
   * @param currentDepth Current recursion depth
   * @returns Child nodes included by the read options
   */
  private async traverseEntries(
    entries: Entry[],
    currentDepth: number
  ): Promise<FileNode[]> {
    if (currentDepth >= this.depth) {
      return [];
    }

    const tasks = entries.map(entry => async (): Promise<FileNode> => {
      if (entry.kind === 'directory') {
        const dirHandle = entry.handle as FileSystemDirectoryHandle;

        if (this.useGitignore) {
          await this.loadGitignore(dirHandle, entry.path);
        }

        const childEntries = await this.enumerateEntries(dirHandle, entry.path);
        const node: FileNode = {
          name: entry.name,
          path: entry.path,
          kind: 'directory',
          handle: {
            source: 'file-system-directory',
            handle: dirHandle,
          },
          children: await this.traverseEntries(childEntries, currentDepth + 1),
        };

        sortChildren(node.children ?? [], this.sort);
        return node;
      }

      return await this.buildFileNode(
        entry.handle as FileSystemFileHandle,
        entry.path
      );
    });

    return await this.executeTasks(tasks);
  }

  /**
   * Builds a file node from a File System Access file handle
   * @param handle Browser file handle
   * @param filePath Tree-relative file path
   * @returns File node with optional metadata
   */
  private async buildFileNode(
    handle: FileSystemFileHandle,
    filePath: string
  ): Promise<FileNode> {
    const node: FileNode = {
      name: handle.name,
      path: filePath,
      kind: 'file',
      handle: {
        source: 'file-system-file',
        handle,
      },
    };

    if (!this.readFileMeta) {
      return node;
    }

    try {
      const file = await handle.getFile();
      node.size = file.size;
      node.lastModified = file.lastModified;

      if (file.type) {
        node.mimeType = file.type;
      }
    } catch {
      // Keep the node usable when metadata access is unavailable
    }

    return node;
  }

  /**
   * Loads gitignore rules from a directory handle when present
   * @param dirHandle Directory handle to inspect
   * @param dirRelPath Tree-relative directory path
   */
  private async loadGitignore(
    dirHandle: FileSystemDirectoryHandle,
    dirRelPath: string
  ): Promise<void> {
    try {
      const gitignoreHandle = await dirHandle.getFileHandle('.gitignore');
      const file = await gitignoreHandle.getFile();

      this.registerGitignoreRules(dirRelPath, await file.text());
    } catch {
      // Directories without .gitignore do not add rules
    }
  }
}
