import {
  FileSystemReader,
  InMemoryFileTreeAdapter,
  attachFileTreeMetadata,
  createFileTreeFromSnapshot,
  createReadOptionsFromConfig,
  formatSize,
  getFileTreeMetadata,
} from '@devmc12/dir-tree';
import {
  RemoteRepositoryError,
  RemoteRepositoryFileSystemAdapter,
} from '@devmc12/dir-tree/adapters';
import {
  createAnnotationDiffResult,
  createAnnotationProviderRequest,
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  createTreeAnnotationPatchesFromProviderResult,
  resolveTreeAnnotationsAfterRead,
} from '@devmc12/dir-tree/annotations';
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
} from '@devmc12/dir-tree/ascii';
import { isFileTreeSourceDrag } from '@devmc12/dir-tree/browser';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';
import { parseImportedTreeText } from '@devmc12/dir-tree/parser';
import { createTreeSelectionModel } from '@devmc12/dir-tree/selection';
import { createExportedFileTreeJson } from '@devmc12/dir-tree/transfer';
import { createFileTreeNode } from '@devmc12/dir-tree/tree';

/**
 * Date: 2026-11-07
 * Desc: Exercises the installed package runtime exports
 */

const tree = await new FileSystemReader(
  new InMemoryFileTreeAdapter({
    name: 'project',
    path: 'project',
    kind: 'directory',
    children: [],
  })
).read();
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
const readOptions = createReadOptionsFromConfig({
  excludePatterns: 'dist\nnode_modules',
  concurrencyEnabled: false,
});
const asciiOptions = createAsciiTreeOptionsFromConfig({ showMetadata: true });
const annotationRequest = createAnnotationProviderRequest({ tree });
const annotationRenderOptions = createAnnotatedAsciiTreeRenderOptionsFromConfig(
  { commentPrefix: '#' }
);
const providerPatches = createTreeAnnotationPatchesFromProviderResult(
  { annotations: [{ path: 'project', comment: 'Root' }] },
  annotationRequest.sourcePaths
);
const selectionData = {
  rootId: 'root',
  items: {
    root: { id: 'root', children: ['root/src'] },
    'root/src': { id: 'root/src' },
  },
};
const selectionModel = createTreeSelectionModel(selectionData, ['root/src']);
if (!renderAsciiTree(tree).includes('project'))
  throw new Error('render failed');
if (
  formatSize(2048) !== '2.0 KB' ||
  metadata.stats.totalFiles !== 1 ||
  getFileTreeMetadata(snapshot)?.stats.totalSize !== 2048
)
  throw new Error('metadata helpers failed');
if (
  asciiOptions.showFileSize !== true ||
  asciiOptions.showModifiedTime !== true
)
  throw new Error('ascii options failed');
if (
  parseImportedTreeText('project\n└── src', 'project').tree.name !== 'project'
)
  throw new Error('parse failed');
if (!createFileTreeNode(tree, 'project', { kind: 'file', name: 'README.md' }))
  throw new Error('tree edit failed');
if (!createExportedFileTreeJson(tree).includes('project'))
  throw new Error('transfer failed');
if (readOptions.exclude?.length !== 2 || readOptions.concurrency !== false)
  throw new Error('read options failed');
if (
  annotationRequest.payload.nodes.length !== 1 ||
  providerPatches.length !== 1
)
  throw new Error('annotation provider failed');
if (annotationRenderOptions.commentTemplate !== '# %comment%')
  throw new Error('annotation render options failed');
if (
  Object.keys(resolveTreeAnnotationsAfterRead(tree, {}, 'matching-paths'))
    .length !== 0
)
  throw new Error('annotation retention failed');
if (selectionModel.selectionStateById['root/src'] !== 'checked')
  throw new Error('selection failed');
if (createAnnotationDiffResult({}, [], new Set()).added.length !== 0)
  throw new Error('annotation failed');
if (isFileTreeSourceDrag(null)) throw new Error('browser helper failed');
if (typeof NodeFileSystemAdapter !== 'function')
  throw new Error('node export failed');
if (
  typeof RemoteRepositoryFileSystemAdapter !== 'function' ||
  !(
    new RemoteRepositoryError({ code: 'unknown', message: 'x' }) instanceof
    Error
  )
)
  throw new Error('adapter export failed');
