/**
 * Date: 2026-06-07
 * Desc: Defines shared file tree and reader option types
 */

export interface BrowserFileNodeHandle {
  source: 'legacy-file';
  file: File;
}

export interface NativeFileNodeHandle {
  source: 'file-system-file';
  handle: FileSystemFileHandle;
}

export interface NativeDirectoryNodeHandle {
  source: 'file-system-directory';
  handle: FileSystemDirectoryHandle;
}

export interface ZipFileNodeHandle {
  source: 'zip-file';
  bytes: Uint8Array;
}

export interface ZipDirectoryNodeHandle {
  source: 'zip-directory';
  entries: Record<string, Uint8Array>;
}

export interface InMemoryFileNodeHandle {
  source: 'in-memory';
}

export interface NodeFileNodeHandle {
  source: 'node-file';
  absolutePath: string;
}

export interface NodeDirectoryNodeHandle {
  source: 'node-directory';
  absolutePath: string;
}

export type FileNodeHandle =
  | BrowserFileNodeHandle
  | NativeFileNodeHandle
  | NativeDirectoryNodeHandle
  | NodeFileNodeHandle
  | NodeDirectoryNodeHandle
  | ZipFileNodeHandle
  | ZipDirectoryNodeHandle
  | InMemoryFileNodeHandle;

// Stores non-serializable file tree metadata without affecting JSON export
export const fileTreeMetadataKey = Symbol('fileTreeMetadata');

export interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  mimeType?: string;
  children?: FileNode[];
  handle?: FileNodeHandle;
  [fileTreeMetadataKey]?: FileTreeMetadata;
}

export interface FileTreeItem<TNode extends FileNode = FileNode> {
  index: string;
  data: TNode;
  children?: string[];
  isFolder: boolean;
}

export interface FileTreeStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
}

export interface FileTreeMetadata<TNode extends FileNode = FileNode> {
  itemsByPath: Record<string, FileTreeItem<TNode>>;
  folderPaths: Set<string>;
  stats: FileTreeStats;
}

export type SortBy = 'name' | 'type';
export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  sortBy: SortBy;
  order: SortOrder;
  foldersFirst: boolean;
}

export interface ReadOptions {
  depth?: number;
  sort?: SortOptions;
  exclude?: string[];
  showHidden?: boolean;
  useGitignore?: boolean;
  readFileMeta?: boolean;
  concurrency?:
    | boolean
    | {
        limit?: number;
      };
  mode?: 'read' | 'readwrite';
}

export interface GitignoreRule {
  negate: boolean;
  regex: RegExp;
}

export interface Entry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  handle: unknown;
}

export interface ZipEntry {
  name: string;
  isDir: boolean;
  localOffset: number;
}
