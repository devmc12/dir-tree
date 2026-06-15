import type { AsciiTreeLine } from '../ascii/types';
import { createAsciiTreeLineNumberMap } from './ascii';
import { applyTreeAnnotationPatches } from './patch';
import type {
  AnnotationDiffEntry,
  AnnotationDiffGroupKey,
  AnnotationDiffResult,
  EditedAsciiAnnotationDiffEntry,
  EditedAsciiAnnotationDiffResult,
  ParsedAnnotatedAsciiTreeResult,
  TreeAnnotationMap,
  TreeAnnotationPatch,
} from './types';

/**
 * Date: 2026-06-08
 * Desc: Creates annotation diff results for provider and edited ASCII patches
 */

/**
 * Diffs annotation patches against current annotations within an allowed scope
 * @param annotations Current annotation map
 * @param patches Candidate annotation patches to evaluate
 * @param allowedPaths Paths permitted to receive updates
 * @returns Added, updated, skipped entries and the resulting annotation map
 */
export function createAnnotationDiffResult(
  annotations: TreeAnnotationMap,
  patches: TreeAnnotationPatch[],
  allowedPaths: Set<string>
): AnnotationDiffResult {
  const dedupedPatches = new Map<string, TreeAnnotationPatch>();

  patches.forEach(patch => {
    dedupedPatches.set(patch.path, patch);
  });

  const added: AnnotationDiffEntry[] = [];
  const updated: AnnotationDiffEntry[] = [];
  const skipped: AnnotationDiffEntry[] = [];
  const applyPatches: TreeAnnotationPatch[] = [];

  dedupedPatches.forEach(patch => {
    const nextComment = patch.comment.trim();
    const previousComment = annotations[patch.path]?.comment.trim() ?? '';

    if (!allowedPaths.has(patch.path)) {
      skipped.push({
        path: patch.path,
        previousComment,
        nextComment,
        reason: 'outside-scope',
      });
      return;
    }

    if (!nextComment) {
      skipped.push({
        path: patch.path,
        previousComment,
        nextComment,
        reason: 'empty-comment',
      });
      return;
    }

    if (previousComment === nextComment) {
      skipped.push({
        path: patch.path,
        previousComment,
        nextComment,
        reason: 'unchanged',
      });
      return;
    }

    const entry = { path: patch.path, previousComment, nextComment };

    if (previousComment) {
      updated.push(entry);
    } else {
      added.push(entry);
    }

    applyPatches.push({ ...patch, comment: nextComment });
  });

  return {
    added,
    updated,
    skipped,
    applyPatches,
    baseAnnotations: annotations,
    nextAnnotations: applyTreeAnnotationPatches(annotations, applyPatches),
  };
}

/**
 * Removes a single diff entry and recomputes the resulting annotations
 * @param diff Existing annotation diff result
 * @param group Diff group the entry belongs to
 * @param path Path of the entry to remove
 * @returns Updated diff result without the removed entry
 */
export function removeAnnotationDiffEntry(
  diff: AnnotationDiffResult,
  group: AnnotationDiffGroupKey,
  path: string
): AnnotationDiffResult {
  const nextApplyPatches = diff.applyPatches.filter(
    patch => patch.path !== path
  );
  const nextDiff: AnnotationDiffResult = {
    ...diff,
    applyPatches: nextApplyPatches,
    nextAnnotations: applyTreeAnnotationPatches(
      diff.baseAnnotations,
      nextApplyPatches
    ),
  };

  nextDiff[group] = diff[group].filter(entry => entry.path !== path);

  return nextDiff;
}

/**
 * Builds an added, updated, removed, and ignored diff from edited ASCII text
 * @param parsedResult Parsed annotation patches and ignored line numbers
 * @param editedText Edited ASCII tree text used to recover raw lines
 * @param lines Original ASCII tree lines used for line numbering
 * @param annotations Current annotation map compared against
 * @returns Edited ASCII annotation diff with patches to apply
 */
export function createEditedAsciiAnnotationDiff(
  parsedResult: ParsedAnnotatedAsciiTreeResult,
  editedText: string,
  lines: AsciiTreeLine[],
  annotations: TreeAnnotationMap
): EditedAsciiAnnotationDiffResult {
  const rawLines = editedText.split(/\r?\n/u);
  const lineNumbers = createAsciiTreeLineNumberMap(lines);
  const diff = createEmptyEditedAsciiAnnotationDiff();

  parsedResult.patches.forEach(patch => {
    const previousComment = annotations[patch.path]?.comment.trim() ?? '';
    const nextComment = patch.comment.trim();

    if (previousComment === nextComment) {
      return;
    }

    const entry: EditedAsciiAnnotationDiffEntry = {
      id: patch.path,
      lineNumber: lineNumbers.get(patch.path) ?? 0,
      nextComment,
      path: patch.path,
      previousComment,
    };
    const applyPatch: TreeAnnotationPatch = { ...patch, comment: nextComment };

    if (!previousComment && nextComment) {
      diff.added.push(entry);
      diff.applyPatches.push(applyPatch);
      return;
    }

    if (previousComment && nextComment) {
      diff.updated.push(entry);
      diff.applyPatches.push(applyPatch);
      return;
    }

    if (previousComment && !nextComment) {
      diff.removed.push(entry);
      diff.applyPatches.push(applyPatch);
    }
  });

  diff.ignored = parsedResult.ignoredLineNumbers.map(lineNumber => ({
    id: String(lineNumber),
    lineNumber,
    rawLine: rawLines[lineNumber - 1] ?? '',
  }));
  diff.ignoredLineNumbers = diff.ignored.map(entry => entry.lineNumber);
  diff.parsedLineCount = parsedResult.patches.length;

  return diff;
}

/**
 * Creates an empty edited ASCII annotation diff accumulator
 * @returns Empty diff result ready to populate
 */
function createEmptyEditedAsciiAnnotationDiff(): EditedAsciiAnnotationDiffResult {
  return {
    added: [],
    applyPatches: [],
    ignored: [],
    ignoredLineNumbers: [],
    parsedLineCount: 0,
    removed: [],
    updated: [],
  };
}
