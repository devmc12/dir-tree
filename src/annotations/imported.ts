import type { TreeAnnotationMap } from './types';

/**
 * Date: 2026-11-07
 * Desc: Records comments from validated imported tree paths
 */

/**
 * Adds a manual annotation when imported comment text is non-empty
 * @param annotations Annotation map keyed by tree path
 * @param path Tree path receiving the annotation
 * @param comment Imported comment text
 */
export function appendImportedTreeAnnotation(
  annotations: TreeAnnotationMap,
  path: string,
  comment: string | null
): void {
  if (!comment?.trim()) {
    return;
  }

  annotations[path] = {
    path,
    comment: comment.trim(),
    source: 'manual',
    syncStatus: 'local',
    updatedAt: Date.now(),
  };
}
