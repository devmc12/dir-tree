/**
 * Date: 2026-06-07
 * Desc: Defines shared file tree and reader option types
 */

// Separately bundled entries share this key only while the metadata shape is compatible
export const fileTreeMetadataKey = Symbol.for('@devmc12/dir-tree/metadata/v2');

export interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
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

export interface ZipEntry {
  name: string;
  // ZIP decoder key when legacy bytes or Unicode path fields change the display name
  contentKey?: string;
  isDir: boolean;
  localOffset: number;
}
