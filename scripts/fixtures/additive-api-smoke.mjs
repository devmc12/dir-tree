import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Date: 2026-11-14
 * Desc: Executes additive 2.x helpers from isolated ESM and CommonJS package consumers
 */

const require = createRequire(import.meta.url);
for (const mode of ['esm', 'cjs']) {
  const load = specifier =>
    mode === 'esm' ? import(specifier) : require(specifier);
  const { renderAsciiTreeLines } = await load('@devmc12/dir-tree/ascii');
  const { parseEditedAsciiTree } = await load('@devmc12/dir-tree/parser');
  const rootApi = await load('@devmc12/dir-tree');
  const { setTreeSelection } = await load('@devmc12/dir-tree/selection');
  const {
    compareFileTrees,
    filterMatchingFileTreeState,
    createFileTreeHiddenLookup,
  } = await load('@devmc12/dir-tree/tree');
  const {
    createManualAnnotationDiffResult,
    filterAnnotationDiffByExcludedPaths,
  } = await load('@devmc12/dir-tree/annotations');
  const tree = {
    name: 'root',
    path: 'root',
    kind: 'directory',
    children: [{ name: 'a.ts', path: 'root/a.ts', kind: 'file', size: 42 }],
  };
  const lines = renderAsciiTreeLines(tree, { showFileSize: true });
  const parsed = parseEditedAsciiTree(
    lines
      .map(line => line.text)
      .join('\n')
      .replace('a.ts', 'b.ts'),
    tree,
    { lines }
  );
  assert.equal(parsed.tree.children[0].path, 'root/b.ts', mode);
  assert.equal(parsed.renames, undefined, mode);
  // Both public entries must expose the opt-in result in each module format
  for (const parse of [parseEditedAsciiTree, rootApi.parseEditedAsciiTree]) {
    const renamed = parse(
      lines
        .map(line => line.text)
        .join('\n')
        .replace(/^root/u, 'renamed'),
      tree,
      { lines, detectRenames: true }
    );
    assert.deepEqual(
      renamed.renames,
      [{ fromPath: 'root', toPath: 'renamed' }],
      mode
    );
    assert.equal(renamed.tree.children[0].name, 'a.ts', mode);
    assert.equal(renamed.tree.children[0].kind, 'file', mode);
    assert.equal(tree.path, 'root', mode);
  }
  const comparison = compareFileTrees(tree, parsed.tree);
  assert.deepEqual(
    comparison.changes,
    [
      { path: 'root/a.ts', kind: 'removed' },
      { path: 'root/b.ts', kind: 'added' },
    ],
    mode
  );
  assert.deepEqual(
    Object.keys(
      filterMatchingFileTreeState(
        { root: true, 'root/a.ts': true },
        comparison.matchingPaths
      )
    ),
    ['root'],
    mode
  );
  assert.equal(
    createFileTreeHiddenLookup(tree, { root: 'children-hidden' })['root/a.ts'],
    true,
    mode
  );
  assert.deepEqual(
    setTreeSelection(
      {
        rootId: 'root',
        rootSelectable: true,
        items: {
          root: { id: 'root', children: ['root/a.ts'] },
          'root/a.ts': { id: 'root/a.ts' },
        },
      },
      [],
      ['root'],
      true
    ),
    ['root', 'root/a.ts'],
    mode
  );
  const annotations = {
    'root/a.ts': {
      path: 'root/a.ts',
      comment: 'old',
      source: 'manual',
      syncStatus: 'local',
      updatedAt: 1,
    },
  };
  const diff = createManualAnnotationDiffResult(annotations, [
    { path: 'root/a.ts', comment: '' },
  ]);
  assert.equal(diff.nextAnnotations['root/a.ts'], undefined, mode);
  assert.equal(
    filterAnnotationDiffByExcludedPaths(diff, new Set(['root/a.ts']))
      .nextAnnotations['root/a.ts'].comment,
    'old',
    mode
  );
}
