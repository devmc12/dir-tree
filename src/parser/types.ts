import type { TreeAnnotationMap } from '../annotations/types';
import type { FileNode } from '../reader/types';

/**
 * Date: 2026-06-08
 * Desc: Defines imported tree parser public types
 */

export type ImportedTreeFormat =
  | 'auto'
  | 'ascii'
  | 'tree-html'
  | 'tree-json'
  | 'tree-xml'
  | 'markdown-list';

export interface ImportedTreeParseOptions {
  commentTemplate?: string;
  format?: ImportedTreeFormat;
}

export interface ParsedImportedTree {
  tree: FileNode;
  annotations: TreeAnnotationMap;
}
