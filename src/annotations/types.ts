import type { MonospacePaddingMode } from '../ascii/utils';
import type { FileNode } from '../reader/types';

/**
 * Date: 2026-06-08
 * Desc: Defines public annotation types and constants
 */

export type TreeAnnotationSource = 'manual' | 'ai';
export type TreeAnnotationSyncStatus = 'local' | 'synced';
export type TreeAnnotationAlignmentMode =
  | 'smart-column'
  | 'whole-tree'
  | 'folder-groups'
  | 'inline';

// Supported annotation prefixes for imported and rendered comments
export const TREE_ANNOTATION_COMMENT_PREFIXES = ['#', '//', ';', '--'] as const;
export type TreeAnnotationCommentPrefix =
  (typeof TREE_ANNOTATION_COMMENT_PREFIXES)[number];

// Supported layout modes for aligning rendered tree annotations
export const TREE_ANNOTATION_ALIGNMENT_MODES = [
  'smart-column',
  'whole-tree',
  'folder-groups',
  'inline',
] as const satisfies TreeAnnotationAlignmentMode[];

// Default alignment mode used when annotation render options omit one
export const DEFAULT_TREE_ANNOTATION_ALIGNMENT_MODE =
  TREE_ANNOTATION_ALIGNMENT_MODES[0];

// Default column used when annotation alignment options omit a target column
export const DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN = 40;

// Minimum visible gap used by inline rendering and smart fallback alignment
export const TREE_ANNOTATION_INLINE_GAP = 2;

// Lower bound for configurable annotation columns
export const MIN_TREE_ANNOTATION_COMMENT_COLUMN = TREE_ANNOTATION_INLINE_GAP;

// Upper bound for configurable annotation columns
export const MAX_TREE_ANNOTATION_COMMENT_COLUMN = 96;

// Default comment prefix used when no annotation template is provided
export const DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX =
  TREE_ANNOTATION_COMMENT_PREFIXES[0];

// Placeholder replaced by the annotation text inside templates
export const TREE_ANNOTATION_TEMPLATE_PLACEHOLDER = '%comment%';

// Tab width used when annotation padding is rendered with tabs
export const TREE_ANNOTATION_TAB_WIDTH = 4;

export interface TreeAnnotation {
  path: string;
  comment: string;
  source: TreeAnnotationSource;
  syncStatus: TreeAnnotationSyncStatus;
  updatedAt: number;
}

export type TreeAnnotationMap = Record<string, TreeAnnotation>;
export type TreeAnnotationRetentionMode = 'reset' | 'matching-paths';

export interface TreeAnnotationPatch {
  path: string;
  comment: string;
  source?: TreeAnnotationSource;
  syncStatus?: TreeAnnotationSyncStatus;
  updatedAt?: number;
}

export interface AnnotatedAsciiTreeRenderOptions {
  alignmentMode?: TreeAnnotationAlignmentMode;
  commentPrefix?: string;
  gap?: number;
  gapPaddingMode?: MonospacePaddingMode;
  rootCommentOffset?: number;
  commentColumn?: number;
  commentTemplate?: string;
}

export interface AnnotatedAsciiTreeRenderOptionsConfig {
  alignmentMode?: TreeAnnotationAlignmentMode;
  commentColumn?: number;
  commentPrefix?: TreeAnnotationCommentPrefix | string;
  commentPrefixHasSpace?: boolean;
  commentTemplate?: string;
  gap?: number;
  gapPaddingMode?: MonospacePaddingMode;
  rootCommentOffset?: number;
}

export interface ParsedAnnotatedAsciiTreeResult {
  patches: TreeAnnotationPatch[];
  ignoredLineNumbers: number[];
}

export interface AnnotationRequestPayload {
  language?: string;
  nodes: AnnotationRequestNode[];
  overwrite?: boolean;
  prompt?: string;
  scope?: AnnotationProviderScope;
  target?: AnnotationProviderTarget;
}

export interface AnnotationRequestNode {
  comment?: string;
  kind: 'directory' | 'file';
  path: string;
}

export interface AnnotationProviderResult {
  annotations: TreeAnnotationPatch[];
}

export interface AnnotationProvider {
  annotate: (
    payload: AnnotationRequestPayload,
    signal?: AbortSignal
  ) => Promise<AnnotationProviderResult>;
}

// Provider request scopes supported by headless annotation payload helpers
export const ANNOTATION_PROVIDER_SCOPES = [
  'visible',
  'unannotated',
  'selection',
  'all',
] as const;
export type AnnotationProviderScope =
  (typeof ANNOTATION_PROVIDER_SCOPES)[number];

// Provider request targets supported by headless annotation payload helpers
export const ANNOTATION_PROVIDER_TARGETS = [
  'all',
  'directories',
  'files',
] as const;
export type AnnotationProviderTarget =
  (typeof ANNOTATION_PROVIDER_TARGETS)[number];

export interface CreateAnnotationProviderRequestOptions {
  annotations?: TreeAnnotationMap;
  language?: string;
  overwrite?: boolean;
  prompt?: string;
  scope?: AnnotationProviderScope;
  selectedPaths?: string[];
  target?: AnnotationProviderTarget;
  tree: FileNode;
  visibleTree?: FileNode | null;
}

export interface AnnotationProviderRequest {
  allowedPaths: Set<string>;
  nodeCount: number;
  payload: AnnotationRequestPayload;
  sourcePaths: Set<string>;
}

export type AnnotationDiffReason =
  | 'outside-scope'
  | 'empty-comment'
  | 'unchanged';
export type AnnotationDiffGroupKey = 'added' | 'updated' | 'skipped';

export interface AnnotationDiffEntry {
  path: string;
  previousComment: string;
  nextComment: string;
  reason?: AnnotationDiffReason;
}

export interface AnnotationDiffResult {
  added: AnnotationDiffEntry[];
  updated: AnnotationDiffEntry[];
  skipped: AnnotationDiffEntry[];
  applyPatches: TreeAnnotationPatch[];
  baseAnnotations: TreeAnnotationMap;
  nextAnnotations: TreeAnnotationMap;
}

export interface EditedAsciiAnnotationDiffEntry {
  id: string;
  lineNumber: number;
  nextComment: string;
  path: string;
  previousComment: string;
}

export interface IgnoredEditedAsciiAnnotationLine {
  id: string;
  lineNumber: number;
  rawLine: string;
}

export interface EditedAsciiAnnotationDiffResult {
  added: EditedAsciiAnnotationDiffEntry[];
  applyPatches: TreeAnnotationPatch[];
  ignored: IgnoredEditedAsciiAnnotationLine[];
  ignoredLineNumbers: number[];
  parsedLineCount: number;
  removed: EditedAsciiAnnotationDiffEntry[];
  updated: EditedAsciiAnnotationDiffEntry[];
}
