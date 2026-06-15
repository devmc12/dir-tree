import type { FileNode } from '../reader/types';
import { getFileTreeItems } from '../tree';
import type {
  TreeAnnotationMap,
  TreeAnnotationPatch,
  TreeAnnotationRetentionMode,
} from './types';

/**
 * Date: 2026-06-08
 * Desc: Applies, filters, and remaps tree annotation patches
 */

function normalizeTreeAnnotationComment(comment: string): string {
  return comment.trim();
}

/**
 * Remaps an annotation path when its prefix moves from one path to another
 * @param path Annotation path to remap
 * @param fromPath Original path prefix
 * @param toPath Replacement path prefix
 * @returns Remapped path, or the original path when it is unaffected
 */
export function remapTreeAnnotationPath(
  path: string,
  fromPath: string,
  toPath: string
): string {
  if (path === fromPath) {
    return toPath;
  }

  if (!path.startsWith(`${fromPath}/`)) {
    return path;
  }

  return `${toPath}${path.slice(fromPath.length)}`;
}

/**
 * Reads the annotation comment for a path
 * @param annotations Annotation map keyed by node path
 * @param path Node path to look up
 * @returns Comment text, or an empty string when no annotation exists
 */
export function getTreeAnnotationText(
  annotations: TreeAnnotationMap,
  path: string
): string {
  return annotations[path]?.comment ?? '';
}

/**
 * Applies a single annotation patch, removing the entry when the comment is empty
 * @param annotations Current annotation map
 * @param patch Annotation patch to apply
 * @returns New annotation map reflecting the patch
 */
export function applyTreeAnnotationPatch(
  annotations: TreeAnnotationMap,
  patch: TreeAnnotationPatch
): TreeAnnotationMap {
  const normalizedComment = normalizeTreeAnnotationComment(patch.comment);

  if (!normalizedComment) {
    if (!annotations[patch.path]) {
      return annotations;
    }

    const nextAnnotations = { ...annotations };
    delete nextAnnotations[patch.path];
    return nextAnnotations;
  }

  const currentEntry = annotations[patch.path];

  return {
    ...annotations,
    [patch.path]: {
      path: patch.path,
      comment: normalizedComment,
      source: patch.source ?? currentEntry?.source ?? 'manual',
      syncStatus: patch.syncStatus ?? currentEntry?.syncStatus ?? 'local',
      updatedAt: patch.updatedAt ?? Date.now(),
    },
  };
}

/**
 * Applies a sequence of annotation patches in order
 * @param annotations Current annotation map
 * @param patches Annotation patches to apply
 * @returns New annotation map reflecting all patches
 */
export function applyTreeAnnotationPatches(
  annotations: TreeAnnotationMap,
  patches: TreeAnnotationPatch[]
): TreeAnnotationMap {
  return patches.reduce(
    (currentAnnotations, patch) =>
      applyTreeAnnotationPatch(currentAnnotations, patch),
    annotations
  );
}

/**
 * Keeps only annotations whose paths are in the valid path set
 * @param annotations Current annotation map
 * @param validPaths Paths that should be retained
 * @returns Filtered annotation map
 */
export function filterTreeAnnotationsByPaths(
  annotations: TreeAnnotationMap,
  validPaths: Iterable<string>
): TreeAnnotationMap {
  const pathSet = new Set(validPaths);
  const nextAnnotations: TreeAnnotationMap = {};

  Object.values(annotations).forEach(annotation => {
    if (pathSet.has(annotation.path)) {
      nextAnnotations[annotation.path] = annotation;
    }
  });

  return nextAnnotations;
}

/**
 * Resolves annotations after a read using the chosen retention mode
 * @param tree Newly read file tree
 * @param annotations Current annotation map
 * @param retentionMode Whether to reset or keep matching-path annotations
 * @returns Annotation map appropriate for the new tree
 */
export function resolveTreeAnnotationsAfterRead(
  tree: FileNode,
  annotations: TreeAnnotationMap,
  retentionMode: TreeAnnotationRetentionMode
): TreeAnnotationMap {
  if (retentionMode === 'reset') {
    return {};
  }

  return filterTreeAnnotationsByPaths(
    annotations,
    Object.keys(getFileTreeItems(tree))
  );
}

/**
 * Remaps every annotation path when a subtree moves
 * @param annotations Current annotation map
 * @param fromPath Original path prefix
 * @param toPath Replacement path prefix
 * @returns Annotation map with remapped paths
 */
export function remapTreeAnnotations(
  annotations: TreeAnnotationMap,
  fromPath: string,
  toPath: string
): TreeAnnotationMap {
  const nextAnnotations: TreeAnnotationMap = {};

  Object.values(annotations).forEach(annotation => {
    const nextPath = remapTreeAnnotationPath(annotation.path, fromPath, toPath);

    nextAnnotations[nextPath] = {
      ...annotation,
      path: nextPath,
    };
  });

  return nextAnnotations;
}

/**
 * Merges parsed patches into annotations, replacing only affected paths
 * @param annotations Current annotation map
 * @param patches Parsed annotation patches to merge
 * @param affectedPaths Paths whose existing annotations may be replaced
 * @returns Annotation map combining retained and patched entries
 */
export function mergeParsedTreeAnnotationPatches(
  annotations: TreeAnnotationMap,
  patches: TreeAnnotationPatch[],
  affectedPaths: Iterable<string>
): TreeAnnotationMap {
  const affectedPathSet = new Set(affectedPaths);
  const nextAnnotations: TreeAnnotationMap = {};

  Object.values(annotations).forEach(annotation => {
    if (!affectedPathSet.has(annotation.path)) {
      nextAnnotations[annotation.path] = annotation;
    }
  });

  patches.forEach(patch => {
    const normalizedComment = normalizeTreeAnnotationComment(patch.comment);

    if (!normalizedComment) {
      return;
    }

    const currentAnnotation = annotations[patch.path];

    nextAnnotations[patch.path] = {
      path: patch.path,
      comment: normalizedComment,
      source: patch.source ?? currentAnnotation?.source ?? 'manual',
      syncStatus: patch.syncStatus ?? currentAnnotation?.syncStatus ?? 'local',
      updatedAt: patch.updatedAt ?? currentAnnotation?.updatedAt ?? Date.now(),
    };
  });

  return nextAnnotations;
}
