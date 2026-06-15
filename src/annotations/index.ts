/**
 * Date: 2026-06-08
 * Desc: Exposes public annotation types, providers, patches, diffs, and ASCII helpers
 */

export * from './types';
export {
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  createTreeAnnotationPresetTemplate,
  getActiveTreeAnnotationPresetPrefix,
  getTreeAnnotationPresetSpacing,
  clampTreeAnnotationCommentColumn,
} from './options';
export {
  createAsciiTreeLineNumberMap,
  formatAsciiTreeMarkdownBlock,
  formatIgnoredAsciiLineNumbers,
  parseAnnotatedAsciiTree,
  renderAnnotatedAsciiTree,
} from './ascii';
export {
  createAnnotationDiffResult,
  createEditedAsciiAnnotationDiff,
  removeAnnotationDiffEntry,
} from './diff';
export {
  createAnnotationProviderRequest,
  createTreeAnnotationPatchesFromProviderResult,
} from './provider';
export {
  applyTreeAnnotationPatch,
  applyTreeAnnotationPatches,
  filterTreeAnnotationsByPaths,
  getTreeAnnotationText,
  mergeParsedTreeAnnotationPatches,
  remapTreeAnnotationPath,
  remapTreeAnnotations,
  resolveTreeAnnotationsAfterRead,
} from './patch';
