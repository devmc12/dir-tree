import type { FileNode } from '../reader/types';
import { cloneFileNode, findFileNodeLocation } from './traversal';
import { filterNestedFileTreePaths, buildFileTreeChildPath } from './path';
import type {
  FileTreeCreateOptions,
  FileTreeCreateResult,
  FileTreeMoveTarget,
  FileTreeMoveResult,
  FileTreeRenameResult,
} from './types';

/**
 * Date: 2026-11-07
 * Desc: Applies immutable file tree edits
 */

/**
 * Removes one node from a cloned tree
 * @param root Source tree root
 * @param targetPath Path of the node to remove
 * @returns Updated tree, or null when removing the root or a missing node
 */
export function removeFileTreeNode(
  root: FileNode,
  targetPath: string
): FileNode | null {
  if (root.path === targetPath) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target?.parent?.children) {
    return null;
  }

  target.parent.children.splice(target.index, 1);
  return nextRoot;
}

/**
 * Removes multiple nodes from a cloned tree while ignoring nested duplicates
 * @param root Source tree root
 * @param targetPaths Paths of nodes to remove
 * @returns Updated tree, null when the root is removed, or a clone when nothing is removed
 */
export function removeFileTreeNodes(
  root: FileNode,
  targetPaths: string[]
): FileNode | null {
  const removalPaths = filterNestedFileTreePaths(targetPaths);

  if (removalPaths.length === 0) {
    return cloneFileNode(root);
  }

  if (removalPaths.includes(root.path)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const removalIndexGroups = new Map<FileNode, number[]>();

  removalPaths.forEach(path => {
    const target = findFileNodeLocation(nextRoot, path);

    if (!target?.parent?.children) {
      return;
    }

    const indices = removalIndexGroups.get(target.parent) ?? [];

    indices.push(target.index);
    removalIndexGroups.set(target.parent, indices);
  });

  removalIndexGroups.forEach((indices, parent) => {
    indices
      .slice()
      .sort((leftIndex, rightIndex) => rightIndex - leftIndex)
      .forEach(index => {
        parent.children?.splice(index, 1);
      });
  });

  return nextRoot;
}

/**
 * Creates a file or directory next to or inside the target node
 * @param root Source tree root
 * @param targetPath Target node path used to choose insertion location
 * @param options New node name and kind
 * @returns Creation result with updated tree and path, or null when invalid
 */
export function createFileTreeNode(
  root: FileNode,
  targetPath: string,
  options: FileTreeCreateOptions
): FileTreeCreateResult | null {
  const normalizedName = options.name.trim();

  if (!isValidFileNodeName(normalizedName)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target) {
    return null;
  }

  const parentNode =
    target.node.kind === 'directory' ? target.node : target.parent;

  if (!parentNode || parentNode.kind !== 'directory') {
    return null;
  }

  if (hasFileNodeNameConflict(parentNode, normalizedName, '')) {
    return null;
  }

  const nextPath = buildFileTreeChildPath(parentNode.path, normalizedName);
  const nextNode: FileNode =
    options.kind === 'directory'
      ? {
          name: normalizedName,
          path: nextPath,
          kind: 'directory',
          children: [],
        }
      : {
          name: normalizedName,
          path: nextPath,
          kind: 'file',
        };
  const children = parentNode.children ?? (parentNode.children = []);

  if (target.node.kind === 'directory') {
    children.push(nextNode);
  } else {
    children.splice(target.index + 1, 0, nextNode);
  }

  return {
    tree: nextRoot,
    path: nextPath,
    parentPath: parentNode.path,
  };
}

/**
 * Moves a node into a target parent at an optional child index
 * @param root Source tree root
 * @param dragPath Path of the node being moved
 * @param target Destination parent path and insertion index
 * @returns Move result with updated tree and paths, or null when invalid
 */
export function moveFileTreeNode(
  root: FileNode,
  dragPath: string,
  target: FileTreeMoveTarget
): FileTreeMoveResult | null {
  const nextRoot = cloneFileNode(root);
  const source = findFileNodeLocation(nextRoot, dragPath);

  if (!source?.parent?.children || source.node.path === nextRoot.path) {
    return null;
  }

  const targetParent = findFileNodeLocation(nextRoot, target.parentPath);

  if (!targetParent || targetParent.node.kind !== 'directory') {
    return null;
  }

  if (
    targetParent.node.path === source.node.path ||
    targetParent.node.path.startsWith(`${source.node.path}/`) ||
    hasFileNodeNameConflict(targetParent.node, source.node.name, dragPath)
  ) {
    return null;
  }

  const movedNode = source.parent.children.splice(source.index, 1)[0];

  if (!movedNode) {
    return null;
  }

  const targetChildren =
    targetParent.node.children ?? (targetParent.node.children = []);
  let insertIndex =
    target.childIndex === null ? targetChildren.length : target.childIndex;

  if (
    target.childIndex !== null &&
    source.parent.path === targetParent.node.path &&
    source.index < insertIndex
  ) {
    insertIndex -= 1;
  }

  insertIndex = Math.max(0, Math.min(insertIndex, targetChildren.length));
  targetChildren.splice(insertIndex, 0, movedNode);

  const nextPath = buildFileTreeChildPath(
    targetParent.node.path,
    movedNode.name
  );

  updateFileNodePath(movedNode, nextPath);

  return {
    tree: nextRoot,
    fromPath: dragPath,
    toPath: nextPath,
  };
}

/**
 * Renames a node and remaps all descendant paths
 * @param root Source tree root
 * @param targetPath Path of the node to rename
 * @param nextName Requested new node name
 * @returns Rename result with updated tree and paths, or null when invalid
 */
export function renameFileTreeNode(
  root: FileNode,
  targetPath: string,
  nextName: string
): FileTreeRenameResult | null {
  const normalizedName = nextName.trim();

  if (!isValidFileNodeName(normalizedName)) {
    return null;
  }

  const nextRoot = cloneFileNode(root);
  const target = findFileNodeLocation(nextRoot, targetPath);

  if (!target) {
    return null;
  }

  if (
    hasFileNodeNameConflict(target.parent, normalizedName, target.node.path)
  ) {
    return null;
  }

  if (target.node.name === normalizedName) {
    return {
      tree: nextRoot,
      fromPath: targetPath,
      toPath: targetPath,
    };
  }

  target.node.name = normalizedName;

  const nextPath = target.parent
    ? buildFileTreeChildPath(target.parent.path, normalizedName)
    : normalizedName;

  updateFileNodePath(target.node, nextPath);

  return {
    tree: nextRoot,
    fromPath: targetPath,
    toPath: nextPath,
  };
}

/**
 * Updates a node path and all descendant paths in place
 * @param node Node whose path changed
 * @param nextPath New path for the node
 */
function updateFileNodePath(node: FileNode, nextPath: string): void {
  node.path = nextPath;
  node.children?.forEach(child => {
    updateFileNodePath(child, buildFileTreeChildPath(nextPath, child.name));
  });
}

/**
 * Checks whether a node name is non-empty and single-segment
 * @param name Candidate node name
 * @returns True when the name can be used in a tree path
 */
function isValidFileNodeName(name: string): boolean {
  return name.length > 0 && !name.includes('/');
}

/**
 * Checks whether a parent already contains the requested child name
 * @param parent Parent node to inspect
 * @param nextName Requested child name
 * @param currentPath Existing node path allowed to keep the same name
 * @returns True when another sibling already has the requested name
 */
function hasFileNodeNameConflict(
  parent: FileNode | null,
  nextName: string,
  currentPath: string
): boolean {
  return (
    parent?.children?.some(
      child => child.name === nextName && child.path !== currentPath
    ) ?? false
  );
}
