/**
 * Date: 2026-06-07
 * Desc: Exposes the root public API for the headless package
 */

export { FileSystemReader, FileSystemReader as Reader } from './reader';
export { FileTreeError, type FileTreeErrorCode } from './reader/errors';
export {
  attachFileTreeMetadata,
  createFileTreeFromSnapshot,
  createReadOptionsFromConfig,
  formatSize,
  getFileTreeMetadata,
} from './reader';
export type {
  Entry,
  FileNode,
  FileTreeItem,
  FileTreeMetadata,
  FileTreeStats,
  GitignoreRule,
  ReadOptions,
  ReadOptionsConfig,
  ReadTiming,
  ReadWarning,
  SortBy,
  SortOptions,
  SortOrder,
} from './reader';
export {
  BaseFileSystemAdapter,
  InMemoryFileTreeAdapter,
  RemoteRepositoryFileSystemAdapter,
  ZipFileSystemAdapter,
} from './adapters';
export type {
  IFileSystemAdapter,
  ReaderAdapter,
  RemoteRepositoryAdapterOptions,
  RemoteRepositoryApiClient,
  RemoteRepositoryBranchOption,
  RemoteRepositoryBranchResolutionOptions,
  RemoteRepositoryBranchResolutionResult,
  RemoteRepositoryEntry,
  RemoteRepositoryProvider,
  ZipSource,
} from './adapters';
export {
  applyTreeAnnotationPatch,
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createManualAnnotationDiffResult,
  filterAnnotationDiffByExcludedPaths,
  createAnnotationProviderRequest,
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  createEditedAsciiAnnotationDiff,
  createTreeAnnotationPatchesFromProviderResult,
  filterTreeAnnotationsByPaths,
  formatAsciiTreeMarkdownBlock,
  formatIgnoredAsciiLineNumbers,
  parseAnnotatedAsciiTree,
  removeAnnotationDiffEntry,
  renderAnnotatedAsciiTree,
  resolveTreeAnnotationsAfterRead,
} from './annotations';
export type {
  AnnotatedAsciiTreeRenderOptions,
  AnnotatedAsciiTreeRenderOptionsConfig,
  AnnotationDiffEntry,
  AnnotationDiffResult,
  AnnotationProvider,
  AnnotationProviderRequest,
  AnnotationProviderResult,
  AnnotationProviderScope,
  AnnotationProviderTarget,
  AnnotationRequestNode,
  AnnotationRequestPayload,
  CreateAnnotationProviderRequestOptions,
  EditedAsciiAnnotationDiffResult,
  TreeAnnotation,
  TreeAnnotationMap,
  TreeAnnotationPatch,
  TreeAnnotationRetentionMode,
} from './annotations';
export {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
  renderAsciiTreeLines,
} from './ascii';
export type {
  AsciiTreeLine,
  AsciiTreeOptions,
  AsciiTreeOptionsConfig,
} from './ascii';
export {
  parseImportedAsciiTreeText,
  parseImportedTreeHtml,
  parseImportedMarkdownDocumentTreeText,
  parseImportedMarkdownListTree,
  parseImportedTreeXml,
  parseImportedTreeJson,
  parseImportedTreeText,
  parseEditedAsciiTree,
} from './parser';
export type {
  ImportedTreeFormat,
  ImportedTreeParseOptions,
  ParsedImportedTree,
  EditedAsciiTreeParseOptions,
  ParsedEditedAsciiTree,
} from './parser';
export {
  createExportedFileTreeJson,
  createFileTreeDownloadFilename,
  extractImportedFileTreeRootName,
  parseImportedFileTreeJson,
} from './transfer';
export type {
  CreateExportedFileTreeJsonOptions,
  ParsedImportedFileTreeJson,
} from './transfer';
export {
  cloneFileNode,
  createFileTreeNode,
  createFileTreeReadStats,
  createFocusedFileTree,
  createPreparedFileTree,
  createVisibleFileTree,
  findFileNodeLocation,
  moveFileTreeNode,
  normalizeExpandedFileTreeItems,
  removeFileTreeNode,
  removeFileTreeNodes,
  renameFileTreeNode,
  compareFileTrees,
  filterMatchingFileTreeState,
} from './tree';
export type {
  FileTreeChange,
  FileTreeComparison,
  FileNodeLocation,
  FileTreeCreateOptions,
  FileTreeCreateResult,
  FileTreeMoveResult,
  FileTreeMoveTarget,
  FileTreeReadStats,
  FileTreeRenameResult,
  FileTreeVisibilityMap,
  FileTreeVisibilityMode,
} from './tree';
