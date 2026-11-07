import type { FileNode } from './types';
import { FileTreeError } from './errors';
import { buildFileTreeChildPath, isValidFileNodeName } from '../tree/path';

/**
 * Date: 2026-11-07
 * Desc: Enforces structural node invariants across tree import formats
 */

/**
 * Registers a normalized node before annotations or visibility are recorded
 * @param paths Paths already claimed in this import
 * @param name Normalized single-segment name
 * @param kind File or directory
 * @param parentPath Path of the normalized parent, or empty for a root
 * @param line One-based source line when known
 * @returns A new structural node with a unique path
 * @throws FileTreeError for an invalid name or a duplicate path
 */
export function createImportedTreeNode(
  paths: Set<string>,
  name: string,
  kind: FileNode['kind'],
  parentPath = '',
  line?: number
): FileNode {
  const path = buildFileTreeChildPath(parentPath, name);
  const location = { path, ...(line === undefined ? {} : { line }) };

  // Path segments are structural; platform-specific filename rules stay with each format
  if (!isValidFileNodeName(name)) {
    throw new FileTreeError(
      'invalid_tree',
      'An imported node must have a single valid path segment',
      location
    );
  }

  if (paths.has(path)) {
    throw new FileTreeError(
      'duplicate_tree_path',
      `Duplicate tree path: ${path}`,
      location
    );
  }

  paths.add(path);

  return { name, path, kind };
}
