import {
  FileSystemReader,
  InMemoryFileTreeAdapter,
  attachFileTreeMetadata,
  createFileTreeFromSnapshot,
  createReadOptionsFromConfig,
  formatSize,
  getFileTreeMetadata,
  type FileNode,
  type ReadOptionsConfig,
} from '@devmc12/dir-tree';
import {
  RemoteRepositoryError,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree/adapters';
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTreeLines,
  type AsciiTreeOptionsConfig,
} from '@devmc12/dir-tree/ascii';
import {
  createAnnotationDiffResult,
  createManualAnnotationDiffResult,
  filterAnnotationDiffByExcludedPaths,
  createAnnotationProviderRequest,
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  createTreeAnnotationPatchesFromProviderResult,
  resolveTreeAnnotationsAfterRead,
  type AnnotatedAsciiTreeRenderOptionsConfig,
  type AnnotationProviderRequest,
  type AnnotationProviderResult,
  type TreeAnnotationMap,
  type TreeAnnotationRetentionMode,
} from '@devmc12/dir-tree/annotations';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';
import {
  parseEditedAsciiTree,
  parseImportedTreeText,
} from '@devmc12/dir-tree/parser';
import {
  createTreeSelectionModel,
  setTreeSelection,
} from '@devmc12/dir-tree/selection';
import { createExportedFileTreeJson } from '@devmc12/dir-tree/transfer';
import {
  compareFileTrees,
  createFileTreeHiddenLookup,
  filterMatchingFileTreeState,
  createFileTreeNode,
} from '@devmc12/dir-tree/tree';

/**
 * Date: 2026-11-07
 * Desc: Exercises the installed package declarations
 */

const tree: FileNode = {
  name: 'project',
  path: 'project',
  kind: 'directory',
  children: [],
};
const annotations: TreeAnnotationMap = {};
createFileTreeHiddenLookup(tree, {});
filterMatchingFileTreeState(
  annotations,
  compareFileTrees(tree, tree).matchingPaths
);
const retentionMode: TreeAnnotationRetentionMode = 'matching-paths';
const reader = new FileSystemReader(new InMemoryFileTreeAdapter(tree));
const parsed = parseImportedTreeText('project\n└── src', 'project');
parseEditedAsciiTree('project/', tree, { lines: renderAsciiTreeLines(tree) });
setTreeSelection(
  {
    rootId: 'project',
    rootSelectable: true,
    items: { project: { id: 'project' } },
  },
  [],
  ['project'],
  true
);
const created = createFileTreeNode(parsed.tree, parsed.tree.path, {
  kind: 'file',
  name: 'README.md',
});
const snapshot = createFileTreeFromSnapshot(
  {
    name: 'snapshot',
    path: 'snapshot',
    kind: 'directory',
    children: [
      { name: 'file.bin', path: 'snapshot/file.bin', kind: 'file', size: 2048 },
    ],
  },
  { readFileMeta: true }
);
const metadata = attachFileTreeMetadata(snapshot);
const readOptionConfig: ReadOptionsConfig = {
  excludePatterns: 'dist\nnode_modules',
  concurrencyEnabled: false,
};
const asciiOptionConfig: AsciiTreeOptionsConfig = { showMetadata: true };
const annotatedAsciiConfig: AnnotatedAsciiTreeRenderOptionsConfig = {
  commentPrefix: '#',
};
const annotationProviderResult: AnnotationProviderResult = {
  annotations: [{ path: 'project', comment: 'Root' }],
};
new RemoteRepositoryFileSystemAdapter({
  repositoryUrl: 'https://github.com/acme/project',
});
new RemoteRepositoryError({ code: 'unknown', message: 'x' });
new NodeFileSystemAdapter('.');
createAnnotationDiffResult(annotations, [], new Set([tree.path]));
filterAnnotationDiffByExcludedPaths(
  createManualAnnotationDiffResult(annotations, []),
  new Set()
);
createExportedFileTreeJson(tree, annotations);
createTreeSelectionModel(
  { rootId: 'root', items: { root: { id: 'root' } } },
  []
);
createReadOptionsFromConfig(readOptionConfig);
createAsciiTreeOptionsFromConfig(asciiOptionConfig);
createAnnotatedAsciiTreeRenderOptionsFromConfig(annotatedAsciiConfig);
const annotationProviderRequest: AnnotationProviderRequest =
  createAnnotationProviderRequest({ tree });
createTreeAnnotationPatchesFromProviderResult(
  annotationProviderResult,
  annotationProviderRequest.sourcePaths
);
resolveTreeAnnotationsAfterRead(tree, annotations, retentionMode);
formatSize(metadata.stats.totalSize);
getFileTreeMetadata(snapshot);
renderAsciiTreeLines(await reader.read());
if (!created) throw new Error('create failed');
