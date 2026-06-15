import type { FileNode } from '../reader/types';
import {
  filterNestedFileTreePaths,
  getFileTreeItems,
  isFileTreePathWithin,
} from '../tree';
import type {
  AnnotationProviderRequest,
  AnnotationProviderResult,
  AnnotationProviderTarget,
  AnnotationRequestNode,
  CreateAnnotationProviderRequestOptions,
  TreeAnnotationMap,
  TreeAnnotationPatch,
} from './types';

/**
 * Date: 2026-06-08
 * Desc: Builds annotation provider requests and normalizes provider results
 */

/**
 * Normalizes an annotation language value for provider payloads
 * @param language Optional language value from host configuration
 * @returns Trimmed language or en when omitted
 */
function normalizeAnnotationProviderLanguage(
  language: string | undefined
): string {
  return language?.trim() || 'en';
}

/**
 * Collects all paths from a provider source tree
 * @param tree Source tree to inspect
 * @returns Set of tree paths
 */
function collectAnnotationProviderTreePaths(tree: FileNode): Set<string> {
  return new Set(Object.keys(getFileTreeItems(tree)));
}

/**
 * Checks whether a node matches the requested annotation target
 * @param node File tree node to test
 * @param target Annotation target type
 * @returns True when the node should be included
 */
function isAnnotationProviderTargetNode(
  node: FileNode,
  target: AnnotationProviderTarget
): boolean {
  if (target === 'all') {
    return true;
  }

  if (target === 'directories') {
    return node.kind === 'directory';
  }

  return node.kind === 'file';
}

/**
 * Filters source paths by the requested annotation target
 * @param tree Source tree used to look up nodes
 * @param paths Candidate paths
 * @param target Annotation target type
 * @returns Paths whose nodes match the target
 */
function filterAnnotationProviderPathsByTarget(
  tree: FileNode,
  paths: Set<string>,
  target: AnnotationProviderTarget
): Set<string> {
  if (target === 'all') {
    return new Set(paths);
  }

  const treeItems = getFileTreeItems(tree);

  return new Set(
    Array.from(paths).filter(path => {
      const node = treeItems[path]?.data;

      return node ? isAnnotationProviderTargetNode(node, target) : false;
    })
  );
}

/**
 * Checks whether a path already has a non-empty annotation
 * @param annotations Annotation map keyed by path
 * @param path Path to inspect
 * @returns True when a non-empty comment exists
 */
function hasTreeAnnotation(
  annotations: TreeAnnotationMap,
  path: string
): boolean {
  return (annotations[path]?.comment.trim().length ?? 0) > 0;
}

/**
 * Collects selected paths and their descendants for provider requests
 * @param tree Full file tree
 * @param selectedPaths Selected root paths
 * @returns Paths inside the selected subtrees
 */
function collectSelectedAnnotationProviderPaths(
  tree: FileNode,
  selectedPaths: string[]
): Set<string> {
  const treePaths = Object.keys(getFileTreeItems(tree));
  const selectedRootPaths = filterNestedFileTreePaths(
    selectedPaths.filter(path => treePaths.includes(path))
  );

  return new Set(
    treePaths.filter(path =>
      selectedRootPaths.some(rootPath => isFileTreePathWithin(path, rootPath))
    )
  );
}

/**
 * Computes paths that provider results are allowed to update
 * @param sourcePaths Source paths in the current request scope
 * @param annotations Existing annotation map
 * @param overwrite Whether existing comments may be replaced
 * @returns Paths that can receive returned annotations
 */
function createAnnotationProviderAllowedPaths(
  sourcePaths: Set<string>,
  annotations: TreeAnnotationMap,
  overwrite: boolean
): Set<string> {
  if (overwrite) {
    return new Set(sourcePaths);
  }

  return new Set(
    Array.from(sourcePaths).filter(
      path => !hasTreeAnnotation(annotations, path)
    )
  );
}

/**
 * Converts a file node into a provider request node
 * @param node File tree node to include
 * @param annotations Existing annotation map
 * @returns Request node with an optional existing comment
 */
function createAnnotationProviderRequestNode(
  node: FileNode,
  annotations: TreeAnnotationMap
): AnnotationRequestNode {
  const comment = annotations[node.path]?.comment.trim();
  const requestNode: AnnotationRequestNode = {
    path: node.path,
    kind: node.kind,
  };

  if (comment) {
    requestNode.comment = comment;
  }

  return requestNode;
}

/**
 * Recursively appends request nodes in tree order
 * @param node Current file tree node
 * @param requestPaths Paths that should be sent to the provider
 * @param annotations Existing annotation map
 * @param nodes Request node accumulator
 */
function collectAnnotationProviderRequestNodes(
  node: FileNode,
  requestPaths: Set<string>,
  annotations: TreeAnnotationMap,
  nodes: AnnotationRequestNode[]
): void {
  if (requestPaths.has(node.path)) {
    nodes.push(createAnnotationProviderRequestNode(node, annotations));
  }

  node.children?.forEach(child => {
    collectAnnotationProviderRequestNodes(
      child,
      requestPaths,
      annotations,
      nodes
    );
  });
}

/**
 * Builds provider request nodes from selected request paths
 * @param tree Source tree to traverse
 * @param requestPaths Paths that should be sent to the provider
 * @param annotations Existing annotation map
 * @returns Request nodes in tree order
 */
function createAnnotationProviderRequestNodes(
  tree: FileNode,
  requestPaths: Set<string>,
  annotations: TreeAnnotationMap
): AnnotationRequestNode[] {
  const nodes: AnnotationRequestNode[] = [];

  collectAnnotationProviderRequestNodes(tree, requestPaths, annotations, nodes);

  return nodes;
}

/**
 * Normalizes provider path text for alias matching
 * @param path Raw path returned by a provider or derived from the tree
 * @returns Slash-normalized path text
 */
function normalizeAnnotationProviderPathText(path: string): string {
  const normalizedPath = path
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\/+|\/+$/gu, '');

  if (normalizedPath === '.') {
    return normalizedPath;
  }

  return normalizedPath.replace(/\/+$/gu, '');
}

/**
 * Removes leading current-directory prefixes from a path
 * @param path Path text to normalize
 * @returns Path without leading ./ segments
 */
function stripCurrentDirectoryPrefix(path: string): string {
  return path.replace(/^(?:\.\/)+/u, '');
}

/**
 * Resolves the shared root path for a set of provider paths
 * @param paths Candidate provider paths
 * @returns Common ancestor path, or null when no shared root exists
 */
function resolveAnnotationProviderRootPath(paths: string[]): string | null {
  const sortedPaths = paths.filter(Boolean).sort((left, right) => {
    const depthDelta = left.split('/').length - right.split('/').length;

    return depthDelta === 0 ? left.length - right.length : depthDelta;
  });

  return (
    sortedPaths.find(candidate =>
      paths.every(
        path => path === candidate || path.startsWith(`${candidate}/`)
      )
    ) ?? resolveAnnotationProviderCommonRootPath(paths)
  );
}

/**
 * Finds a common ancestor path while avoiding leaf filenames
 * @param paths Candidate provider paths
 * @returns Common ancestor path, or null when no useful ancestor exists
 */
function resolveAnnotationProviderCommonRootPath(
  paths: string[]
): string | null {
  const pathParts = paths
    .filter(Boolean)
    .map(path => path.split('/').filter(Boolean));
  const firstPathParts = pathParts[0];

  if (!firstPathParts || firstPathParts.length < 2) {
    return null;
  }

  const commonParts: string[] = [];

  for (let index = 0; index < firstPathParts.length - 1; index += 1) {
    const part = firstPathParts[index];

    if (!part || !pathParts.every(parts => parts[index] === part)) {
      break;
    }

    commonParts.push(part);
  }

  return commonParts.length > 0 ? commonParts.join('/') : null;
}

/**
 * Converts a canonical path to a path relative to the shared root
 * @param path Canonical tree path
 * @param rootPath Shared root path
 * @returns Root-relative path, or an empty string when outside the root
 */
function stripAnnotationProviderRootPath(
  path: string,
  rootPath: string
): string {
  if (path === rootPath) {
    return '';
  }

  if (!path.startsWith(`${rootPath}/`)) {
    return '';
  }

  return path.slice(rootPath.length + 1);
}

/**
 * Builds a map of accepted path aliases to their canonical tree paths
 * @param paths Known canonical tree paths
 * @returns Map from normalized alias to canonical path
 */
function createAnnotationProviderPathAliasMap(
  paths: Iterable<string>
): Map<string, string> {
  const knownPaths = Array.from(paths).map(normalizeAnnotationProviderPathText);
  const aliases = new Map<string, string>();
  const rootPath = resolveAnnotationProviderRootPath(knownPaths);

  /**
   * Adds one normalized alias when it is not already mapped
   * @param alias Alias path that may be returned by a provider
   * @param path Canonical tree path for the alias
   */
  function addAlias(alias: string, path: string): void {
    const normalizedAlias = normalizeAnnotationProviderPathText(alias);

    if (!normalizedAlias || aliases.has(normalizedAlias)) {
      return;
    }

    aliases.set(normalizedAlias, path);
  }

  knownPaths.forEach(path => {
    const normalizedPath = normalizeAnnotationProviderPathText(path);
    const currentDirectoryRelativePath =
      stripCurrentDirectoryPrefix(normalizedPath);
    const rootRelativePath = rootPath
      ? stripAnnotationProviderRootPath(normalizedPath, rootPath)
      : '';

    addAlias(normalizedPath, path);

    if (currentDirectoryRelativePath) {
      addAlias(currentDirectoryRelativePath, path);
      addAlias(`./${currentDirectoryRelativePath}`, path);
    }

    if (rootRelativePath) {
      addAlias(rootRelativePath, path);
      addAlias(`./${rootRelativePath}`, path);
    }
  });

  return aliases;
}

/**
 * Resolves a provider patch path through known aliases
 * @param path Raw provider patch path
 * @param pathAliases Optional alias map keyed by normalized path
 * @returns Canonical path when matched, otherwise normalized input
 */
function normalizeAnnotationProviderPatchPath(
  path: string,
  pathAliases?: Map<string, string>
): string {
  const normalizedPath = normalizeAnnotationProviderPathText(path);

  return (
    pathAliases?.get(normalizedPath) ??
    pathAliases?.get(stripCurrentDirectoryPrefix(normalizedPath)) ??
    stripCurrentDirectoryPrefix(normalizedPath)
  );
}

/**
 * Normalizes a single provider patch and resolves its path against aliases
 * @param patch Provider patch to normalize
 * @param pathAliases Optional alias map used to resolve the patch path
 * @returns Normalized patch, or null when the path or comment is empty
 */
function normalizeAnnotationProviderPatch(
  patch: TreeAnnotationPatch,
  pathAliases?: Map<string, string>
): TreeAnnotationPatch | null {
  const path = normalizeAnnotationProviderPatchPath(patch.path, pathAliases);
  const comment = patch.comment.trim();

  if (!path || !comment) {
    return null;
  }

  const normalizedPatch: TreeAnnotationPatch = {
    path,
    comment,
    source: patch.source ?? 'ai',
    syncStatus: patch.syncStatus ?? 'synced',
  };

  if (patch.updatedAt !== undefined) {
    normalizedPatch.updatedAt = patch.updatedAt;
  }

  return normalizedPatch;
}

/**
 * Builds an annotation provider request payload from tree and scope options
 * @param options Tree, scope, target, and annotation options for the request
 * @returns Provider request with payload, allowed paths, and source paths
 */
export function createAnnotationProviderRequest(
  options: CreateAnnotationProviderRequestOptions
): AnnotationProviderRequest {
  const scope = options.scope ?? 'all';
  const target = options.target ?? 'all';
  const annotations = options.annotations ?? {};
  const sourceTree =
    scope === 'visible' || scope === 'unannotated'
      ? options.visibleTree
      : options.tree;

  if (!sourceTree) {
    return {
      allowedPaths: new Set<string>(),
      nodeCount: 0,
      payload: {
        language: normalizeAnnotationProviderLanguage(options.language),
        nodes: [],
        overwrite: options.overwrite ?? true,
        prompt: options.prompt?.trim() ?? '',
        scope,
        target,
      },
      sourcePaths: new Set<string>(),
    };
  }

  const scopedSourcePaths =
    scope === 'selection'
      ? collectSelectedAnnotationProviderPaths(
          options.tree,
          options.selectedPaths ?? []
        )
      : collectAnnotationProviderTreePaths(sourceTree);
  const targetPaths = filterAnnotationProviderPathsByTarget(
    sourceTree,
    scopedSourcePaths,
    target
  );
  const allowedPaths = createAnnotationProviderAllowedPaths(
    targetPaths,
    annotations,
    scope === 'unannotated' ? false : (options.overwrite ?? true)
  );
  const nodes = createAnnotationProviderRequestNodes(
    sourceTree,
    targetPaths,
    annotations
  );

  return {
    allowedPaths,
    nodeCount: allowedPaths.size,
    payload: {
      language: normalizeAnnotationProviderLanguage(options.language),
      nodes,
      overwrite: options.overwrite ?? true,
      prompt: options.prompt?.trim() ?? '',
      scope,
      target,
    },
    sourcePaths: scopedSourcePaths,
  };
}

/**
 * Normalizes provider result annotations into valid tree annotation patches
 * @param result Provider result containing returned annotations
 * @param knownPaths Optional known paths used to resolve relative aliases
 * @returns Normalized annotation patches with empty entries removed
 */
export function createTreeAnnotationPatchesFromProviderResult(
  result: AnnotationProviderResult,
  knownPaths?: Iterable<string>
): TreeAnnotationPatch[] {
  const pathAliases = knownPaths
    ? createAnnotationProviderPathAliasMap(knownPaths)
    : undefined;

  return result.annotations
    .map(patch => normalizeAnnotationProviderPatch(patch, pathAliases))
    .filter((patch): patch is TreeAnnotationPatch => patch !== null);
}
