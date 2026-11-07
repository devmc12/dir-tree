/**
 * Date: 2026-11-07
 * Desc: Builds and compares tree-relative paths
 */

/**
 * Checks a logical path segment without imposing platform-specific filename rules
 */
export function isValidFileNodeName(name: string): boolean {
  return (
    name.trim().length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\0')
  );
}

/**
 * Returns the parent path of a tree path
 * @param path Tree path to inspect
 * @returns Parent path, or an empty string for top-level paths
 */
export function getParentPath(path: string): string {
  const slashIndex = path.lastIndexOf('/');

  return slashIndex === -1 ? '' : path.substring(0, slashIndex);
}

/**
 * Builds a child path from a parent path and node name
 * @param parentPath Parent tree path
 * @param name Child node name
 * @returns Joined child path
 */
export function buildFileTreeChildPath(
  parentPath: string,
  name: string
): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

/**
 * Rewrites a path from one prefix to another
 * @param path Path to remap
 * @param prevPrefix Existing prefix to replace
 * @param nextPrefix Replacement prefix
 * @returns Remapped path, or the original path when outside the prefix
 */
export function remapFileTreePathPrefix(
  path: string,
  prevPrefix: string,
  nextPrefix: string
): string {
  if (prevPrefix === '') {
    if (path === '') {
      return nextPrefix;
    }

    return nextPrefix ? `${nextPrefix}/${path}` : path;
  }

  if (path === prevPrefix) {
    return nextPrefix;
  }

  if (!path.startsWith(`${prevPrefix}/`)) {
    return path;
  }

  return `${nextPrefix}${path.slice(prevPrefix.length)}`;
}

/**
 * Checks whether a path is equal to or nested under a prefix
 * @param path Path to test
 * @param prefix Prefix path
 * @returns True when the path is within the prefix
 */
export function isFileTreePathWithin(path: string, prefix: string): boolean {
  if (prefix === '') {
    return true;
  }

  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Removes paths that are already covered by selected ancestor paths
 * @param paths Candidate tree paths
 * @returns Top-level non-overlapping paths
 */
export function filterNestedFileTreePaths(paths: string[]): string[] {
  const topLevelPaths: string[] = [];
  const uniquePaths = Array.from(new Set(paths)).sort((leftPath, rightPath) => {
    const depthDelta = leftPath.split('/').length - rightPath.split('/').length;

    return depthDelta === 0 ? leftPath.localeCompare(rightPath) : depthDelta;
  });

  uniquePaths.forEach(path => {
    if (
      topLevelPaths.some(topLevelPath =>
        isFileTreePathWithin(path, topLevelPath)
      )
    ) {
      return;
    }

    topLevelPaths.push(path);
  });

  return topLevelPaths;
}
