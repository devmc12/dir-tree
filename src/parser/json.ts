import { createPathMap } from '../tree/records';
import type { ParsedImportedTree } from './types';
import { FileTreeError } from '../reader/errors';
import type { TreeAnnotationMap } from '../annotations/types';
import { createImportedTreeNode } from '../reader/importedNode';
import type { FileNode } from '../reader/types';
import { sanitizeNodeName } from './entries';
import { appendImportedTreeAnnotation } from '../annotations/imported';

/**
 * Date: 2026-11-07
 * Desc: Normalizes JSON tree documents and node fields
 */

interface ImportedJsonNode extends Record<string, unknown> {
  children?: unknown;
  contents?: unknown;
}

/**
 * Detects whether text looks like a JSON tree document
 * @param rawText Raw imported text
 * @returns True when the text begins with a JSON object or array
 */
export function isImportedTreeJsonText(rawText: string): boolean {
  const trimmedText = rawText.trimStart();

  return trimmedText.startsWith('{') || trimmedText.startsWith('[');
}

/**
 * Parses a JSON tree document into a file tree and annotations
 * @param rawText Raw JSON tree text
 * @param fallbackRootName Root name used when nodes omit one
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedTreeJson(
  rawText: string,
  fallbackRootName: string
): ParsedImportedTree {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawText);
  } catch (cause) {
    throw new FileTreeError(
      'invalid_tree',
      'JSON content could not be parsed',
      { cause }
    );
  }

  const rootCandidates = Array.isArray(parsedValue)
    ? parsedValue
    : isRecordValue(parsedValue)
      ? [parsedValue]
      : [];

  if (rootCandidates.length === 0) {
    throw new FileTreeError(
      'invalid_tree',
      'JSON content does not contain recognizable tree nodes'
    );
  }

  const annotations: TreeAnnotationMap = createPathMap();
  const paths = new Set<string>();

  if (rootCandidates.length === 1) {
    return {
      tree: normalizeImportedJsonNode(
        rootCandidates[0],
        fallbackRootName,
        '',
        annotations,
        paths
      ),
      annotations,
    };
  }

  const tree = createImportedTreeNode(paths, fallbackRootName, 'directory');
  tree.children = rootCandidates.map(candidate =>
    normalizeImportedJsonNode(
      candidate,
      fallbackRootName,
      tree.path,
      annotations,
      paths
    )
  );

  return { tree, annotations };
}

/**
 * Normalizes a raw JSON value into a file node and collects annotations
 * @param value Raw JSON node value
 * @param fallbackRootName Root name used when the node omits one
 * @param parentPath Path of the parent node
 * @param annotations Annotation map updated with extracted comments
 * @param paths Paths already claimed in this import
 * @returns Normalized file node
 */
function normalizeImportedJsonNode(
  value: unknown,
  fallbackRootName: string,
  parentPath: string,
  annotations: TreeAnnotationMap,
  paths: Set<string>
): FileNode {
  if (!isRecordValue(value)) {
    throw new FileTreeError('invalid_tree', 'JSON tree nodes must be objects', {
      path: parentPath,
    });
  }

  const importedNode = value as ImportedJsonNode;
  const rawName =
    getOptionalStringField(importedNode, ['name', 'label', 'path']) ??
    fallbackRootName;
  const name = sanitizeNodeName(rawName, fallbackRootName);
  const rawChildren = getOptionalArrayField(importedNode, [
    'contents',
    'children',
  ]);
  const rawKind =
    getOptionalStringField(importedNode, ['type', 'kind'])?.toLowerCase() ?? '';
  const kind: FileNode['kind'] =
    rawKind !== 'file' &&
    (rawKind === 'directory' || rawKind === 'dir' || rawChildren !== undefined)
      ? 'directory'
      : 'file';
  const node = createImportedTreeNode(paths, name, kind, parentPath);

  if (
    rawChildren === undefined &&
    (importedNode.contents !== undefined || importedNode.children !== undefined)
  ) {
    throw new FileTreeError(
      'invalid_tree',
      'A node children field must be an array',
      { path: node.path }
    );
  }

  if (kind === 'file' && rawChildren?.length) {
    throw new FileTreeError(
      'invalid_tree',
      'A file node cannot contain children',
      { path: node.path }
    );
  }

  if (typeof importedNode.size === 'number') {
    node.size = importedNode.size;
  }

  if (typeof importedNode.lastModified === 'number') {
    node.lastModified = importedNode.lastModified;
  }

  if (typeof importedNode.mimeType === 'string') {
    node.mimeType = importedNode.mimeType;
  }

  appendImportedTreeAnnotation(
    annotations,
    node.path,
    getOptionalStringField(importedNode, ['comment', 'annotation']) ?? null
  );

  if (kind === 'directory') {
    node.children = (rawChildren ?? []).map(child =>
      normalizeImportedJsonNode(
        child,
        fallbackRootName,
        node.path,
        annotations,
        paths
      )
    );
  }

  return node;
}

/**
 * Returns the first string field found on a record
 * @param value Record to inspect
 * @param keys Candidate field names in priority order
 * @returns String field value, or undefined when none match
 */
function getOptionalStringField(
  value: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === 'string') {
      return value[key];
    }
  }

  return undefined;
}

/**
 * Returns the first array field found on a record
 * @param value Record to inspect
 * @param keys Candidate field names in priority order
 * @returns Array field value, or undefined when none match
 */
function getOptionalArrayField(
  value: Record<string, unknown>,
  keys: string[]
): unknown[] | undefined {
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return undefined;
}

/**
 * Checks whether a value is a plain object-like record
 * @param value Value to test
 * @returns True when the value can be read as a record
 */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
