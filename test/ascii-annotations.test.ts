import { describe, expect, it } from 'vitest';
import type { FileNode } from '../src';
import {
  createAsciiTreeOptionsFromConfig,
  renderAsciiTree,
  renderAsciiTreeLines,
} from '../src/ascii';
import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createAnnotationProviderRequest,
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  createEditedAsciiAnnotationDiff,
  createTreeAnnotationPatchesFromProviderResult,
  parseAnnotatedAsciiTree,
  renderAnnotatedAsciiTree,
  resolveTreeAnnotationsAfterRead,
  type TreeAnnotationMap,
} from '../src/annotations';

/**
 * Date: 2026-06-07
 * Desc: Verifies ASCII rendering and annotation patch utilities
 */

const tree: FileNode = {
  name: 'project',
  path: 'project',
  kind: 'directory',
  children: [
    {
      name: 'src',
      path: 'project/src',
      kind: 'directory',
      children: [
        { name: 'index.ts', path: 'project/src/index.ts', kind: 'file' },
      ],
    },
  ],
};

describe('ascii rendering', () => {
  it('normalizes host ASCII tree option configuration', () => {
    expect(
      createAsciiTreeOptionsFromConfig({
        appendDirectorySlash: true,
        connectorStyle: 'ascii',
        metadataTemplate: '  ',
        rootLabelMode: 'dot',
        showFullPath: true,
        showLineNumbers: true,
        showMetadata: true,
      })
    ).toEqual({
      appendDirectorySlash: true,
      connectorStyle: 'ascii',
      rootLabelMode: 'dot',
      showFileSize: true,
      showFullPath: true,
      showLineNumbers: true,
      showModifiedTime: true,
    });

    expect(
      createAsciiTreeOptionsFromConfig({
        metadataStyle: 'prefix-brackets',
        metadataTemplate: '%filename% [%bytes%]',
        showFileSize: false,
        showMetadata: true,
      })
    ).toEqual({
      metadataStyle: 'prefix-brackets',
      metadataTemplate: '%filename% [%bytes%]',
      showFileSize: false,
      showModifiedTime: true,
    });
  });

  it('renders structured lines and text output', () => {
    expect(renderAsciiTree(tree)).toContain('project');
    expect(renderAsciiTree(tree)).toContain('index.ts');
    expect(renderAsciiTreeLines(tree)).toHaveLength(3);
  });
});

describe('annotation utilities', () => {
  it('normalizes annotated ASCII render option configuration', () => {
    expect(
      createAnnotatedAsciiTreeRenderOptionsFromConfig({
        alignmentMode: 'inline',
        commentColumn: 200,
        commentPrefix: '//',
        commentPrefixHasSpace: false,
        gap: 3,
      })
    ).toEqual({
      alignmentMode: 'inline',
      commentColumn: 96,
      commentTemplate: '//%comment%',
      gap: 3,
    });

    expect(
      createAnnotatedAsciiTreeRenderOptionsFromConfig({
        commentPrefix: '#',
        commentTemplate: 'no placeholder',
      })
    ).toEqual({ commentTemplate: '# %comment%' });
  });

  it('renders, parses, and diffs edited ASCII annotations', () => {
    const lines = renderAsciiTreeLines(tree);
    const annotations: TreeAnnotationMap = applyTreeAnnotationPatches({}, [
      { path: 'project/src', comment: 'Source folder' },
    ]);
    const annotatedText = renderAnnotatedAsciiTree(lines, annotations, {
      commentTemplate: '# %comment%',
    });

    expect(annotatedText).toContain('# Source folder');

    const editedText = annotatedText.replace(
      '# Source folder',
      '# Application source'
    );
    const parsed = parseAnnotatedAsciiTree(lines, editedText, {
      commentTemplate: '# %comment%',
    });
    const diff = createEditedAsciiAnnotationDiff(
      parsed,
      editedText,
      lines,
      annotations
    );

    expect(diff.updated[0]?.nextComment).toBe('Application source');
  });

  it('creates provider-style annotation diff results', () => {
    const baseAnnotations: TreeAnnotationMap = applyTreeAnnotationPatches({}, [
      { path: 'project/src', comment: 'Old' },
    ]);
    const diff = createAnnotationDiffResult(
      baseAnnotations,
      [
        { path: 'project/src', comment: 'New', source: 'ai' },
        { path: 'project/missing', comment: 'Ignored', source: 'ai' },
      ],
      new Set(['project/src'])
    );

    expect(diff.updated).toHaveLength(1);
    expect(diff.skipped[0]?.reason).toBe('outside-scope');
    expect(diff.nextAnnotations['project/src']?.comment).toBe('New');
  });

  it('creates provider requests and normalizes provider result paths', () => {
    const annotations: TreeAnnotationMap = applyTreeAnnotationPatches({}, [
      { path: 'project/src', comment: 'Existing' },
    ]);
    const request = createAnnotationProviderRequest({
      annotations,
      overwrite: false,
      scope: 'unannotated',
      target: 'files',
      tree,
      visibleTree: tree,
    });

    expect(request.nodeCount).toBe(1);
    expect(request.allowedPaths.has('project/src/index.ts')).toBe(true);
    expect(request.payload.overwrite).toBe(false);
    expect(request.payload.scope).toBe('unannotated');
    expect(request.payload.target).toBe('files');
    expect(request.payload.nodes).toEqual([
      { path: 'project/src/index.ts', kind: 'file' },
    ]);

    const patches = createTreeAnnotationPatchesFromProviderResult(
      {
        annotations: [
          { path: './src/index.ts', comment: 'Entry point' },
          { path: 'missing.ts', comment: 'Ignored by diff' },
          { path: 'project/empty.ts', comment: '  ' },
        ],
      },
      request.sourcePaths
    );

    expect(patches).toEqual([
      {
        path: 'project/src/index.ts',
        comment: 'Entry point',
        source: 'ai',
        syncStatus: 'synced',
      },
      {
        path: 'missing.ts',
        comment: 'Ignored by diff',
        source: 'ai',
        syncStatus: 'synced',
      },
    ]);
  });

  it('creates provider requests for selection, visible, and target scopes', () => {
    const annotations: TreeAnnotationMap = applyTreeAnnotationPatches({}, [
      { path: 'project/src', comment: 'Existing' },
    ]);
    const selectionRequest = createAnnotationProviderRequest({
      annotations,
      language: ' zh ',
      overwrite: false,
      prompt: '  Explain selected files  ',
      scope: 'selection',
      selectedPaths: ['project/src'],
      target: 'all',
      tree,
    });

    expect(selectionRequest.payload.language).toBe('zh');
    expect(selectionRequest.payload.overwrite).toBe(false);
    expect(selectionRequest.payload.prompt).toBe('Explain selected files');
    expect(selectionRequest.payload.scope).toBe('selection');
    expect(selectionRequest.payload.target).toBe('all');
    expect(selectionRequest.sourcePaths).toEqual(
      new Set(['project/src', 'project/src/index.ts'])
    );
    expect(selectionRequest.allowedPaths).toEqual(
      new Set(['project/src/index.ts'])
    );
    expect(selectionRequest.payload.nodes).toEqual([
      { path: 'project/src', kind: 'directory', comment: 'Existing' },
      { path: 'project/src/index.ts', kind: 'file' },
    ]);

    const visibleRequest = createAnnotationProviderRequest({
      scope: 'visible',
      target: 'directories',
      tree,
      visibleTree: {
        name: 'project',
        path: 'project',
        kind: 'directory',
        children: [],
      },
    });

    expect(visibleRequest.allowedPaths).toEqual(new Set(['project']));
    expect(visibleRequest.payload.nodes).toEqual([
      { path: 'project', kind: 'directory' },
    ]);

    const filesRequest = createAnnotationProviderRequest({
      scope: 'all',
      target: 'files',
      tree,
    });

    expect(filesRequest.allowedPaths).toEqual(
      new Set(['project/src/index.ts'])
    );
    expect(filesRequest.payload.nodes).toEqual([
      { path: 'project/src/index.ts', kind: 'file' },
    ]);
  });

  it('normalizes provider aliases and diffs duplicate or out-of-scope paths', () => {
    const request = createAnnotationProviderRequest({
      scope: 'all',
      target: 'all',
      tree,
    });
    const patches = createTreeAnnotationPatchesFromProviderResult(
      {
        annotations: [
          { path: 'src/index.ts', comment: 'Entry point' },
          { path: './src/index.ts', comment: 'Updated entry' },
          { path: 'project/src', comment: '   ' },
          { path: 'unknown/path.ts', comment: 'Outside scope' },
        ],
      },
      request.sourcePaths
    );
    const diff = createAnnotationDiffResult({}, patches, request.allowedPaths);

    expect(patches).toEqual([
      {
        path: 'project/src/index.ts',
        comment: 'Entry point',
        source: 'ai',
        syncStatus: 'synced',
      },
      {
        path: 'project/src/index.ts',
        comment: 'Updated entry',
        source: 'ai',
        syncStatus: 'synced',
      },
      {
        path: 'unknown/path.ts',
        comment: 'Outside scope',
        source: 'ai',
        syncStatus: 'synced',
      },
    ]);
    expect(diff.added).toEqual([
      {
        nextComment: 'Updated entry',
        path: 'project/src/index.ts',
        previousComment: '',
      },
    ]);
    expect(diff.skipped).toEqual([
      {
        nextComment: 'Outside scope',
        path: 'unknown/path.ts',
        previousComment: '',
        reason: 'outside-scope',
      },
    ]);
    expect(diff.nextAnnotations['project/src/index.ts']?.comment).toBe(
      'Updated entry'
    );
  });

  it('resolves annotation retention after reading a new tree', () => {
    const annotations: TreeAnnotationMap = applyTreeAnnotationPatches({}, [
      { path: 'project/src', comment: 'Source folder' },
      { path: 'project/missing.ts', comment: 'Missing file' },
    ]);

    expect(resolveTreeAnnotationsAfterRead(tree, annotations, 'reset')).toEqual(
      {}
    );
    expect(
      Object.keys(
        resolveTreeAnnotationsAfterRead(tree, annotations, 'matching-paths')
      )
    ).toEqual(['project/src']);
  });
});
