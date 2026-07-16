import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNpmPackResult } from './parse-npm-pack-result.mjs';

/**
 * Date: 2026-06-07
 * Desc: Verifies the packed package works after local npm installation
 */

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const smokeParentRoot = join(workspaceRoot, '.tmp');
const smokeRoot = join(smokeParentRoot, 'install-smoke');
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : 'npm';
const cachePath =
  process.env.DIR_TREE_NPM_CACHE ?? join(workspaceRoot, '.npm-cache');
const localFflatePath = join(workspaceRoot, 'node_modules', 'fflate');
const tscPath = join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const npmEnv = {
  ...process.env,
  npm_config_cache: cachePath,
};

function runNpm(args, options = {}) {
  return execFileSync(npmCommand, npmExecPath ? [npmExecPath, ...args] : args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: 'utf8',
    env: npmEnv,
    stdio: options.stdio ?? 'pipe',
  });
}

rmSync(smokeRoot, { force: true, recursive: true });
mkdirSync(smokeRoot, { recursive: true });

const packResult = parseNpmPackResult(runNpm(['pack', '--json']));
const tarballPath = join(workspaceRoot, packResult.filename);

try {
  writeFileSync(
    join(smokeRoot, 'package.json'),
    `${JSON.stringify({ name: 'dir-tree-install-smoke', private: true, type: 'module' }, null, 2)}\n`
  );
  runNpm(
    [
      'install',
      tarballPath,
      localFflatePath,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    { cwd: smokeRoot, stdio: 'inherit' }
  );
  writeFileSync(
    join(smokeRoot, 'esm-smoke.mjs'),
    [
      `import { FileSystemReader, InMemoryFileTreeAdapter, attachFileTreeMetadata, createFileTreeFromSnapshot, createReadOptionsFromConfig, formatSize, getFileTreeMetadata } from '@devmc12/dir-tree';`,
      `import { RemoteRepositoryError, RemoteRepositoryFileSystemAdapter } from '@devmc12/dir-tree/adapters';`,
      `import { createAnnotationDiffResult, createAnnotationProviderRequest, createAnnotatedAsciiTreeRenderOptionsFromConfig, createTreeAnnotationPatchesFromProviderResult, resolveTreeAnnotationsAfterRead } from '@devmc12/dir-tree/annotations';`,
      `import { createAsciiTreeOptionsFromConfig, renderAsciiTree } from '@devmc12/dir-tree/ascii';`,
      `import { isFileTreeSourceDrag } from '@devmc12/dir-tree/browser';`,
      `import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';`,
      `import { parseImportedTreeText } from '@devmc12/dir-tree/parser';`,
      `import { createTreeSelectionModel } from '@devmc12/dir-tree/selection';`,
      `import { createExportedFileTreeJson } from '@devmc12/dir-tree/transfer';`,
      `import { createFileTreeNode } from '@devmc12/dir-tree/tree';`,
      `const tree = await new FileSystemReader(new InMemoryFileTreeAdapter({ name: 'project', path: 'project', kind: 'directory', children: [] })).read();`,
      `const snapshot = createFileTreeFromSnapshot({ name: 'snapshot', path: 'snapshot', kind: 'directory', children: [{ name: 'file.bin', path: 'snapshot/file.bin', kind: 'file', size: 2048 }] }, { readFileMeta: true });`,
      `const metadata = attachFileTreeMetadata(snapshot);`,
      `const readOptions = createReadOptionsFromConfig({ excludePatterns: 'dist\\nnode_modules', concurrencyEnabled: false });`,
      `const asciiOptions = createAsciiTreeOptionsFromConfig({ showMetadata: true });`,
      `const annotationRequest = createAnnotationProviderRequest({ tree });`,
      `const annotationRenderOptions = createAnnotatedAsciiTreeRenderOptionsFromConfig({ commentPrefix: '#' });`,
      `const providerPatches = createTreeAnnotationPatchesFromProviderResult({ annotations: [{ path: 'project', comment: 'Root' }] }, annotationRequest.sourcePaths);`,
      `const selectionData = { rootId: 'root', items: { root: { id: 'root', children: ['root/src'] }, 'root/src': { id: 'root/src' } } };`,
      `const selectionModel = createTreeSelectionModel(selectionData, ['root/src']);`,
      `if (!renderAsciiTree(tree).includes('project')) throw new Error('render failed');`,
      `if (formatSize(2048) !== '2.0 KB' || metadata.stats.totalFiles !== 1 || getFileTreeMetadata(snapshot)?.stats.totalSize !== 2048) throw new Error('metadata helpers failed');`,
      `if (asciiOptions.showFileSize !== true || asciiOptions.showModifiedTime !== true) throw new Error('ascii options failed');`,
      `if (parseImportedTreeText('project\\n└── src', 'project').tree.name !== 'project') throw new Error('parse failed');`,
      `if (!createFileTreeNode(tree, 'project', { kind: 'file', name: 'README.md' })) throw new Error('tree edit failed');`,
      `if (!createExportedFileTreeJson(tree).includes('project')) throw new Error('transfer failed');`,
      `if (readOptions.exclude?.length !== 2 || readOptions.concurrency !== false) throw new Error('read options failed');`,
      `if (annotationRequest.payload.nodes.length !== 1 || providerPatches.length !== 1) throw new Error('annotation provider failed');`,
      `if (annotationRenderOptions.commentTemplate !== '# %comment%') throw new Error('annotation render options failed');`,
      `if (Object.keys(resolveTreeAnnotationsAfterRead(tree, {}, 'matching-paths')).length !== 0) throw new Error('annotation retention failed');`,
      `if (selectionModel.selectionStateById['root/src'] !== 'checked') throw new Error('selection failed');`,
      `if (createAnnotationDiffResult({}, [], new Set()).added.length !== 0) throw new Error('annotation failed');`,
      `if (isFileTreeSourceDrag(null)) throw new Error('browser helper failed');`,
      `if (typeof NodeFileSystemAdapter !== 'function') throw new Error('node export failed');`,
      `if (typeof RemoteRepositoryFileSystemAdapter !== 'function' || !(new RemoteRepositoryError({ code: 'unknown', message: 'x' }) instanceof Error)) throw new Error('adapter export failed');`,
      '',
    ].join('\n')
  );
  writeFileSync(
    join(smokeRoot, 'cjs-smoke.cjs'),
    [
      `const { FileSystemReader, InMemoryFileTreeAdapter, attachFileTreeMetadata, createFileTreeFromSnapshot, createReadOptionsFromConfig, formatSize, getFileTreeMetadata } = require('@devmc12/dir-tree');`,
      `const { RemoteRepositoryError, RemoteRepositoryFileSystemAdapter } = require('@devmc12/dir-tree/adapters');`,
      `const { createAnnotationDiffResult, createAnnotationProviderRequest, createAnnotatedAsciiTreeRenderOptionsFromConfig, createTreeAnnotationPatchesFromProviderResult, resolveTreeAnnotationsAfterRead } = require('@devmc12/dir-tree/annotations');`,
      `const { createAsciiTreeOptionsFromConfig, renderAsciiTree } = require('@devmc12/dir-tree/ascii');`,
      `const { isFileTreeSourceDrag } = require('@devmc12/dir-tree/browser');`,
      `const { NodeFileSystemAdapter } = require('@devmc12/dir-tree/node');`,
      `const { parseImportedTreeText } = require('@devmc12/dir-tree/parser');`,
      `const { createTreeSelectionModel } = require('@devmc12/dir-tree/selection');`,
      `const { createExportedFileTreeJson } = require('@devmc12/dir-tree/transfer');`,
      `const { createFileTreeNode } = require('@devmc12/dir-tree/tree');`,
      `const tree = { name: 'project', path: 'project', kind: 'directory', children: [] };`,
      `(async () => {`,
      `  const result = await new FileSystemReader(new InMemoryFileTreeAdapter(tree)).read();`,
      `  const snapshot = createFileTreeFromSnapshot({ name: 'snapshot', path: 'snapshot', kind: 'directory', children: [{ name: 'file.bin', path: 'snapshot/file.bin', kind: 'file', size: 2048 }] }, { readFileMeta: true });`,
      `  const metadata = attachFileTreeMetadata(snapshot);`,
      `  const readOptions = createReadOptionsFromConfig({ excludePatterns: 'dist\\nnode_modules', concurrencyEnabled: false });`,
      `  const asciiOptions = createAsciiTreeOptionsFromConfig({ showMetadata: true });`,
      `  const annotationRequest = createAnnotationProviderRequest({ tree: result });`,
      `  const annotationRenderOptions = createAnnotatedAsciiTreeRenderOptionsFromConfig({ commentPrefix: '#' });`,
      `  const providerPatches = createTreeAnnotationPatchesFromProviderResult({ annotations: [{ path: 'project', comment: 'Root' }] }, annotationRequest.sourcePaths);`,
      `  const selectionData = { rootId: 'root', items: { root: { id: 'root', children: ['root/src'] }, 'root/src': { id: 'root/src' } } };`,
      `  const selectionModel = createTreeSelectionModel(selectionData, ['root/src']);`,
      `  if (!renderAsciiTree(result).includes('project')) throw new Error('render failed');`,
      `  if (formatSize(2048) !== '2.0 KB' || metadata.stats.totalFiles !== 1 || getFileTreeMetadata(snapshot)?.stats.totalSize !== 2048) throw new Error('metadata helpers failed');`,
      `  if (asciiOptions.showFileSize !== true || asciiOptions.showModifiedTime !== true) throw new Error('ascii options failed');`,
      `  if (parseImportedTreeText('project\\n└── src', 'project').tree.name !== 'project') throw new Error('parse failed');`,
      `  if (!createFileTreeNode(result, 'project', { kind: 'file', name: 'README.md' })) throw new Error('tree edit failed');`,
      `  if (!createExportedFileTreeJson(result).includes('project')) throw new Error('transfer failed');`,
      `  if (readOptions.exclude?.length !== 2 || readOptions.concurrency !== false) throw new Error('read options failed');`,
      `  if (annotationRequest.payload.nodes.length !== 1 || providerPatches.length !== 1) throw new Error('annotation provider failed');`,
      `  if (annotationRenderOptions.commentTemplate !== '# %comment%') throw new Error('annotation render options failed');`,
      `  if (Object.keys(resolveTreeAnnotationsAfterRead(result, {}, 'matching-paths')).length !== 0) throw new Error('annotation retention failed');`,
      `  if (selectionModel.selectionStateById['root/src'] !== 'checked') throw new Error('selection failed');`,
      `  if (createAnnotationDiffResult({}, [], new Set()).added.length !== 0) throw new Error('annotation failed');`,
      `  if (isFileTreeSourceDrag(null)) throw new Error('browser helper failed');`,
      `  if (typeof NodeFileSystemAdapter !== 'function') throw new Error('node export failed');`,
      `  if (typeof RemoteRepositoryFileSystemAdapter !== 'function' || !(new RemoteRepositoryError({ code: 'unknown', message: 'x' }) instanceof Error)) throw new Error('adapter export failed');`,
      `})();`,
      '',
    ].join('\n')
  );
  writeFileSync(
    join(smokeRoot, 'types-smoke.ts'),
    `import { FileSystemReader, InMemoryFileTreeAdapter, attachFileTreeMetadata, createFileTreeFromSnapshot, createReadOptionsFromConfig, formatSize, getFileTreeMetadata, type FileNode, type ReadOptionsConfig } from '@devmc12/dir-tree';\nimport { RemoteRepositoryError, RemoteRepositoryFileSystemAdapter, type DroppedFileSystemDirectoryEntry } from '@devmc12/dir-tree/adapters';\nimport { createAsciiTreeOptionsFromConfig, renderAsciiTreeLines, type AsciiTreeOptionsConfig } from '@devmc12/dir-tree/ascii';\nimport { createAnnotationDiffResult, createAnnotationProviderRequest, createAnnotatedAsciiTreeRenderOptionsFromConfig, createTreeAnnotationPatchesFromProviderResult, resolveTreeAnnotationsAfterRead, type AnnotatedAsciiTreeRenderOptionsConfig, type AnnotationProviderRequest, type AnnotationProviderResult, type TreeAnnotationMap, type TreeAnnotationRetentionMode } from '@devmc12/dir-tree/annotations';\nimport { isDirectoryPickerSupported, type DroppedFileTreeSource } from '@devmc12/dir-tree/browser';\nimport { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';\nimport { parseImportedTreeText } from '@devmc12/dir-tree/parser';\nimport { createTreeSelectionModel } from '@devmc12/dir-tree/selection';\nimport { createExportedFileTreeJson } from '@devmc12/dir-tree/transfer';\nimport { createFileTreeNode } from '@devmc12/dir-tree/tree';\nconst tree: FileNode = { name: 'project', path: 'project', kind: 'directory', children: [] };\nconst annotations: TreeAnnotationMap = {};\nconst retentionMode: TreeAnnotationRetentionMode = 'matching-paths';\nconst reader = new FileSystemReader(new InMemoryFileTreeAdapter(tree));\nconst parsed = parseImportedTreeText('project\\n└── src', 'project');\nconst created = createFileTreeNode(parsed.tree, parsed.tree.path, { kind: 'file', name: 'README.md' });\nconst snapshot = createFileTreeFromSnapshot({ name: 'snapshot', path: 'snapshot', kind: 'directory', children: [{ name: 'file.bin', path: 'snapshot/file.bin', kind: 'file', size: 2048 }] }, { readFileMeta: true });\nconst metadata = attachFileTreeMetadata(snapshot);\nconst source: DroppedFileTreeSource | null = null;\nconst entry: DroppedFileSystemDirectoryEntry | null = null;\nconst readOptionConfig: ReadOptionsConfig = { excludePatterns: 'dist\\nnode_modules', concurrencyEnabled: false };\nconst asciiOptionConfig: AsciiTreeOptionsConfig = { showMetadata: true };\nconst annotatedAsciiConfig: AnnotatedAsciiTreeRenderOptionsConfig = { commentPrefix: '#' };\nconst annotationProviderResult: AnnotationProviderResult = { annotations: [{ path: 'project', comment: 'Root' }] };\nnew RemoteRepositoryFileSystemAdapter({ repositoryUrl: 'https://github.com/acme/project' });\nnew RemoteRepositoryError({ code: 'unknown', message: 'x' });\nnew NodeFileSystemAdapter('.');\ncreateAnnotationDiffResult(annotations, [], new Set([tree.path]));\ncreateExportedFileTreeJson(tree, annotations);\ncreateTreeSelectionModel({ rootId: 'root', items: { root: { id: 'root' } } }, []);\ncreateReadOptionsFromConfig(readOptionConfig);\ncreateAsciiTreeOptionsFromConfig(asciiOptionConfig);\ncreateAnnotatedAsciiTreeRenderOptionsFromConfig(annotatedAsciiConfig);\nconst annotationProviderRequest: AnnotationProviderRequest = createAnnotationProviderRequest({ tree });\ncreateTreeAnnotationPatchesFromProviderResult(annotationProviderResult, annotationProviderRequest.sourcePaths);\nresolveTreeAnnotationsAfterRead(tree, annotations, retentionMode);\nisDirectoryPickerSupported();\nformatSize(metadata.stats.totalSize);\ngetFileTreeMetadata(snapshot);\nrenderAsciiTreeLines(await reader.read());\nvoid source;\nvoid entry;\nif (!created) throw new Error('create failed');\n`
  );

  const typeScriptCompilerOptions = {
    exactOptionalPropertyTypes: true,
    lib: ['DOM', 'ES2022'],
    noEmit: true,
    strict: true,
    target: 'ES2022',
  };

  writeFileSync(
    join(smokeRoot, 'tsconfig.nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          ...typeScriptCompilerOptions,
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['types-smoke.ts'],
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(smokeRoot, 'tsconfig.node16.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          ...typeScriptCompilerOptions,
          module: 'Node16',
          moduleResolution: 'Node16',
        },
        include: ['types-smoke.ts'],
      },
      null,
      2
    )}\n`
  );
  execFileSync(process.execPath, ['esm-smoke.mjs'], {
    cwd: smokeRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['cjs-smoke.cjs'], {
    cwd: smokeRoot,
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [tscPath, '--project', 'tsconfig.nodenext.json'],
    {
      cwd: smokeRoot,
      stdio: 'inherit',
    }
  );
  execFileSync(
    process.execPath,
    [tscPath, '--project', 'tsconfig.node16.json'],
    {
      cwd: smokeRoot,
      stdio: 'inherit',
    }
  );
  console.log(
    'Verified installed package imports and TypeScript consumer types'
  );
} finally {
  rmSync(tarballPath, { force: true });
  rmSync(smokeParentRoot, { force: true, recursive: true });
}
