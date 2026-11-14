import { describe, expect, it } from 'vitest';
import { parseEditedAsciiTree } from '../src/parser';
import { renderAsciiTreeLines, type AsciiTreeOptions } from '../src/ascii';
import { getFileTreeItems, compareFileTrees } from '../src/tree';
import type { FileNode } from '../src';

/**
 * Date: 2026-11-15
 * Desc: Covers opt-in rename evidence without changing legacy path comparison
 */

function fixture(): FileNode {
  return {
    name: 'root',
    path: 'project/root',
    kind: 'directory',
    children: [
      { name: 'LICENSE', path: 'project/root/LICENSE', kind: 'file' },
      {
        name: 'src',
        path: 'project/root/src',
        kind: 'directory',
        children: [
          { name: 'main.ts', path: 'project/root/src/main.ts', kind: 'file' },
          {
            name: 'empty',
            path: 'project/root/src/empty',
            kind: 'directory',
            children: [],
          },
        ],
      },
      { name: 'last.ts', path: 'project/root/last.ts', kind: 'file' },
    ],
  };
}
function parse(edit: (s: string) => string, options: AsciiTreeOptions = {}) {
  const root = fixture();
  const before = JSON.stringify(root);
  const lines = renderAsciiTreeLines(root, options);
  const text = edit(lines.map(line => line.text).join('\n'));
  const result = parseEditedAsciiTree(text, root, {
    lines,
    syntax: options,
    detectRenames: true,
  });
  expect(JSON.stringify(root)).toBe(before);
  return result;
}

describe('opt-in edited tree renames', () => {
  it('keeps same-named files and folders distinct after a root rename', () => {
    for (const reverse of [false, true]) {
      const kinds: FileNode['kind'][] = reverse
        ? ['directory', 'file']
        : ['file', 'directory'];
      const root: FileNode = {
        name: 'root',
        path: 'root',
        kind: 'directory',
        children: kinds.map((kind, index) => ({
          name: `p${index}`,
          path: `root/p${index}`,
          kind: 'directory',
          children: [
            {
              name: 'same.txt',
              path: `root/p${index}/same.txt`,
              kind,
              ...(kind === 'directory' ? { children: [] } : {}),
            },
          ],
        })),
      };
      const lines = renderAsciiTreeLines(root);
      const result = parseEditedAsciiTree(
        lines
          .map(l => l.text)
          .join('\n')
          .replace('root', 'renamed'),
        root,
        { lines, detectRenames: true }
      );
      expect(result.renames).toEqual([{ fromPath: 'root', toPath: 'renamed' }]);
      for (const [index, kind] of kinds.entries())
        expect(
          getFileTreeItems(result.tree)[`renamed/p${index}/same.txt`]?.data.kind
        ).toBe(kind);
    }
  });
  it('does not discard new children when a file root becomes a directory', () => {
    const root: FileNode = { name: 'root.txt', path: 'root.txt', kind: 'file' };
    const lines = renderAsciiTreeLines(root);
    const result = parseEditedAsciiTree('root.txt\n└── child.ts', root, {
      lines,
      detectRenames: true,
    });
    expect(result.tree.kind).toBe('directory');
    expect(result.tree.children?.[0]?.name).toBe('child.ts');
    expect(result.renames).toEqual([]);
  });
  it('keeps legacy parsing and path comparison unchanged', () => {
    const root = fixture(),
      lines = renderAsciiTreeLines(root);
    const text = lines
      .map(line => line.text)
      .join('\n')
      .replace('root', 'renamed');
    const result = parseEditedAsciiTree(text, root, { lines });
    expect(result.renames).toBeUndefined();
    expect(result.matchedPaths.size).toBe(0);
    expect(
      compareFileTrees(root, result.tree).changes.every(
        c => c.kind !== 'changed'
      )
    ).toBe(true);
    expect(
      parseEditedAsciiTree(text, root, { detectRenames: true }).renames
    ).toEqual([]);
  });
  it('recognizes one root rename while retaining extensionless files and empty folders', () => {
    const result = parse(s =>
      s.replace('root', 'renamed').replace('main.ts', 'app.ts')
    );
    expect(result.renames).toEqual([
      { fromPath: 'project/root', toPath: 'project/renamed' },
      {
        fromPath: 'project/root/src/main.ts',
        toPath: 'project/renamed/src/app.ts',
      },
    ]);
    const items = getFileTreeItems(result.tree);
    expect(items['renamed/LICENSE']?.data.kind).toBe('file');
    expect(items['renamed/src/empty']?.data.kind).toBe('directory');
    expect(result.matchedPaths.size).toBe(0);
  });
  it('recognizes an extensionless file and a folder with unchanged visible descendants', () => {
    expect(parse(s => s.replace('LICENSE', 'NOTICE')).renames).toEqual([
      { fromPath: 'project/root/LICENSE', toPath: 'project/root/NOTICE' },
    ]);
    expect(
      getFileTreeItems(parse(s => s.replace('LICENSE', 'NOTICE')).tree)[
        'root/NOTICE'
      ]?.data.kind
    ).toBe('file');
    expect(parse(s => s.replace('src', 'source')).renames).toEqual([
      { fromPath: 'project/root/src', toPath: 'project/root/source' },
    ]);
  });
  it('does not infer ambiguous renames, folder rewrites, reordered candidates or kind changes', () => {
    expect(
      parse(s => s.replace('LICENSE', 'NOTICE').replace('last.ts', 'final.ts'))
        .renames
    ).toEqual([]);
    expect(
      parse(s => s.replace('src', 'source').replace('main.ts', 'app.ts'))
        .renames
    ).toEqual([]);
    expect(
      parse(s =>
        s.replace('LICENSE', 'last.ts').replace('└── last.ts', '└── NOTICE')
      ).renames
    ).toEqual([]);
    expect(parse(s => s.replace('LICENSE', 'NOTICE/')).renames).toEqual([]);
  });
  it('does not infer moves between folders', () => {
    const result = parse(s =>
      s
        .replace(/^[^\n]*LICENSE\n/mu, '')
        .replace('main.ts', 'NOTICE\n    ├── main.ts')
    );
    expect(result.renames).toEqual([]);
  });
  it('retains explicit file-to-folder edits when rename recognition is enabled', () => {
    for (const edit of [
      (s: string) => s.replace('LICENSE', 'LICENSE/'),
      (s: string) => s.replace('LICENSE', 'LICENSE\n│   └── child.txt'),
    ]) {
      const result = parse(edit);
      expect(result.renames).toEqual([]);
      expect(getFileTreeItems(result.tree)['root/LICENSE']?.data.kind).toBe(
        'directory'
      );
    }
  });
  it.each([
    { showRoot: false },
    { rootLabelMode: 'dot' },
  ] as AsciiTreeOptions[])(
    'does not rename a hidden or synthetic root: %j',
    options => {
      const result = parse(s => s, options);
      expect(result.renames).toEqual([]);
    }
  );
  it.each([
    { showLineNumbers: true, showFileSize: true, showModifiedTime: true },
    {
      indentationStyle: 'spaces-2',
      connectorStyle: 'ascii',
      appendDirectorySlash: true,
    },
    {
      connectorParts: {
        branch: '>',
        lastBranch: '>',
        horizontal: '=',
        vertical: ':',
      },
      showFullPath: true,
    },
  ] as AsciiTreeOptions[])('retains rendered syntax handling: %j', options => {
    const result = parse(s => s.replace('LICENSE', 'NOTICE'), options);
    expect(result.renames).toEqual([
      { fromPath: 'project/root/LICENSE', toPath: 'project/root/NOTICE' },
    ]);
  });
  it('handles a large sibling list without pairwise identity searches', () => {
    const root: FileNode = {
      name: 'root',
      path: 'root',
      kind: 'directory',
      children: Array.from({ length: 10000 }, (_, i) => ({
        name: `f${i}.ts`,
        path: `root/f${i}.ts`,
        kind: 'file',
      })),
    };
    const lines = renderAsciiTreeLines(root);
    const result = parseEditedAsciiTree(
      lines
        .map(l => l.text)
        .join('\n')
        .replace('f5000.ts', 'renamed.ts'),
      root,
      { lines, detectRenames: true }
    );
    expect(result.renames).toEqual([
      { fromPath: 'root/f5000.ts', toPath: 'root/renamed.ts' },
    ]);
    expect(result.tree.children).toHaveLength(10000);
  });
});
