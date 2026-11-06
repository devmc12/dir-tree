import type { FileNode } from '../reader/types';

/**
 * Date: 2026-11-07
 * Desc: Defines file tree operations and visibility types
 */

export interface FileTreeReadStats {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  duration: number;
}

export interface FileNodeLocation {
  node: FileNode;
  parent: FileNode | null;
  index: number;
}

export interface FileTreeMoveTarget {
  parentPath: string;
  childIndex: number | null;
}

export interface FileTreeMoveResult {
  tree: FileNode;
  fromPath: string;
  toPath: string;
}

export interface FileTreeRenameResult {
  tree: FileNode;
  fromPath: string;
  toPath: string;
}

export interface FileTreeCreateOptions {
  name: string;
  kind: 'file' | 'directory';
}

export interface FileTreeCreateResult {
  tree: FileNode;
  path: string;
  parentPath: string;
}

export type FileTreeVisibilityMode = 'hidden' | 'children-hidden';

export type FileTreeVisibilityMap = Record<string, FileTreeVisibilityMode>;
