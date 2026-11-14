import { describe, expect, it } from 'vitest';
import {
  renderAsciiTreeLines,
  ASCII_TREE_METADATA_PRESET_STYLES,
  type AsciiTreeOptions,
} from '../src/ascii';
import { parseEditedAsciiTree, parseImportedTreeText } from '../src/parser';
import { renderAnnotatedAsciiTree } from '../src/annotations';
import { getFileTreeItems } from '../src/tree';
import type { FileNode } from '../src';

/**
 * Date: 2026-11-14
 * Desc: Covers rendered text edits without confusing names with display metadata
 */

const tree: FileNode = {
  name: 'root',
  path: 'root',
  kind: 'directory',
  children: [
    {
      name: 'entry.ts',
      path: 'root/entry.ts',
      kind: 'file',
      size: 42,
      lastModified: 1700000000000,
    },
    { name: 'diagnostics', path: 'root/diagnostics', kind: 'file' },
    { name: 'report (42B).txt', path: 'root/report (42B).txt', kind: 'file' },
    { name: 'empty', path: 'root/empty', kind: 'directory', children: [] },
    {
      name: 'src',
      path: 'root/src',
      kind: 'directory',
      children: [{ name: 'app.ts', path: 'root/src/app.ts', kind: 'file' }],
    },
  ],
};

describe('edited ASCII parsing', () => {
  it.each(['move', 'rename'])(
    'removes metadata when a node changes depth: %s',
    edit => {
      const lines = renderAsciiTreeLines(tree, { showFileSize: true });
      const text = lines
        .map(line => line.text)
        .join('\n')
        .replace(/^[^\n]*entry\.ts[^\n]*\n/mu, '')
        .replace(
          '    └── app.ts',
          `    ├── app.ts\n    └── ${edit === 'rename' ? 'moved.ts' : 'entry.ts'} (42B)`
        );
      const parsed = parseEditedAsciiTree(text, tree, { lines });
      expect(Object.keys(getFileTreeItems(parsed.tree))).toContain(
        `root/src/${edit === 'rename' ? 'moved.ts' : 'entry.ts'}`
      );
      expect(
        Object.keys(getFileTreeItems(parsed.tree)).some(path =>
          path.endsWith('(42B)')
        )
      ).toBe(false);
    }
  );

  it.each(['[project]', '{project}', '1 | root'])(
    'preserves literal root names: %s',
    name => {
      const original: FileNode = {
        name,
        path: name,
        kind: 'directory',
        children: [{ name: 'a.ts', path: `${name}/a.ts`, kind: 'file' }],
      };
      const lines = renderAsciiTreeLines(original);
      const parsed = parseEditedAsciiTree(
        lines
          .map(line => line.text)
          .join('\n')
          .replace('a.ts', 'b.ts'),
        original,
        { lines }
      );
      expect(parsed.tree.name).toBe(name);
      expect(parsed.tree.children?.[0]?.path).toBe(`${name}/b.ts`);
    }
  );

  it('keeps baseline punctuation in labels separate from structural syntax and comments', () => {
    const names = ['part ├── name.txt', 'notes  # draft.txt', '1 | note.txt'];
    const original: FileNode = {
      name: 'root',
      path: 'root',
      kind: 'directory',
      children: names.map(name => ({
        name,
        path: `root/${name}`,
        kind: 'file',
      })),
    };
    const lines = renderAsciiTreeLines(original);
    const text = lines.map(line => line.text).join('\n') + '\n└── added.ts';
    const parsed = parseEditedAsciiTree(text, original, { lines });
    expect(parsed.tree.children?.map(node => node.name)).toEqual([
      ...names,
      'added.ts',
    ]);
  });

  const options: AsciiTreeOptions[] = [
    ...ASCII_TREE_METADATA_PRESET_STYLES.map(metadataStyle => ({
      metadataStyle,
      showFileSize: true,
      showModifiedTime: true,
    })),
    ...(['spaces-2', 'spaces-4', 'tab-1', 'tab-2'] as const).map(
      indentationStyle => ({
        indentationStyle,
        showLineNumbers: true,
        connectorStyle: 'ascii' as const,
      })
    ),
    { showRoot: false, appendDirectorySlash: true },
    { rootLabelMode: 'dot', showLineNumbers: true },
    {
      connectorParts: {
        branch: '>',
        lastBranch: '>',
        horizontal: '=',
        vertical: ':',
      },
      showModifiedTime: true,
    },
    {
      metadataTemplate: '<%size%> %filename% [updated %YYYY-MM-DD%]',
      showFileSize: true,
      showModifiedTime: true,
    },
  ];
  it.each(options)(
    'renames without importing metadata and retains untouched kinds: %j',
    syntax => {
      const lines = renderAsciiTreeLines(tree, syntax);
      const text = renderAnnotatedAsciiTree(
        lines,
        {},
        { commentTemplate: '# %comment%' }
      ).replace('entry.ts', 'renamed.ts');
      const parsed = parseEditedAsciiTree(text, tree, {
        lines,
        syntax,
        commentTemplate: '# %comment%',
      });
      const items = getFileTreeItems(parsed.tree);
      expect(items['root/renamed.ts']?.data.kind).toBe('file');
      expect(items['root/entry.ts']).toBeUndefined();
      expect(items['root/diagnostics']?.data.kind).toBe('file');
      expect(items['root/report (42B).txt']?.data.kind).toBe('file');
      expect(items['root/empty']?.data.kind).toBe('directory');
      expect(items['root/src/app.ts']?.data.kind).toBe('file');
    }
  );

  it('uses default rendered syntax and does not mutate the baseline', () => {
    const lines = renderAsciiTreeLines(tree, {
      showFileSize: true,
      metadataStyle: 'suffix-parentheses',
    });
    const saved = JSON.stringify(lines);
    const parsed = parseEditedAsciiTree(
      lines
        .map(l => l.text)
        .join('\n')
        .replace('entry.ts', 'other.ts'),
      tree,
      { lines }
    );
    expect(getFileTreeItems(parsed.tree)['root/other.ts']).toBeDefined();
    expect(JSON.stringify(lines)).toBe(saved);
    expect(
      parseImportedTreeText('root\n└── report (42B).txt', 'root').tree
        .children?.[0]?.name
    ).toBe('report (42B).txt');
  });

  it('supports insertion, removal and reorder while parsing manual empty comments', () => {
    const lines = renderAsciiTreeLines(tree, { appendDirectorySlash: true });
    const text = 'root/\n├── empty/\n├── new.ts  # new note\n└── entry.ts';
    const parsed = parseEditedAsciiTree(text, tree, {
      lines,
      commentTemplate: '# %comment%',
    });
    expect(parsed.tree.children?.map(n => n.name)).toEqual([
      'empty',
      'new.ts',
      'entry.ts',
    ]);
    expect(parsed.annotations['root/new.ts']?.comment).toBe('new note');
    expect(parsed.annotations['root/entry.ts']?.comment ?? '').toBe('');
  });

  it('reports a line diagnostic instead of guessing an opaque custom label', () => {
    const lines = renderAsciiTreeLines(tree, {
      renderNodeLabel: () => 'opaque label',
    });
    expect(() =>
      parseEditedAsciiTree(
        lines
          .map(l => l.text)
          .join('\n')
          .replace('opaque label', 'changed label'),
        tree,
        { lines }
      )
    ).toThrow(expect.objectContaining({ code: 'invalid_tree', line: 1 }));
  });

  it('preserves extensionless file kinds under folders with identical rendered child labels', () => {
    const nested: FileNode = {
      name: 'root',
      path: 'root',
      kind: 'directory',
      children: ['a', 'b'].map(name => ({
        name,
        path: `root/${name}`,
        kind: 'directory',
        children: [
          { name: 'LICENSE', path: `root/${name}/LICENSE`, kind: 'file' },
        ],
      })),
    };
    const lines = renderAsciiTreeLines(nested);
    const result = parseEditedAsciiTree(
      lines.map(line => line.text).join('\n'),
      nested,
      { lines }
    );
    const items = getFileTreeItems(result.tree);
    expect(items['root/a/LICENSE']?.data.kind).toBe('file');
    expect(items['root/b/LICENSE']?.data.kind).toBe('file');
  });

  it('indexes repeated labels once instead of rescanning all identical filenames per row', () => {
    const nested: FileNode = {
      name: 'root',
      path: 'root',
      kind: 'directory',
      children: Array.from({ length: 1000 }, (_, index) => ({
        name: `dir-${index}`,
        path: `root/dir-${index}`,
        kind: 'directory',
        children: [
          { name: 'LICENSE', path: `root/dir-${index}/LICENSE`, kind: 'file' },
        ],
      })),
    };
    let reads = 0;
    const lines = renderAsciiTreeLines(nested).map(line => ({
      ...line,
      get node() {
        reads++;
        return line.node;
      },
    }));
    const parsed = parseEditedAsciiTree(
      lines.map(line => line.text).join('\n'),
      nested,
      { lines }
    );
    expect(Object.keys(getFileTreeItems(parsed.tree))).toHaveLength(2001);
    expect(reads).toBeLessThan(lines.length * 30);
  });
});
