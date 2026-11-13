import { describe, expect, it } from 'vitest';
import { compareFileTrees, filterMatchingFileTreeState } from '../src/tree';
import type { FileNode } from '../src';

/**
 * Date: 2026-11-14
 * Desc: Verifies tree differences and reusable state retention boundaries
 */

function tree(names = ['a.ts', 'b.ts']): FileNode {
  return {
    name: 'root',
    path: 'root',
    kind: 'directory',
    children: names.map(name => ({ name, path: `root/${name}`, kind: 'file' })),
  };
}

describe('tree comparison', () => {
  it('reports insertion and removal once, and reordering on the actual parent', () => {
    expect(compareFileTrees(tree(), tree(['b.ts', 'c.ts'])).changes).toEqual([
      { path: 'root/a.ts', kind: 'removed' },
      { path: 'root/c.ts', kind: 'added' },
    ]);
    expect(compareFileTrees(tree(), tree(['b.ts', 'a.ts'])).changes).toEqual([
      { path: 'root', kind: 'changed' },
    ]);
    expect(compareFileTrees(tree(), tree()).changes).toEqual([]);
  });

  it('retains metadata changes but excludes changed kinds from state matching', () => {
    const before = tree();
    const after = tree();
    after.children![0]!.size = 12;
    after.children![1]!.kind = 'directory';
    const result = compareFileTrees(before, after);
    expect(result.changes).toEqual([
      { path: 'root/a.ts', kind: 'changed' },
      { path: 'root/b.ts', kind: 'changed' },
    ]);
    expect([...result.matchingPaths]).toEqual(['root', 'root/a.ts']);
    const value = { comment: 'kept' };
    const state = { 'root/a.ts': value, 'root/b.ts': value, removed: value };
    const retained = filterMatchingFileTreeState(state, result.matchingPaths);
    expect(Object.keys(retained)).toEqual(['root/a.ts']);
    expect(retained['root/a.ts']).toBe(value);
    expect(Object.keys(state)).toHaveLength(3);
    const dated = tree();
    dated.children![0]!.lastModified = 1;
    expect(compareFileTrees(before, dated).changes).toEqual([
      { path: 'root/a.ts', kind: 'changed' },
    ]);
  });

  it('handles empty trees and treats renamed or moved paths as removed and added', () => {
    expect(compareFileTrees(null, null).changes).toEqual([]);
    expect(
      compareFileTrees(null, tree()).changes.map(item => item.kind)
    ).toEqual(['added', 'added', 'added']);
    expect(
      compareFileTrees(tree(), null).changes.map(item => item.kind)
    ).toEqual(['removed', 'removed', 'removed']);
    expect(
      compareFileTrees(tree(['old.ts']), tree(['new.ts'])).changes
    ).toEqual([
      { path: 'root/old.ts', kind: 'removed' },
      { path: 'root/new.ts', kind: 'added' },
    ]);
  });

  it('handles special path names and ignores inherited map entries', () => {
    const root: FileNode = {
      name: '__proto__',
      path: '__proto__',
      kind: 'file',
    };
    const result = compareFileTrees(root, { ...root });
    const state = Object.create({ inherited: 'no' });
    Object.defineProperty(state, '__proto__', {
      value: 'yes',
      enumerable: true,
    });
    const filtered = filterMatchingFileTreeState(
      state,
      new Set([...result.matchingPaths, 'inherited'])
    );
    expect(Object.keys(filtered)).toEqual(['__proto__']);
    expect(filtered['__proto__']).toBe('yes');
  });

  it('reuses one comparison across state maps for a large tree', () => {
    const before = tree(Array.from({ length: 10000 }, (_, i) => `${i}.ts`));
    const result = compareFileTrees(before, before);
    const state = Object.fromEntries(
      [...result.matchingPaths].map(path => [path, true])
    );
    expect(result.changes).toEqual([]);
    expect(
      Object.keys(filterMatchingFileTreeState(state, result.matchingPaths))
    ).toHaveLength(10001);
    expect(
      Object.keys(filterMatchingFileTreeState(state, result.matchingPaths))
    ).toHaveLength(10001);
  });
});
