import type { FileNode, ReadOptions } from '../../reader/types';
import {
  attachFileTreeMetadata,
  getParentPath,
  isPathExcluded,
  pruneAndSortTree,
} from '../../reader/utils';
import {
  normalizeRemoteRepositoryPath,
  splitRemoteRepositoryPath,
} from './path';
import type {
  RemoteRepositoryEntry,
  RemoteRepositoryMapEntriesOptions,
} from './types';

/**
 * Date: 2026-06-07
 * Desc: Maps remote repository entries into FileNode trees
 */

/**
 * Maps remote repository entries into a pruned and sorted FileNode tree
 * @param options Entries, read options, root name, and optional subpath
 * @returns Directory tree rooted at the provided root name
 */
export function mapRemoteRepositoryEntriesToFileTree(
  options: RemoteRepositoryMapEntriesOptions
): FileNode {
  const normalizedSubPath = normalizeRemoteRepositoryPath(
    options.subPath ?? ''
  );
  const readOptions = options.readOptions ?? {};
  const root: FileNode = {
    name: options.rootName,
    path: options.rootName,
    kind: 'directory',
    children: [],
  };
  const nodeMap = new Map<string, FileNode>();

  nodeMap.set(root.path, root);

  options.entries.forEach(entry => {
    const entryPath = normalizeRemoteRepositoryPath(entry.path);
    const relativePath = getRemoteRepositoryEntryRelativePath(
      entryPath,
      normalizedSubPath
    );

    if (relativePath === null || relativePath === '') {
      return;
    }

    const fullPath = `${root.path}/${relativePath}`;

    if (shouldSkipRemoteRepositoryEntry(relativePath, fullPath, readOptions)) {
      return;
    }

    if (entry.kind === 'directory') {
      getOrCreateRemoteRepositoryDirectory(fullPath, nodeMap, root);
      return;
    }

    appendRemoteRepositoryFileNode(entry, fullPath, nodeMap, root, readOptions);
  });

  pruneAndSortTree(root, 0, readOptions.depth ?? Infinity, readOptions.sort);
  attachFileTreeMetadata(root);

  return root;
}

/**
 * Adds a remote repository file entry to the tree
 * @param entry Remote repository file entry
 * @param fullPath Tree-relative file path under the root
 * @param nodeMap Directory lookup keyed by path
 * @param root Root directory node
 * @param readOptions Read options controlling metadata retention
 */
function appendRemoteRepositoryFileNode(
  entry: RemoteRepositoryEntry,
  fullPath: string,
  nodeMap: Map<string, FileNode>,
  root: FileNode,
  readOptions: ReadOptions
): void {
  const parentPath = getParentPath(fullPath);
  const parentNode = getOrCreateRemoteRepositoryDirectory(
    parentPath,
    nodeMap,
    root
  );
  const fileNode: FileNode = {
    name: fullPath.substring(parentPath.length + 1),
    path: fullPath,
    kind: 'file',
  };

  if (readOptions.readFileMeta && entry.size !== undefined) {
    fileNode.size = entry.size;
  }

  parentNode.children?.push(fileNode);
}

/**
 * Resolves an entry path relative to the requested subpath
 * @param entryPath Normalized entry path from the provider
 * @param subPath Normalized subpath the tree is rooted at
 * @returns Relative path, an empty string for the subpath itself, or null when outside the subpath
 */
function getRemoteRepositoryEntryRelativePath(
  entryPath: string,
  subPath: string
): string | null {
  if (!subPath) {
    return entryPath;
  }

  if (entryPath === subPath) {
    return '';
  }

  return entryPath.startsWith(`${subPath}/`)
    ? entryPath.slice(subPath.length + 1)
    : null;
}

/**
 * Checks whether a remote repository entry should be skipped
 * @param relativePath Path relative to the requested subpath
 * @param fullPath Tree-relative path under the root
 * @param readOptions Read options controlling hidden and exclude behavior
 * @returns True when the entry should be omitted
 */
function shouldSkipRemoteRepositoryEntry(
  relativePath: string,
  fullPath: string,
  readOptions: ReadOptions
): boolean {
  if (
    !(readOptions.showHidden ?? false) &&
    splitRemoteRepositoryPath(relativePath).some(segment =>
      segment.startsWith('.')
    )
  ) {
    return true;
  }

  return isPathExcluded(fullPath, readOptions.exclude ?? []);
}

/**
 * Finds or creates a directory node for a remote repository path
 * @param dirPath Tree-relative directory path
 * @param nodeMap Directory lookup keyed by path
 * @param root Root directory node
 * @returns Existing or newly created directory node
 */
function getOrCreateRemoteRepositoryDirectory(
  dirPath: string,
  nodeMap: Map<string, FileNode>,
  root: FileNode
): FileNode {
  const normalizedDirPath = normalizeRemoteRepositoryPath(dirPath);

  if (!normalizedDirPath || normalizedDirPath === root.path) {
    return root;
  }

  const cachedNode = nodeMap.get(normalizedDirPath);

  if (cachedNode) {
    return cachedNode;
  }

  const parentPath = getParentPath(normalizedDirPath);
  const parentNode = getOrCreateRemoteRepositoryDirectory(
    parentPath,
    nodeMap,
    root
  );
  const directoryNode: FileNode = {
    name: normalizedDirPath.substring(parentPath.length + 1),
    path: normalizedDirPath,
    kind: 'directory',
    children: [],
  };

  parentNode.children?.push(directoryNode);
  nodeMap.set(normalizedDirPath, directoryNode);

  return directoryNode;
}
