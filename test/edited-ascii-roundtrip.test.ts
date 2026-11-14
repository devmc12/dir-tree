import { describe, expect, it } from 'vitest';
import { renderAnnotatedAsciiTree } from '../src/annotations';
import { renderAsciiTreeLines, type AsciiTreeOptions } from '../src/ascii';
import { parseEditedAsciiTree } from '../src/parser';
import type { FileNode } from '../src/reader/types';
import { getFileTreeItems } from '../src/tree';

/**
 * Date: 2026-11-14
 * Desc: Checks combined display settings against unchanged tree and annotation data
 */

/** Combines independent public render settings into reproducible round-trip cases */
function combinations(groups: AsciiTreeOptions[][]): AsciiTreeOptions[] {
  return groups.reduce<AsciiTreeOptions[]>(
    (cases, group) =>
      cases.flatMap(options => group.map(value => ({ ...options, ...value }))),
    [{}]
  );
}

/** Compares structural data without treating rendered metadata as imported source data */
function shape(tree: FileNode): Array<[string, FileNode['kind']]> {
  return Object.values(getFileTreeItems(tree)).map(({ data }) => [
    data.path,
    data.kind,
  ]);
}

const indentationCases: AsciiTreeOptions[] = [
  { indentationStyle: 'spaces-2' },
  { indentationStyle: 'spaces-4' },
  { indentationStyle: 'tab-1' },
  { indentationStyle: 'tab-2' },
];

describe('edited ASCII combined display settings', () => {
  it('preserves structure across 256 combinations of hierarchy and label settings', () => {
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
            {
              name: 'LICENSE',
              path: 'project/src/LICENSE',
              kind: 'file',
              size: 42,
            },
            {
              name: 'app.ts',
              path: 'project/src/app.ts',
              kind: 'file',
              size: 64,
            },
          ],
        },
        {
          name: 'empty',
          path: 'project/empty',
          kind: 'directory',
          children: [],
        },
        {
          name: 'README.md',
          path: 'project/README.md',
          kind: 'file',
          size: 123,
        },
      ],
    };
    const cases = combinations([
      indentationCases,
      [{ connectorStyle: 'ascii' }, { connectorStyle: 'unicode' }],
      [{ showRoot: false }, { showRoot: true }],
      [{ showLineNumbers: false }, { showLineNumbers: true }],
      [{ rootLabelMode: 'name' }, { rootLabelMode: 'dot' }],
      [{ appendDirectorySlash: false }, { appendDirectorySlash: true }],
      [{ showFileSize: false }, { showFileSize: true }],
    ]);
    for (const syntax of cases) {
      const lines = renderAsciiTreeLines(tree, syntax);
      const parsed = parseEditedAsciiTree(
        lines.map(line => line.text).join('\n'),
        tree,
        { lines, syntax }
      );
      expect(shape(parsed.tree), JSON.stringify(syntax)).toEqual(shape(tree));
    }
  });

  it('preserves literal names and comments across 384 full-path and metadata combinations', () => {
    const names = [
      'LICENSE',
      'folder.with.dot',
      '__proto__',
      'notes  # draft.txt',
      '报告(42B).md',
      '1 | note.txt',
    ];
    const tree: FileNode = {
      name: '[project]',
      path: '[project]',
      kind: 'directory',
      children: names.map((name, index) => ({
        name,
        path: `[project]/${name}`,
        kind: index === 1 ? 'directory' : 'file',
        size: index * 31,
        ...(index === 1 ? { children: [] } : {}),
      })),
    };
    const annotations = Object.fromEntries(
      names.map(name => [
        `[project]/${name}`,
        {
          path: `[project]/${name}`,
          comment: '注释 / # () | test',
          updatedAt: 1,
          source: 'manual' as const,
          syncStatus: 'local' as const,
        },
      ])
    );
    const cases = combinations([
      indentationCases,
      [{ showFullPath: false }, { showFullPath: true }],
      [{ showRoot: false }, { showRoot: true }],
      [{ showLineNumbers: false }, { showLineNumbers: true }],
      [{ rootLabelMode: 'name' }, { rootLabelMode: 'dot' }],
      [
        { metadataStyle: 'prefix-brackets' },
        { metadataStyle: 'suffix-parentheses' },
      ],
      [{ appendDirectorySlash: true, showFileSize: true }],
    ]);
    for (const syntax of cases) {
      const lines = renderAsciiTreeLines(tree, syntax);
      for (const commentTemplate of [
        '# %comment%',
        '// %comment%',
        '/* %comment% */',
      ]) {
        const text = renderAnnotatedAsciiTree(lines, annotations, {
          commentTemplate,
        });
        const parsed = parseEditedAsciiTree(text, tree, {
          lines,
          syntax,
          commentTemplate,
        });
        expect(shape(parsed.tree), JSON.stringify(syntax)).toEqual(shape(tree));
        for (const name of names) {
          expect(parsed.annotations[`[project]/${name}`]?.comment).toBe(
            '注释 / # () | test'
          );
        }
      }
    }
  });
});
