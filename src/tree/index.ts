/**
 * Date: 2026-06-07
 * Desc: Provides pure file tree editing, visibility, and expansion utilities
 */

export type {
  FileTreeReadStats,
  FileNodeLocation,
  FileTreeMoveTarget,
  FileTreeMoveResult,
  FileTreeRenameResult,
  FileTreeCreateOptions,
  FileTreeCreateResult,
  FileTreeVisibilityMode,
  FileTreeVisibilityMap,
} from './types';
export { compareFileTrees, filterMatchingFileTreeState } from './compare';
export type { FileTreeChange, FileTreeComparison } from './compare';
export {
  cloneFileNode,
  createPreparedFileTree,
  getFileTreeItems,
  getFileTreeFolderPaths,
  findFileNodeLocation,
  createFocusedFileTree,
  createFileTreeReadStats,
} from './traversal';
export {
  buildFileTreeChildPath,
  remapFileTreePathPrefix,
  isFileTreePathWithin,
  filterNestedFileTreePaths,
} from './path';
export {
  removeFileTreeNode,
  removeFileTreeNodes,
  createFileTreeNode,
  moveFileTreeNode,
  renameFileTreeNode,
} from './editing';
export {
  filterFileTreeVisibilityByPaths,
  remapFileTreeVisibility,
  createVisibleFileTree,
  createFileTreeHiddenLookup,
} from './visibility';
export {
  normalizeExpandedFileTreeItems,
  getAutoExpandedFileTreeItems,
  collapseExpandedFileTreeItems,
  remapExpandedFileTreeItemsAfterMove,
} from './expanded';
