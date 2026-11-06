import {
  BaseFileSystemAdapter,
  type ReadContext,
} from '../adapters/BaseFileSystemAdapter';
import type { Entry, FileNode, ReadOptions } from '../reader/types';
import {
  FileTreeError,
  hasErrorName,
  throwReadFailure,
} from '../reader/errors';
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
  private pendingPick: Promise<FileSystemDirectoryHandle> | undefined;

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
    const context = this.createReadContext(options);

    const rootHandle = await this.resolveRootHandle(context.options.mode);
    const rootName = rootHandle.name;
    const root: FileNode = {
      name: rootName,
      path: rootName,
      kind: 'directory',
      children: [],
    };

    root.children = await this.traverseDirectory(
      context,
      rootHandle,
      rootName,
      0
    );
    sortChildren(root.children, context.options.sort);
    attachFileTreeMetadata(root);

    return root;
  }

  /**
   * Lists child entries using the adapter defaults and the directory's own ignore file
   * @param dirHandle Directory handle to enumerate
   * @param currentDirPath Tree-relative path of the directory being listed
   * @returns Entries that pass hidden, exclude, and gitignore filtering
   */
  async enumerateEntries(
    dirHandle: FileSystemDirectoryHandle,
    currentDirPath: string
  ): Promise<Entry[]> {
    const context = this.createReadContext();

    if (context.options.useGitignore) {
      await this.loadGitignore(context, dirHandle, currentDirPath);
    }

    return await this.listEntries(context, dirHandle, currentDirPath);
  }

  /**
   * Filters directory entries with the rules of the current read
   * @param context Context of the current read
   */
  private async listEntries(
    context: ReadContext,
    dirHandle: FileSystemDirectoryHandle,
    currentDirPath: string
  ): Promise<Entry[]> {
    const entries: Entry[] = [];

    try {
      for await (const [
        ,
        childHandle,
      ] of dirHandle as IterableDirectoryHandle) {
        const childPath = `${currentDirPath}/${childHandle.name}`;

        if (!context.options.showHidden && childHandle.name.startsWith('.')) {
          continue;
        }

        if (this.isPathExcludedByPatterns(context, childPath)) {
          continue;
        }

        if (
          context.options.useGitignore &&
          this.isGitIgnored(
            context,
            childPath,
            currentDirPath,
            childHandle.kind
          )
        ) {
          continue;
        }

        entries.push({
          name: childHandle.name,
          path: childPath,
          kind: childHandle.kind === 'directory' ? 'directory' : 'file',
          handle: childHandle,
        });
      }
    } catch (error) {
      throwReadFailure(
        'read_failed',
        'Could not list directory entries',
        currentDirPath,
        error
      );
    }

    return entries;
  }

  /**
   * Reuses the selected handle or shares the first pending directory picker
   * @param mode Access mode requested when a picker is needed
   * @returns Handle retained for future reads after successful selection
   */
  private async resolveRootHandle(
    mode: NonNullable<ReadOptions['mode']>
  ): Promise<FileSystemDirectoryHandle> {
    if (this.rootHandle) {
      return this.rootHandle;
    }

    this.pendingPick ??= this.pickDirectory(mode);

    try {
      this.rootHandle = await this.pendingPick;
      return this.rootHandle;
    } finally {
      this.pendingPick = undefined;
    }
  }

  /**
   * Opens the native directory picker and returns the selected handle
   * @param mode Access mode requested by the read that opens the picker
   * @returns Directory handle selected by the user
   */
  private async pickDirectory(
    mode: NonNullable<ReadOptions['mode']>
  ): Promise<FileSystemDirectoryHandle> {
    if (typeof window === 'undefined') {
      throw new FileTreeError(
        'read_failed',
        'Directory picking requires a browser runtime'
      );
    }

    const pickerWindow: DirectoryPickerWindow = window;

    if (!pickerWindow.showDirectoryPicker) {
      throw new FileTreeError(
        'read_failed',
        'Browser does not support showDirectoryPicker API'
      );
    }

    try {
      return await pickerWindow.showDirectoryPicker({ mode });
    } catch (error) {
      throwReadFailure(
        'read_failed',
        'Could not select a directory',
        undefined,
        error
      );
    }
  }

  /**
   * Reads scoped ignore rules and recursively converts included entries
   * @param context Context of the current read
   * @param dirHandle Directory handle to traverse
   * @param currentDirPath Tree-relative path of the directory
   * @param currentDepth Current recursion depth
   * @returns Child nodes included by the read options
   */
  private async traverseDirectory(
    context: ReadContext,
    dirHandle: FileSystemDirectoryHandle,
    currentDirPath: string,
    currentDepth: number
  ): Promise<FileNode[]> {
    if (currentDepth >= context.options.depth) {
      return [];
    }

    if (context.options.useGitignore) {
      await this.loadGitignore(context, dirHandle, currentDirPath);
    }

    const entries = await this.listEntries(context, dirHandle, currentDirPath);
    const tasks = entries.map(entry => async (): Promise<FileNode> => {
      if (entry.kind === 'directory') {
        const dirHandle = entry.handle as FileSystemDirectoryHandle;

        const node: FileNode = {
          name: entry.name,
          path: entry.path,
          kind: 'directory',
          children: await this.traverseDirectory(
            context,
            dirHandle,
            entry.path,
            currentDepth + 1
          ),
        };

        sortChildren(node.children ?? [], context.options.sort);
        return node;
      }

      return await this.buildFileNode(
        context,
        entry.handle as FileSystemFileHandle,
        entry.path
      );
    });

    return await this.executeTasks(context, tasks);
  }

  /**
   * Builds a file node from a File System Access file handle
   * @param context Context of the current read
   * @param handle Browser file handle
   * @param filePath Tree-relative file path
   * @returns File node with optional metadata
   */
  private async buildFileNode(
    context: ReadContext,
    handle: FileSystemFileHandle,
    filePath: string
  ): Promise<FileNode> {
    const node: FileNode = {
      name: handle.name,
      path: filePath,
      kind: 'file',
    };

    if (!context.options.readFileMeta) {
      return node;
    }

    try {
      const file = await handle.getFile();
      node.size = file.size;
      node.lastModified = file.lastModified;

      if (file.type) {
        node.mimeType = file.type;
      }
    } catch (error) {
      this.reportMetadataFailure(context, 'browser-directory', filePath, error);
    }

    return node;
  }

  /**
   * Loads gitignore rules from a directory handle when present
   * @param context Context of the current read
   * @param dirHandle Directory handle to inspect
   * @param dirRelPath Tree-relative directory path
   */
  private async loadGitignore(
    context: ReadContext,
    dirHandle: FileSystemDirectoryHandle,
    dirRelPath: string
  ): Promise<void> {
    const rulePath = dirRelPath ? `${dirRelPath}/.gitignore` : '.gitignore';
    let gitignoreHandle: FileSystemFileHandle;

    try {
      gitignoreHandle = await dirHandle.getFileHandle('.gitignore');
    } catch (error) {
      if (hasErrorName(error, 'NotFoundError')) {
        return;
      }

      throwReadFailure(
        'gitignore_read_failed',
        'Could not open .gitignore',
        rulePath,
        error
      );
    }

    try {
      const file = await gitignoreHandle.getFile();
      this.registerGitignoreRules(context, dirRelPath, await file.text());
    } catch (error) {
      throwReadFailure(
        'gitignore_read_failed',
        'Could not read .gitignore',
        rulePath,
        error
      );
    }
  }
}
