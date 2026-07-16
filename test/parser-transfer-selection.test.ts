import { describe, expect, it } from 'vitest';
import {
  createExportedFileTreeJson,
  parseImportedFileTreeJson,
} from '../src/transfer';
import { renderAsciiTree, renderAsciiTreeLines } from '../src/ascii';
import { renderAnnotatedAsciiTree } from '../src/annotations';
import {
  parseImportedMarkdownDocumentTreeText,
  parseImportedTreeText,
} from '../src/parser';
import {
  createTreeSelectionModel,
  toggleTreeSelection,
} from '../src/selection';
import {
  RemoteRepositoryFileSystemAdapter,
  mapRemoteRepositoryEntriesToFileTree,
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryRefPath,
  type RemoteRepositoryApiClient,
} from '../src/adapters';

/**
 * Date: 2026-06-07
 * Desc: Verifies parser, transfer, selection, and remote mapping helpers
 */

const unicodeRoundTripTree = {
  name: 'project',
  path: 'project',
  kind: 'directory' as const,
  children: [
    {
      name: 'README.md',
      path: 'project/README.md',
      kind: 'file' as const,
    },
    {
      name: 'src',
      path: 'project/src',
      kind: 'directory' as const,
      children: [
        {
          name: 'index.ts',
          path: 'project/src/index.ts',
          kind: 'file' as const,
        },
        {
          name: 'components',
          path: 'project/src/components',
          kind: 'directory' as const,
          children: [
            {
              name: 'Button.tsx',
              path: 'project/src/components/Button.tsx',
              kind: 'file' as const,
            },
          ],
        },
      ],
    },
    {
      name: 'package.json',
      path: 'project/package.json',
      kind: 'file' as const,
    },
  ],
};

describe('parser utilities', () => {
  it('round-trips the default Unicode ASCII renderer output', () => {
    const renderedTree = renderAsciiTree(unicodeRoundTripTree);
    const parsedTree = parseImportedTreeText(renderedTree, 'project', {
      format: 'ascii',
    });

    expect(renderedTree).toContain('│── README.md');
    expect(renderedTree).toContain('│   │── index.ts');
    expect(parsedTree.tree).toEqual(unicodeRoundTripTree);
  });

  it('applies an annotated default Unicode tree as a complete import', () => {
    const renderedTree = renderAnnotatedAsciiTree(
      renderAsciiTreeLines(unicodeRoundTripTree),
      {
        'project/README.md': {
          path: 'project/README.md',
          comment: 'Project overview',
          source: 'manual',
          syncStatus: 'local',
          updatedAt: 1,
        },
        'project/src/index.ts': {
          path: 'project/src/index.ts',
          comment: 'Entry point',
          source: 'manual',
          syncStatus: 'local',
          updatedAt: 1,
        },
      },
      { commentTemplate: '// %comment%' }
    );
    const parsedTree = parseImportedTreeText(renderedTree, 'project', {
      commentTemplate: '// %comment%',
    });

    expect(parsedTree.tree).toEqual(unicodeRoundTripTree);
    expect(parsedTree.annotations['project/README.md']?.comment).toBe(
      'Project overview'
    );
    expect(parsedTree.annotations['project/src/index.ts']?.comment).toBe(
      'Entry point'
    );
  });

  it('parses JSON, Markdown, and ASCII tree imports', () => {
    const json = parseImportedTreeText(
      JSON.stringify({
        name: 'project',
        kind: 'directory',
        children: [{ name: 'README.md', kind: 'file', comment: 'Docs' }],
      }),
      'project'
    );

    expect(json.tree.children?.[0]?.name).toBe('README.md');
    expect(json.annotations['project/README.md']?.comment).toBe('Docs');

    const markdown = parseImportedTreeText(
      '- project\n  - src\n    - index.ts',
      'project'
    );

    expect(markdown.tree.children?.[0]?.children?.[0]?.name).toBe('index.ts');

    const document = parseImportedMarkdownDocumentTreeText(
      'Notes\n```\nproject\n└── src\n    └── index.ts\n```',
      'project'
    );

    expect(document.tree.children?.[0]?.name).toBe('src');

    const xml = parseImportedTreeText(
      '<tree><directory name="project"><file name="README.md" comment="Docs" /></directory></tree>',
      'project'
    );

    expect(xml.tree.children?.[0]?.name).toBe('README.md');
    expect(xml.annotations['project/README.md']?.comment).toBe('Docs');

    const html = parseImportedTreeText(
      '<ul><li>project<ul><li>src<ul><li>index.ts</li></ul></li></ul></li></ul>',
      'project'
    );

    expect(html.tree.children?.[0]?.children?.[0]?.name).toBe('index.ts');
  });

  it('parses tree CLI XML, HTML pre blocks, Windows tree, and annotated ASCII fixtures', () => {
    const treeXml = parseImportedTreeText(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tree>',
        '  <directory name="project">',
        '    <directory name="src">',
        '      <file name="index.ts" size="31" comment="Entry" />',
        '    </directory>',
        '  </directory>',
        '</tree>',
      ].join('\n'),
      'project',
      { format: 'tree-xml' }
    );

    expect(treeXml.tree.children?.[0]?.children?.[0]?.size).toBe(31);
    expect(treeXml.annotations['project/src/index.ts']?.comment).toBe('Entry');

    const treeHtml = parseImportedTreeText(
      [
        '<html><body><pre>',
        'project',
        '|-- src',
        '|   `-- index.ts',
        '`-- README.md',
        '</pre></body></html>',
      ].join('\n'),
      'project',
      { format: 'tree-html' }
    );

    expect(treeHtml.tree.children?.map(child => child.name)).toEqual([
      'src',
      'README.md',
    ]);
    expect(treeHtml.tree.children?.[0]?.children?.[0]?.name).toBe('index.ts');

    const windowsTree = parseImportedTreeText(
      [
        'project',
        '+---src',
        '|   \\---components',
        '|       \\---Button.tsx',
        '\\---README.md',
      ].join('\n'),
      'project',
      { format: 'ascii' }
    );

    expect(
      windowsTree.tree.children?.[0]?.children?.[0]?.children?.[0]?.name
    ).toBe('Button.tsx');
    expect(windowsTree.tree.children?.[1]?.name).toBe('README.md');

    const annotatedAscii = parseImportedTreeText(
      [
        '1 | project',
        '2 | └── src       // Source folder',
        '3 |     └── index.ts       // Entry point',
      ].join('\n'),
      'project',
      { commentTemplate: '// %comment%', format: 'ascii' }
    );

    expect(annotatedAscii.annotations['project/src']?.comment).toBe(
      'Source folder'
    );
    expect(annotatedAscii.annotations['project/src/index.ts']?.comment).toBe(
      'Entry point'
    );
  });
});

describe('transfer utilities', () => {
  it('exports JSON without annotations or visibility options', () => {
    const rawJson = createExportedFileTreeJson({
      name: 'project',
      path: 'project',
      kind: 'directory',
      children: [
        { name: 'README.md', path: 'project/README.md', kind: 'file' },
      ],
    });
    const parsed = parseImportedFileTreeJson(rawJson);

    expect(parsed.tree.children?.[0]?.name).toBe('README.md');
    expect(Object.keys(parsed.annotations)).toHaveLength(0);
  });

  it('exports and imports JSON with annotations and visibility', () => {
    const rawJson = createExportedFileTreeJson(
      {
        name: 'project',
        path: 'project',
        kind: 'directory',
        children: [{ name: 'src', path: 'project/src', kind: 'directory' }],
      },
      {
        'project/src': {
          path: 'project/src',
          comment: 'Source',
          source: 'manual',
          syncStatus: 'local',
          updatedAt: 1,
        },
      },
      { visibility: { 'project/src': 'children-hidden' } }
    );
    const parsed = parseImportedFileTreeJson(rawJson);

    expect(parsed.annotations['project/src']?.comment).toBe('Source');
    expect(parsed.hiddenItems['project/src']).toBe('children-hidden');
  });
});

describe('selection utilities', () => {
  it('normalizes cascading selection states', () => {
    const data = {
      rootId: '__root__',
      items: {
        __root__: { id: '__root__', children: ['project'] },
        project: { id: 'project', children: ['project/src'] },
        'project/src': {
          id: 'project/src',
          children: ['project/src/index.ts'],
        },
        'project/src/index.ts': { id: 'project/src/index.ts' },
      },
    };
    const selectedIds = toggleTreeSelection(data, [], 'project/src');
    const model = createTreeSelectionModel(data, selectedIds);

    expect(model.selectedIds).toEqual([
      'project',
      'project/src',
      'project/src/index.ts',
    ]);
    expect(model.selectionStateById.project).toBe('checked');
  });
});

describe('remote repository mapping', () => {
  it('parses repository URLs and resolves branch path references', () => {
    const github = parseRemoteRepositoryUrl(
      'https://github.com/acme/project/tree/feature/docs/src'
    );

    expect(github.provider).toBe('github');
    expect(github.repositoryName).toBe('project');

    const githubRef = resolveRemoteRepositoryRefPath(github, [
      { name: 'main', default: true },
      { name: 'feature/docs' },
    ]);

    expect(githubRef).toEqual({ ref: 'feature/docs', path: 'src' });

    const gitlab = parseRemoteRepositoryUrl(
      'https://gitlab.com/group/sub/project/-/tree/release/app'
    );

    expect(gitlab.provider).toBe('gitlab');
    expect(gitlab.projectPath).toBe('group/sub/project');
  });

  it('maps repository entries into a stable file tree', () => {
    const tree = mapRemoteRepositoryEntriesToFileTree({
      rootName: 'repo',
      entries: [
        { kind: 'directory', path: 'src' },
        { kind: 'file', path: 'src/index.ts', size: 10 },
        { kind: 'file', path: '.env' },
      ],
      readOptions: { readFileMeta: true, showHidden: false },
    });

    expect(tree.children?.[0]?.path).toBe('repo/src');
    expect(tree.children?.[0]?.children?.[0]?.size).toBe(10);
    expect(tree.children?.some(child => child.name === '.env')).toBe(false);
  });

  it('reads repository entries through an injected API client', async () => {
    const calls: string[] = [];
    const apiClient: RemoteRepositoryApiClient = {
      async getDefaultBranch() {
        calls.push('default-branch');
        return 'main';
      },
      async listBranches() {
        return [];
      },
      async listTreeEntries(_parsedUrl, ref, options) {
        calls.push(`${ref}:${options?.subPath ?? ''}`);
        return [
          { kind: 'directory', path: 'packages/core' },
          { kind: 'file', path: 'packages/core/index.ts', size: 42 },
          { kind: 'file', path: 'packages/core/.env', size: 1 },
        ];
      },
    };
    const adapter = new RemoteRepositoryFileSystemAdapter(
      {
        apiClient,
        path: 'packages/core',
        ref: 'main',
        repositoryUrl: 'https://github.com/acme/project',
      },
      { readFileMeta: true, showHidden: false }
    );
    const tree = await adapter.read();

    expect(calls).toEqual(['main:packages/core']);
    expect(tree.name).toBe('core');
    expect(tree.children?.[0]?.name).toBe('index.ts');
    expect(tree.children?.[0]?.size).toBe(42);
    expect(tree.children?.some(child => child.name === '.env')).toBe(false);
  });
});
