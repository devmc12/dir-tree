import {
  type FileNode,
  type FileTreeMetadata,
  type FileTreeItem,
  fileTreeMetadataKey,
} from './types';

/**
 * Date: 2026-11-07
 * Desc: Builds, attaches, and reads file tree metadata
 */

/**
 * Formats a byte count into a human-readable size string
 * @param bytes Size in bytes
 * @returns Size formatted with a B, KB, MB, or GB unit
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Builds path-indexed metadata, folder paths, and aggregate stats for a tree
 * @param root Root file node to traverse
 * @returns File tree metadata with items, folder paths, and stats
 */
export function buildFileTreeMetadata(root: FileNode): FileTreeMetadata {
  const itemsByPath: Record<string, FileTreeItem> = {};
  const folderPaths = new Set<string>();
  const stack: FileNode[] = [root];
  let totalFiles = 0;
  let totalDirs = 0;
  let totalSize = 0;

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node) {
      continue;
    }

    const isFolder = node.kind === 'directory';
    const item: FileTreeItem = {
      index: node.path,
      data: node,
      isFolder,
    };

    if (isFolder) {
      item.children = node.children?.map(child => child.path) ?? [];
    }

    itemsByPath[node.path] = item;
    totalSize += node.size ?? 0;

    if (isFolder) {
      totalDirs += 1;
      folderPaths.add(node.path);
    } else {
      totalFiles += 1;
    }

    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
      const child = node.children?.[index];

      if (child) {
        stack.push(child);
      }
    }
  }

  return {
    itemsByPath,
    folderPaths,
    stats: {
      totalFiles,
      totalDirs,
      totalSize,
    },
  };
}

/**
 * Builds tree metadata and attaches it to the root as non-enumerable data
 * @param root Root file node to annotate
 * @returns Metadata that was attached to the root
 */
export function attachFileTreeMetadata(root: FileNode): FileTreeMetadata {
  const metadata = buildFileTreeMetadata(root);

  Object.defineProperty(root, fileTreeMetadataKey, {
    value: metadata,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  return metadata;
}

/**
 * Reads previously attached file tree metadata from a root node
 * @param root Root file node, or null or undefined
 * @returns Attached metadata, or undefined when none is present
 */
export function getFileTreeMetadata(
  root: FileNode | null | undefined
): FileTreeMetadata | undefined {
  return root?.[fileTreeMetadataKey];
}
