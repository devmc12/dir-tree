import { describe, expect, it } from 'vitest';
import {
  createFileTreeHiddenLookup,
  createVisibleFileTree,
  getFileTreeItems,
} from '../src/tree';
import type { FileNode } from '../src';

/**
 * Date: 2026-11-14
 * Desc: Verifies inherited output visibility independently of UI styling
 */

const root: FileNode = {
  name: 'root',
  path: 'root',
  kind: 'directory',
  children: [
    {
      name: 'folder',
      path: 'root/folder',
      kind: 'directory',
      children: [{ name: 'file', path: 'root/folder/file', kind: 'file' }],
    },
    { name: 'other', path: 'root/other', kind: 'file' },
  ],
};

describe('effective visibility lookup', () => {
  it('distinguishes hidden nodes from folders with hidden children', () => {
    for (const mode of ['hidden', 'children-hidden'] as const) {
      const visibility = { 'root/folder': mode };
      const lookup = createFileTreeHiddenLookup(root, visibility);
      expect(lookup['root']).toBe(false);
      expect(lookup['root/folder']).toBe(mode === 'hidden');
      expect(lookup['root/folder/file']).toBe(true);
      expect(lookup['root/other']).toBe(false);
      const visible = getFileTreeItems(
        createVisibleFileTree(root, visibility)!
      );
      for (const [path, hidden] of Object.entries(lookup))
        expect(Boolean(visible[path])).toBe(!hidden);
    }
  });

  it('handles hidden roots, ancestor inheritance and clearing rules without mutating input', () => {
    const saved = JSON.stringify(root);
    expect(
      Object.values(
        createFileTreeHiddenLookup(root, {
          root: 'hidden',
          'root/folder': 'children-hidden',
        })
      )
    ).toEqual([true, true, true, true]);
    expect(Object.values(createFileTreeHiddenLookup(root, {}))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(JSON.stringify(root)).toBe(saved);
  });

  it('ignores inherited rules and supports prototype-like node names', () => {
    const node: FileNode = {
      name: '__proto__',
      path: '__proto__',
      kind: 'file',
    };
    expect(createFileTreeHiddenLookup(node, {})['__proto__']).toBe(false);
    expect(
      createFileTreeHiddenLookup(
        node,
        Object.create(Object.fromEntries([['__proto__', 'hidden']]))
      )['__proto__']
    ).toBe(false);
    const rules = Object.fromEntries([['__proto__', 'hidden' as const]]);
    expect(createFileTreeHiddenLookup(node, rules)['__proto__']).toBe(true);
  });

  it('reads each visibility rule only once on a large tree', () => {
    const tree: FileNode = {
      ...root,
      children: Array.from({ length: 10000 }, (_, i) => ({
        name: String(i),
        path: `root/${i}`,
        kind: 'file',
      })),
    };
    let reads = 0;
    const visibility = new Proxy(
      { root: 'children-hidden' as const },
      {
        getOwnPropertyDescriptor(target, key) {
          reads++;
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      }
    );
    const lookup = createFileTreeHiddenLookup(tree, visibility);
    expect(Object.keys(lookup)).toHaveLength(10001);
    expect(reads).toBe(10001);
    expect(lookup['root/9999']).toBe(true);
  });
});
