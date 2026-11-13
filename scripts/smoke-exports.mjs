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
  [root, 'FileTreeError'],
  [root, 'attachFileTreeMetadata'],
  [root, 'createFileTreeFromSnapshot'],
  [root, 'createReadOptionsFromConfig'],
  [root, 'formatSize'],
  [root, 'getFileTreeMetadata'],
  [root, 'InMemoryFileTreeAdapter'],
  [adapters, 'RemoteRepositoryError'],
  [adapters, 'RemoteRepositoryFileSystemAdapter'],
  [adapters, 'parseRemoteRepositoryUrl'],
  [adapters, 'resolveRemoteRepositoryBranches'],
  [annotations, 'createAnnotationDiffResult'],
  [annotations, 'createManualAnnotationDiffResult'],
  [annotations, 'filterAnnotationDiffByExcludedPaths'],
  [annotations, 'createAnnotationProviderRequest'],
  [annotations, 'createAnnotatedAsciiTreeRenderOptionsFromConfig'],
  [annotations, 'createTreeAnnotationPatchesFromProviderResult'],
  [annotations, 'resolveTreeAnnotationsAfterRead'],
  [ascii, 'createAsciiTreeOptionsFromConfig'],
  [ascii, 'renderAsciiTree'],
  [browser, 'DroppedDirectoryEntryAdapter'],
  [browser, 'LegacyDirectoryFilesAdapter'],
  [browser, 'LocalFileSystemAdapter'],
  [browser, 'isDirectoryPickerSupported'],
  [browser, 'createLegacyDirectorySkipMatcher'],
  [browser, 'resolveDroppedFileTreeSource'],
  [node, 'NodeFileSystemAdapter'],
  [parser, 'parseImportedTreeText'],
  [parser, 'parseEditedAsciiTree'],
  [selection, 'createTreeSelectionModel'],
  [selection, 'setTreeSelection'],
  [transfer, 'createExportedFileTreeJson'],
  [tree, 'createFileTreeNode'],
  [tree, 'compareFileTrees'],
  [tree, 'createFileTreeHiddenLookup'],
  [tree, 'filterMatchingFileTreeState'],
];

for (const [moduleExports, exportName] of requiredExports) {
  if (!(exportName in moduleExports)) {
    throw new Error(`Missing package export: ${exportName}`);
  }
}

for (const [moduleExports, exportName] of [
  [commonJsModules[0], 'FileSystemReader'],
  [commonJsModules[0], 'FileTreeError'],
  [commonJsModules[0], 'attachFileTreeMetadata'],
  [commonJsModules[0], 'createFileTreeFromSnapshot'],
  [commonJsModules[0], 'createReadOptionsFromConfig'],
  [commonJsModules[0], 'formatSize'],
  [commonJsModules[0], 'getFileTreeMetadata'],
  [commonJsModules[1], 'RemoteRepositoryError'],
  [commonJsModules[1], 'RemoteRepositoryFileSystemAdapter'],
  [commonJsModules[1], 'resolveRemoteRepositoryBranches'],
  [commonJsModules[2], 'createAnnotationDiffResult'],
  [commonJsModules[2], 'createManualAnnotationDiffResult'],
  [commonJsModules[2], 'filterAnnotationDiffByExcludedPaths'],
  [commonJsModules[2], 'createAnnotationProviderRequest'],
  [commonJsModules[2], 'createAnnotatedAsciiTreeRenderOptionsFromConfig'],
  [commonJsModules[2], 'createTreeAnnotationPatchesFromProviderResult'],
  [commonJsModules[2], 'resolveTreeAnnotationsAfterRead'],
  [commonJsModules[3], 'createAsciiTreeOptionsFromConfig'],
  [commonJsModules[3], 'renderAsciiTree'],
  [commonJsModules[4], 'DroppedDirectoryEntryAdapter'],
  [commonJsModules[4], 'LegacyDirectoryFilesAdapter'],
  [commonJsModules[4], 'LocalFileSystemAdapter'],
  [commonJsModules[4], 'isDirectoryPickerSupported'],
  [commonJsModules[4], 'createLegacyDirectorySkipMatcher'],
  [commonJsModules[4], 'resolveDroppedFileTreeSource'],
  [commonJsModules[5], 'NodeFileSystemAdapter'],
  [commonJsModules[6], 'parseImportedTreeText'],
  [commonJsModules[6], 'parseEditedAsciiTree'],
  [commonJsModules[7], 'createTreeSelectionModel'],
  [commonJsModules[7], 'setTreeSelection'],
  [commonJsModules[8], 'createExportedFileTreeJson'],
  [commonJsModules[9], 'createFileTreeNode'],
  [commonJsModules[9], 'compareFileTrees'],
  [commonJsModules[9], 'createFileTreeHiddenLookup'],
  [commonJsModules[9], 'filterMatchingFileTreeState'],
]) {
  if (!(exportName in moduleExports)) {
    throw new Error(`Missing CommonJS package export: ${exportName}`);
  }
}

const browserAdapters = [
  'DroppedDirectoryEntryAdapter',
  'LegacyDirectoryFilesAdapter',
  'LocalFileSystemAdapter',
];

// Verify the timing contract through both built module formats
for (const moduleExports of [root, commonJsModules[0]]) {
  const reports = [];
  const adapter = new moduleExports.InMemoryFileTreeAdapter({
    name: 'timing',
    path: 'timing',
    kind: 'directory',
  });
  const result = await new moduleExports.FileSystemReader(adapter).read({
    onTiming: timing => reports.push(timing),
  });
  const timing = reports[0];
  if (
    result.name !== 'timing' ||
    reports.length !== 1 ||
    timing.prepareMs !== 0 ||
    timing.treeMs < 0 ||
    timing.totalMs !== timing.treeMs
  ) {
    throw new Error('Invalid built package read timing');
  }
  const afterCallbackFailure = await adapter.read({
    onTiming: () => {
      throw new Error('Timing observer failed');
    },
  });
  if (afterCallbackFailure.name !== result.name) {
    throw new Error('Timing callback failure changed the read result');
  }
}

for (const exports of [
  root,
  adapters,
  commonJsModules[0],
  commonJsModules[1],
]) {
  for (const name of browserAdapters) {
    if (name in exports) {
      throw new Error('Browser adapter leaked into a common entry: ' + name);
    }
  }
}

for (const exports of [root, tree, commonJsModules[0], commonJsModules[9]]) {
  if ('stripFileNodeHandles' in exports) {
    throw new Error('Removed node handle API is still exported');
  }
}
