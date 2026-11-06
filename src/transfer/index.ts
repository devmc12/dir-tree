import { appendImportedTreeAnnotation } from '../annotations/imported';
import type { FileNode } from '../reader/types';
import { copyFileNodeFields } from '../reader/snapshot';
import { FileTreeError } from '../reader/errors';
import { createImportedTreeNode } from '../reader/importedNode';
import type { TreeAnnotationMap } from '../annotations/types';
import type {
  FileTreeVisibilityMap,
  FileTreeVisibilityMode,
} from '../tree/types';

/**
 * Date: 2026-06-07
 * Desc: Provides JSON file tree import and export helpers
 */

interface ExportedFileTreeNode extends Omit<FileNode, 'children'> {
  comment?: string;
  visibility?: FileTreeVisibilityMode;
  children?: ExportedFileTreeNode[];
}

interface ImportedFileTreeNode extends Record<string, unknown> {
  annotation?: unknown;
  children?: unknown;
  comment?: unknown;
  visibility?: unknown;
}

export interface CreateExportedFileTreeJsonOptions {
  visibility?: FileTreeVisibilityMap;
}

export interface ParsedImportedFileTreeJson {
  tree: FileNode;
  annotations: TreeAnnotationMap;
  hiddenItems: FileTreeVisibilityMap;
}

/**
 * Extracts a readable root name from an imported tree filename
 * @param filename Imported file name
 * @returns Root name without known tree export suffixes
 */
export function extractImportedFileTreeRootName(filename: string): string {
  const normalizedFilename = filename.trim().replace(/\.[^.]+$/u, '');
  const rootName = normalizedFilename.replace(
    /\.(?:ascii-tree|file-tree)$/u,
    ''
  );

  return rootName || 'file-tree';
}

/**
 * Creates a download filename for a tree export format
 * @param root Root file node, or null when no tree is loaded
 * @param format Export format determining the filename suffix
 * @returns Sanitized download filename
 */
export function createFileTreeDownloadFilename(
  root: FileNode | null,
  format: 'json' | 'full-json' | 'md' | 'txt'
): string {
  const rootName = getFileTreeRootName(root);
  const suffix = '.dir-tree';

  if (format === 'json') {
    return `${rootName}${suffix}.json`;
  }

  if (format === 'full-json') {
    return `${rootName}.full${suffix}.json`;
  }

  if (format === 'md') {
    return `${rootName}${suffix}.md`;
  }

  return `${rootName}${suffix}.txt`;
}

/**
 * Serializes a file tree with annotations and visibility into JSON
 * @param tree File tree root to export
 * @param annotations Annotation map keyed by tree path
 * @param options Optional visibility map to include in the export
 * @returns Pretty-printed JSON string
 */
export function createExportedFileTreeJson(
  tree: FileNode,
  annotations: TreeAnnotationMap = {},
  options: CreateExportedFileTreeJsonOptions = {}
): string {
  return JSON.stringify(
    createExportedFileTreeNode(tree, annotations, options.visibility),
    null,
    2
  );
}

/**
 * Parses imported JSON into a tree plus annotations and hidden items
 * @param rawText Raw JSON text to parse
 * @returns Normalized tree, extracted annotations, and visibility map
 */
export function parseImportedFileTreeJson(
  rawText: string
): ParsedImportedFileTreeJson {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawText);
  } catch (cause) {
    throw new FileTreeError(
      'invalid_tree',
      'JSON file content could not be parsed',
      { cause }
    );
  }

  const annotations: TreeAnnotationMap = {};
  const hiddenItems: FileTreeVisibilityMap = {};

  return {
    tree: normalizeImportedFileNode(
      parsedValue,
      '',
      annotations,
      hiddenItems,
      new Set()
    ),
    annotations,
    hiddenItems,
  };
}

/**
 * Converts a file node into its exported JSON shape
 * @param node File node to export
 * @param annotations Annotation map keyed by path
 * @param visibility Visibility map keyed by path
 * @returns Structural data plus any annotations and visibility
 */
function createExportedFileTreeNode(
  node: FileNode,
  annotations: TreeAnnotationMap,
  visibility: FileTreeVisibilityMap = {}
): ExportedFileTreeNode {
  const exportedNode: ExportedFileTreeNode = copyFileNodeFields(node);
  const annotationText = annotations[node.path]?.comment?.trim();
  const visibilityMode = visibility[node.path];

  if (annotationText) {
    exportedNode.comment = annotationText;
  }

  if (visibilityMode) {
    exportedNode.visibility = visibilityMode;
  }

  if (node.children) {
    exportedNode.children = node.children.map(child =>
      createExportedFileTreeNode(child, annotations, visibility)
    );
  }

  return exportedNode;
}

/**
 * Normalizes one imported JSON value into a file node
 * @param value Raw imported node value
 * @param parentPath Parent tree path
 * @param annotations Annotation map updated with imported comments
 * @param visibility Visibility map updated with imported visibility
 * @param paths Paths already claimed in this import
 * @returns Normalized file node
 */
function normalizeImportedFileNode(
  value: unknown,
  parentPath: string,
  annotations: TreeAnnotationMap,
  visibility: FileTreeVisibilityMap,
  paths: Set<string>
): FileNode {
  if (!isRecordValue(value)) {
    throw new FileTreeError(
      'invalid_tree',
      'JSON file content is not a valid file tree object'
    );
  }

  const importedNode = value as ImportedFileTreeNode;
  const name = getOptionalStringField(importedNode, 'name')?.trim();
  const kind = importedNode.kind;

  if (!name) {
    throw new FileTreeError(
      'invalid_tree',
      'A node in the JSON file is missing a valid name'
    );
  }

  if (kind !== 'file' && kind !== 'directory') {
    throw new FileTreeError(
      'invalid_tree',
      `A node in the JSON file has an invalid kind: ${String(kind)}`
    );
  }

  const nextNode = createImportedTreeNode(paths, name, kind, parentPath);
  const children = importedNode.children;

  if (children !== undefined && !Array.isArray(children)) {
    throw new FileTreeError(
      'invalid_tree',
      'A node children field must be an array',
      { path: nextNode.path }
    );
  }

  if (kind === 'file' && children?.length) {
    throw new FileTreeError(
      'invalid_tree',
      'A file node cannot contain children',
      { path: nextNode.path }
    );
  }

  if (typeof importedNode.size === 'number') {
    nextNode.size = importedNode.size;
  }

  if (typeof importedNode.lastModified === 'number') {
    nextNode.lastModified = importedNode.lastModified;
  }

  if (typeof importedNode.mimeType === 'string') {
    nextNode.mimeType = importedNode.mimeType;
  }

  appendImportedTreeAnnotation(
    annotations,
    nextNode.path,
    getImportedNodeComment(importedNode)
  );
  appendImportedTreeVisibility(visibility, nextNode, importedNode.visibility);

  if (kind === 'directory') {
    nextNode.children = (children ?? []).map(child =>
      normalizeImportedFileNode(
        child,
        nextNode.path,
        annotations,
        visibility,
        paths
      )
    );
  }

  return nextNode;
}

/**
 * Reads comment text from supported imported node fields
 * @param node Imported JSON node
 * @returns Comment text, or null when absent
 */
function getImportedNodeComment(node: ImportedFileTreeNode): string | null {
  if (typeof node.comment === 'string') {
    return node.comment;
  }

  if (typeof node.annotation === 'string') {
    return node.annotation;
  }

  return null;
}

/**
 * Adds imported visibility only when it is valid for the node
 * @param visibility Visibility map keyed by path
 * @param node Imported file node
 * @param value Raw visibility value
 */
function appendImportedTreeVisibility(
  visibility: FileTreeVisibilityMap,
  node: FileNode,
  value: unknown
): void {
  if (value === 'hidden') {
    visibility[node.path] = value;
    return;
  }

  if (value === 'children-hidden' && node.kind === 'directory') {
    visibility[node.path] = value;
  }
}

/**
 * Reads an optional string field from an imported record
 * @param value Record to inspect
 * @param key Field name
 * @returns String value, or undefined when absent
 */
function getOptionalStringField(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined;
}

/**
 * Resolves a sanitized root name for export filenames
 * @param root Root file node, or null
 * @returns Sanitized root name
 */
function getFileTreeRootName(root: FileNode | null): string {
  const fallbackName =
    root?.name || root?.path.split('/').filter(Boolean).at(-1) || 'file-tree';

  return sanitizeTransferFilenamePart(fallbackName);
}

/**
 * Replaces filename-invalid characters and trims unsafe suffixes
 * @param value Raw filename part
 * @returns Safe filename part with a fallback when empty
 */
function sanitizeTransferFilenamePart(value: string): string {
  const invalidFilenameCharacters = new Set([
    '<',
    '>',
    ':',
    '"',
    '/',
    '\\',
    '|',
    '?',
    '*',
  ]);
  const sanitizedValue = Array.from(value.trim())
    .map(character => {
      const codePoint = character.codePointAt(0) ?? 0;

      return codePoint <= 0x1f || invalidFilenameCharacters.has(character)
        ? '-'
        : character;
    })
    .join('')
    .replace(/[. ]+$/u, '');

  return sanitizedValue || 'file-tree';
}

/**
 * Checks whether a value is a record-like imported JSON object
 * @param value Value to test
 * @returns True when the value can be read as a record
 */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
