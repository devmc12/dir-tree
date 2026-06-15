import { createRequire } from 'node:module';

/**
 * Date: 2026-06-07
 * Desc: Verifies built package exports can be imported by consumers
 */

const require = createRequire(import.meta.url);

const root = await import('../dist/index.js');
const adapters = await import('../dist/adapters/index.js');
const annotations = await import('../dist/annotations/index.js');
const ascii = await import('../dist/ascii/index.js');
const browser = await import('../dist/browser/index.js');
const node = await import('../dist/node/index.js');
const parser = await import('../dist/parser/index.js');
const selection = await import('../dist/selection/index.js');
const transfer = await import('../dist/transfer/index.js');
const tree = await import('../dist/tree/index.js');

const commonJsModules = [
  require('../dist/index.cjs'),
  require('../dist/adapters/index.cjs'),
  require('../dist/annotations/index.cjs'),
  require('../dist/ascii/index.cjs'),
  require('../dist/browser/index.cjs'),
  require('../dist/node/index.cjs'),
  require('../dist/parser/index.cjs'),
  require('../dist/selection/index.cjs'),
  require('../dist/transfer/index.cjs'),
  require('../dist/tree/index.cjs'),
];

const requiredExports = [
  [root, 'FileSystemReader'],
  [root, 'attachFileTreeMetadata'],
  [root, 'createFileTreeFromSnapshot'],
  [root, 'createReadOptionsFromConfig'],
  [root, 'formatSize'],
  [root, 'getFileTreeMetadata'],
  [root, 'DroppedDirectoryEntryAdapter'],
  [root, 'InMemoryFileTreeAdapter'],
  [root, 'LegacyDirectoryFilesAdapter'],
  [adapters, 'DroppedDirectoryEntryAdapter'],
  [adapters, 'RemoteRepositoryError'],
  [adapters, 'RemoteRepositoryFileSystemAdapter'],
  [adapters, 'LegacyDirectoryFilesAdapter'],
  [adapters, 'parseRemoteRepositoryUrl'],
  [adapters, 'resolveRemoteRepositoryBranches'],
  [annotations, 'createAnnotationDiffResult'],
  [annotations, 'createAnnotationProviderRequest'],
  [annotations, 'createAnnotatedAsciiTreeRenderOptionsFromConfig'],
  [annotations, 'createTreeAnnotationPatchesFromProviderResult'],
  [annotations, 'resolveTreeAnnotationsAfterRead'],
  [ascii, 'createAsciiTreeOptionsFromConfig'],
  [ascii, 'renderAsciiTree'],
  [browser, 'isDirectoryPickerSupported'],
  [browser, 'createLegacyDirectorySkipMatcher'],
  [browser, 'resolveDroppedFileTreeSource'],
  [node, 'NodeFileSystemAdapter'],
  [parser, 'parseImportedTreeText'],
  [selection, 'createTreeSelectionModel'],
  [transfer, 'createExportedFileTreeJson'],
  [tree, 'createFileTreeNode'],
];

for (const [moduleExports, exportName] of requiredExports) {
  if (!(exportName in moduleExports)) {
    throw new Error(`Missing package export: ${exportName}`);
  }
}

for (const [moduleExports, exportName] of [
  [commonJsModules[0], 'FileSystemReader'],
  [commonJsModules[0], 'attachFileTreeMetadata'],
  [commonJsModules[0], 'createFileTreeFromSnapshot'],
  [commonJsModules[0], 'createReadOptionsFromConfig'],
  [commonJsModules[0], 'formatSize'],
  [commonJsModules[0], 'getFileTreeMetadata'],
  [commonJsModules[0], 'DroppedDirectoryEntryAdapter'],
  [commonJsModules[0], 'LegacyDirectoryFilesAdapter'],
  [commonJsModules[1], 'DroppedDirectoryEntryAdapter'],
  [commonJsModules[1], 'RemoteRepositoryError'],
  [commonJsModules[1], 'RemoteRepositoryFileSystemAdapter'],
  [commonJsModules[1], 'LegacyDirectoryFilesAdapter'],
  [commonJsModules[1], 'resolveRemoteRepositoryBranches'],
  [commonJsModules[2], 'createAnnotationDiffResult'],
  [commonJsModules[2], 'createAnnotationProviderRequest'],
  [commonJsModules[2], 'createAnnotatedAsciiTreeRenderOptionsFromConfig'],
  [commonJsModules[2], 'createTreeAnnotationPatchesFromProviderResult'],
  [commonJsModules[2], 'resolveTreeAnnotationsAfterRead'],
  [commonJsModules[3], 'createAsciiTreeOptionsFromConfig'],
  [commonJsModules[3], 'renderAsciiTree'],
  [commonJsModules[4], 'isDirectoryPickerSupported'],
  [commonJsModules[4], 'createLegacyDirectorySkipMatcher'],
  [commonJsModules[4], 'resolveDroppedFileTreeSource'],
  [commonJsModules[5], 'NodeFileSystemAdapter'],
  [commonJsModules[6], 'parseImportedTreeText'],
  [commonJsModules[7], 'createTreeSelectionModel'],
  [commonJsModules[8], 'createExportedFileTreeJson'],
  [commonJsModules[9], 'createFileTreeNode'],
]) {
  if (!(exportName in moduleExports)) {
    throw new Error(`Missing CommonJS package export: ${exportName}`);
  }
}
