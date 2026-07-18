import { describe, expect, it } from 'vitest';
import type { FileNode } from '../src';
import {
  createAsciiTreeOptionsFromConfig,
  getMonospaceTextWidth,
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
  type TreeAnnotationAlignmentMode,
  type TreeAnnotationMap,
} from '../src/annotations';
import { parseImportedTreeText } from '../src/parser';

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

const alignmentTree: FileNode = {
  name: 'project',
  path: 'project',
  kind: 'directory',
  children: [
    {
      name: 'src',
      path: 'project/src',
      kind: 'directory',
      children: [
        { name: 'a.ts', path: 'project/src/a.ts', kind: 'file' },
        {
          name: 'very-long-file-name.ts',
          path: 'project/src/very-long-file-name.ts',
          kind: 'file',
        },
      ],
    },
    {
      name: 'docs',
      path: 'project/docs',
      kind: 'directory',
      children: [
        {
          name: 'guide.md',
          path: 'project/docs/guide.md',
          kind: 'file',
        },
      ],
    },
  ],
};

const alignmentAnnotations = applyTreeAnnotationPatches({}, [
  { path: 'project', comment: 'root' },
  { path: 'project/src', comment: 'source' },
  { path: 'project/src/a.ts', comment: 'entry' },
  { path: 'project/src/very-long-file-name.ts', comment: 'long entry' },
  { path: 'project/docs', comment: 'docs' },
  { path: 'project/docs/guide.md', comment: 'guide' },
]);

const annotatedAlignmentGoldenOutput: Record<
  TreeAnnotationAlignmentMode,
  string
> = {
  'smart-column': [
    `project${' '.repeat(13)}# root`,
    `├── src${' '.repeat(13)}# source`,
    `│   │── a.ts${' '.repeat(8)}# entry`,
    `│   └── very-long-file-name.ts  # long entry`,
    `└── docs${' '.repeat(12)}# docs`,
    `    └── guide.md${' '.repeat(4)}# guide`,
  ].join('\n'),
  'whole-tree': [
    `project${' '.repeat(25)}# root`,
    `├── src${' '.repeat(25)}# source`,
    `│   │── a.ts${' '.repeat(20)}# entry`,
    `│   └── very-long-file-name.ts  # long entry`,
    `└── docs${' '.repeat(24)}# docs`,
    `    └── guide.md${' '.repeat(16)}# guide`,
  ].join('\n'),
  'folder-groups': [
    `project${' '.repeat(13)}# root`,
    `├── src${' '.repeat(13)}# source`,
    `│   │── a.ts${' '.repeat(20)}# entry`,
    `│   └── very-long-file-name.ts  # long entry`,
    `└── docs${' '.repeat(12)}# docs`,
    `    └── guide.md${' '.repeat(4)}# guide`,
  ].join('\n'),
  inline: [
    'project  # root',
    '├── src  # source',
    '│   │── a.ts  # entry',
    '│   └── very-long-file-name.ts  # long entry',
    '└── docs  # docs',
    '    └── guide.md  # guide',
  ].join('\n'),
};

/**
 * Reads the terminal display column before an annotation marker
 * @param line Rendered annotated ASCII line
 * @returns Monospace width before the annotation marker
 */
function getAnnotationColumn(line: string): number {
  const markerIndex = line.indexOf('#');

  if (markerIndex < 0) {
    throw new Error(`Missing annotation marker in line: ${line}`);
  }

  return getMonospaceTextWidth(line.slice(0, markerIndex));
}

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

  it('measures CJK, grapheme clusters, emoji, and tab stops', () => {
    expect(getMonospaceTextWidth('├── src')).toBe(7);
    expect(getMonospaceTextWidth('abc中文')).toBe(7);
    expect(getMonospaceTextWidth('e\u0301')).toBe(1);
    expect(getMonospaceTextWidth('👩‍💻')).toBe(2);
    expect(getMonospaceTextWidth('🇨🇳')).toBe(2);
    expect(getMonospaceTextWidth('✈️')).toBe(2);
    expect(getMonospaceTextWidth('abc\t中', 4)).toBe(6);
    expect(getMonospaceTextWidth('中文\tb', 4)).toBe(9);
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

    expect(createAnnotatedAsciiTreeRenderOptionsFromConfig({ gap: 0 })).toEqual(
      { gap: 2 }
    );
    expect(createAnnotatedAsciiTreeRenderOptionsFromConfig({ gap: 1 })).toEqual(
      { gap: 2 }
    );
    expect(
      createAnnotatedAsciiTreeRenderOptionsFromConfig({
        gap: Number.POSITIVE_INFINITY,
      })
    ).toEqual({ gap: 2 });
  });

  it.each<TreeAnnotationAlignmentMode>([
    'smart-column',
    'whole-tree',
    'folder-groups',
    'inline',
  ])('renders golden output for %s alignment', alignmentMode => {
    const renderedText = renderAnnotatedAsciiTree(
      renderAsciiTreeLines(alignmentTree),
      alignmentAnnotations,
      { alignmentMode, commentColumn: 20, gap: 2 }
    );

    expect(renderedText).toBe(annotatedAlignmentGoldenOutput[alignmentMode]);
  });

  it('ignores unannotated and synthetic lines for whole-tree width', () => {
    const filterTree: FileNode = {
      name: 'project',
      path: 'project',
      kind: 'directory',
      children: [
        {
          name: 'short.ts',
          path: 'project/short.ts',
          kind: 'file',
        },
        {
          name: 'this-unannotated-file-name-is-extremely-long.ts',
          path: 'project/this-unannotated-file-name-is-extremely-long.ts',
          kind: 'file',
        },
      ],
    };
    const lines = renderAsciiTreeLines(filterTree);
    const syntheticLine = {
      ...lines[0]!,
      isSynthetic: true,
      path: '',
      text: 'synthetic-line-that-must-not-control-the-comment-column',
    };
    const renderedText = renderAnnotatedAsciiTree(
      [syntheticLine, ...lines],
      applyTreeAnnotationPatches({}, [
        { path: '', comment: 'ignored synthetic comment' },
        { path: 'project', comment: 'root' },
        { path: 'project/short.ts', comment: 'short' },
      ]),
      { alignmentMode: 'whole-tree', commentColumn: 20 }
    );
    const annotatedLines = renderedText
      .split('\n')
      .filter(line => line.includes('#'));

    expect(annotatedLines.map(getAnnotationColumn)).toEqual([20, 20]);
    expect(renderedText).not.toContain('ignored synthetic comment');
  });

  it('isolates annotated folder groups and ignores unannotated siblings', () => {
    const groupedTree: FileNode = {
      name: 'project',
      path: 'project',
      kind: 'directory',
      children: [
        {
          name: 'alpha',
          path: 'project/alpha',
          kind: 'directory',
          children: [
            {
              name: 'short.ts',
              path: 'project/alpha/short.ts',
              kind: 'file',
            },
            {
              name: 'unannotated-file-name-that-is-extremely-long.ts',
              path: 'project/alpha/unannotated-file-name-that-is-extremely-long.ts',
              kind: 'file',
            },
          ],
        },
        {
          name: 'beta',
          path: 'project/beta',
          kind: 'directory',
          children: [
            {
              name: 'b.ts',
              path: 'project/beta/b.ts',
              kind: 'file',
            },
            {
              name: 'very-long-annotated-file-name.ts',
              path: 'project/beta/very-long-annotated-file-name.ts',
              kind: 'file',
            },
          ],
        },
        {
          name: 'gamma',
          path: 'project/gamma',
          kind: 'directory',
          children: [
            {
              name: 'x.ts',
              path: 'project/gamma/x.ts',
              kind: 'file',
            },
          ],
        },
      ],
    };
    const renderedText = renderAnnotatedAsciiTree(
      renderAsciiTreeLines(groupedTree),
      applyTreeAnnotationPatches({}, [
        { path: 'project/alpha/short.ts', comment: 'alpha short' },
        { path: 'project/beta/b.ts', comment: 'beta short' },
        {
          path: 'project/beta/very-long-annotated-file-name.ts',
          comment: 'beta long',
        },
        { path: 'project/gamma/x.ts', comment: 'gamma short' },
      ]),
      { alignmentMode: 'folder-groups', commentColumn: 20 }
    );
    const annotationColumns = new Map(
      renderedText
        .split('\n')
        .filter(line => line.includes('#'))
        .map(line => [
          line.slice(line.indexOf('#') + 2),
          getAnnotationColumn(line),
        ])
    );

    expect(annotationColumns.get('alpha short')).toBe(20);
    expect(annotationColumns.get('beta short')).toBe(
      annotationColumns.get('beta long')
    );
    expect(annotationColumns.get('beta long')).toBeGreaterThan(20);
    expect(annotationColumns.get('gamma short')).toBe(20);
  });

  it('aligns mixed Chinese and ASCII paths by terminal display width', () => {
    const mixedTree: FileNode = {
      name: '油猴插件',
      path: '油猴插件',
      kind: 'directory',
      children: [
        {
          name: 'Auto-refresh at top (Jira Dashboard).js',
          path: '油猴插件/Auto-refresh at top (Jira Dashboard).js',
          kind: 'file',
        },
        {
          name: 'Jira Bug Notifications.js',
          path: '油猴插件/Jira Bug Notifications.js',
          kind: 'file',
        },
        {
          name: 'jira-bugs.html',
          path: '油猴插件/jira-bugs.html',
          kind: 'file',
        },
        {
          name: '修改 Chrome 标签图标（消息数据提示）.js',
          path: '油猴插件/修改 Chrome 标签图标（消息数据提示）.js',
          kind: 'file',
        },
      ],
    };
    const mixedAnnotations = applyTreeAnnotationPatches({}, [
      { path: '油猴插件', comment: '油猴脚本集合' },
      {
        path: '油猴插件/Auto-refresh at top (Jira Dashboard).js',
        comment: '自动刷新 Jira 仪表盘',
      },
      {
        path: '油猴插件/Jira Bug Notifications.js',
        comment: '推送 Jira 缺陷提醒',
      },
      { path: '油猴插件/jira-bugs.html', comment: '展示 Jira 缺陷页面' },
      {
        path: '油猴插件/修改 Chrome 标签图标（消息数据提示）.js',
        comment: '标签图标显示消息数',
      },
    ]);
    const renderedLines = renderAnnotatedAsciiTree(
      renderAsciiTreeLines(mixedTree),
      mixedAnnotations,
      { alignmentMode: 'whole-tree', commentColumn: 40 }
    ).split('\n');

    expect(new Set(renderedLines.map(getAnnotationColumn))).toEqual(
      new Set([getAnnotationColumn(renderedLines[0]!)])
    );
    expect(
      new Set(renderedLines.map(line => line.indexOf('#'))).size
    ).toBeGreaterThan(1);
  });

  it('uses an independent normalized inline gap with legacy column fallback', () => {
    const rootLines = renderAsciiTreeLines({
      name: 'project',
      path: 'project',
      kind: 'directory',
    });
    const annotations = applyTreeAnnotationPatches({}, [
      { path: 'project', comment: 'root' },
    ]);

    expect(
      renderAnnotatedAsciiTree(rootLines, annotations, {
        alignmentMode: 'inline',
      })
    ).toBe('project  # root');
    expect(
      renderAnnotatedAsciiTree(rootLines, annotations, {
        alignmentMode: 'inline',
        gap: 0,
      })
    ).toBe('project  # root');
    expect(
      renderAnnotatedAsciiTree(rootLines, annotations, {
        alignmentMode: 'inline',
        gap: 2.6,
      })
    ).toBe('project   # root');
    expect(
      renderAnnotatedAsciiTree(rootLines, annotations, {
        alignmentMode: 'inline',
        commentColumn: 5,
      })
    ).toBe('project     # root');
    expect(
      renderAnnotatedAsciiTree(rootLines, annotations, {
        alignmentMode: 'inline',
        commentColumn: 5,
        gap: 3,
      })
    ).toBe('project   # root');
  });

  it('preserves root offsets for aligned layouts only', () => {
    const rootLines = renderAsciiTreeLines({
      name: 'project',
      path: 'project',
      kind: 'directory',
    });
    const annotations = applyTreeAnnotationPatches({}, [
      { path: 'project', comment: 'root' },
    ]);

    for (const alignmentMode of [
      'smart-column',
      'whole-tree',
      'folder-groups',
    ] satisfies TreeAnnotationAlignmentMode[]) {
      expect(
        getAnnotationColumn(
          renderAnnotatedAsciiTree(rootLines, annotations, {
            alignmentMode,
            commentColumn: 10,
            rootCommentOffset: 3,
          })
        )
      ).toBe(13);
    }

    expect(
      getAnnotationColumn(
        renderAnnotatedAsciiTree(rootLines, annotations, {
          alignmentMode: 'inline',
          gap: 2,
          rootCommentOffset: 3,
        })
      )
    ).toBe(9);
  });

  it('aligns comments with tab indentation and tab padding', () => {
    const renderedLines = renderAnnotatedAsciiTree(
      renderAsciiTreeLines(alignmentTree, { indentationStyle: 'tab-1' }),
      alignmentAnnotations,
      {
        alignmentMode: 'whole-tree',
        commentColumn: 20,
        gapPaddingMode: 'tabs',
      }
    ).split('\n');

    expect(new Set(renderedLines.map(getAnnotationColumn)).size).toBe(1);
  });

  it.each<TreeAnnotationAlignmentMode>([
    'smart-column',
    'whole-tree',
    'folder-groups',
    'inline',
  ])(
    'round-trips rendered %s annotations through both parsers',
    alignmentMode => {
      const lines = renderAsciiTreeLines(alignmentTree);
      const renderedText = renderAnnotatedAsciiTree(
        lines,
        alignmentAnnotations,
        { alignmentMode, commentColumn: 20, gap: 2 }
      );
      const parsedAnnotations = parseAnnotatedAsciiTree(lines, renderedText);
      const importedTree = parseImportedTreeText(renderedText, 'project', {
        format: 'ascii',
      });

      expect(parsedAnnotations.ignoredLineNumbers).toEqual([]);
      expect(
        parsedAnnotations.patches.map(({ path, comment }) => ({
          path,
          comment,
        }))
      ).toEqual(
        Object.values(alignmentAnnotations).map(({ path, comment }) => ({
          path,
          comment,
        }))
      );
      expect(importedTree.tree).toEqual(alignmentTree);
      expect(
        Object.fromEntries(
          Object.entries(importedTree.annotations).map(([path, annotation]) => [
            path,
            annotation.comment,
          ])
        )
      ).toEqual(
        Object.fromEntries(
          Object.entries(alignmentAnnotations).map(([path, annotation]) => [
            path,
            annotation.comment,
          ])
        )
      );
    }
  );

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
