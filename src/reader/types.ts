/**
 * Date: 2026-06-07
 * Desc: Defines shared file tree and reader option types
 */

// Separately bundled entries share this key only while the metadata shape is compatible
export const fileTreeMetadataKey = Symbol.for('@devmc12/dir-tree/metadata/v2');

export interface FileNode {
  name: string;
  /** Slash-separated logical path including the tree root */
  path: string;
  kind: 'file' | 'directory';
  /** Size in bytes when available */
  size?: number;
  /** Modification time in milliseconds since the Unix epoch when available */
  lastModified?: number;
  mimeType?: string;
  children?: FileNode[];
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

export interface ReadWarning {
  code: 'metadata_unavailable';
  source: 'node' | 'browser-directory' | 'browser-drop';
  operation: 'read_metadata';
  path: string;
}

export interface ReadOptions {
  /** Maximum child depth from the root at depth 0; defaults to no limit */
  depth?: number;
  sort?: SortOptions;
  /** Exclude patterns; an empty array overrides a constructor default list */
  exclude?: string[];
  showHidden?: boolean;
  useGitignore?: boolean;
  readFileMeta?: boolean;
  /** Per-read filesystem I/O limit; false is sequential, true uses 20 */
  concurrency?:
    | boolean
    | {
        limit?: number;
      };
  /** Access mode for the first native directory pick */
  mode?: 'read' | 'readwrite';
  /** Synchronous callback for optional metadata failures on retained nodes */
  onWarning?: (warning: ReadWarning) => void;
}

export interface GitignoreRule {
  negate: boolean;
  regex: RegExp;
  directoryOnly?: boolean;
}

export interface Entry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  handle: unknown;
}
