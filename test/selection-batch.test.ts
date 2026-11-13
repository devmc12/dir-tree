import { describe, expect, it } from 'vitest';
import {
  createTreeSelectionModel,
  getTreeItemIdsWithDescendants,
  setTreeSelection,
  toggleTreeSelection,
  type TreeSelectionData,
} from '../src/selection';

/**
 * Date: 2026-11-14
 * Desc: Verifies batched selection and selectable-root compatibility without UI state
 */

function fixture(rootSelectable = false): TreeSelectionData {
  return {
    rootId: 'root',
    rootSelectable,
    items: {
      root: { id: 'root', children: ['folder', 'empty'] },
      folder: { id: 'folder', children: ['a', 'b'] },
      a: { id: 'a' },
      b: { id: 'b' },
      empty: { id: 'empty' },
    },
  };
}

describe('batch selection', () => {
  it('keeps virtual roots excluded and real roots selectable', () => {
    expect(setTreeSelection(fixture(), [], ['root'], true)).toEqual([]);
    const data = fixture(true);
    expect(setTreeSelection(data, [], ['root'], true)).toEqual([
      'root',
      'folder',
      'a',
      'b',
      'empty',
    ]);
    expect(toggleTreeSelection(data, ['root'], 'a')).toEqual(['b', 'empty']);
    expect(
      createTreeSelectionModel(data, ['b']).selectionStateById
    ).toMatchObject({
      root: 'indeterminate',
      folder: 'indeterminate',
      b: 'checked',
      empty: 'unchecked',
    });
  });

  it('deduplicates mixed parent and child ranges and keeps unchecked descendants unchecked', () => {
    const data = fixture();
    const all = setTreeSelection(
      data,
      [],
      ['folder', 'a', 'empty', 'folder'],
      true
    );
    expect(all).toEqual(['folder', 'a', 'b', 'empty']);
    expect(setTreeSelection(data, all, ['a'], false)).toEqual(['b', 'empty']);
    expect(setTreeSelection(data, all, ['folder', 'a'], false)).toEqual([
      'empty',
    ]);
    expect(setTreeSelection(data, [], ['empty'], true)).toEqual(['empty']);
    expect(setTreeSelection(data, all, ['missing'], false)).toBe(all);
  });

  it('retains safe special ids and selectable-id filtering', () => {
    const data: TreeSelectionData = {
      rootId: 'root',
      items: JSON.parse(
        '{"root":{"id":"root","children":["__proto__","constructor"]},"__proto__":{"id":"__proto__"},"constructor":{"id":"constructor"}}'
      ),
      selectableIds: new Set(['__proto__']),
    };
    expect(
      setTreeSelection(data, [], ['constructor', '__proto__'], true)
    ).toEqual(['__proto__']);
  });

  it('visits overlapping subtrees once rather than once per selected ancestor', () => {
    const data = fixture();
    const children = Array.from({ length: 10000 }, (_, i) => String(i));
    let reads = 0;
    data.items.folder = {
      id: 'folder',
      get children() {
        reads++;
        return children;
      },
    };
    for (const id of children) data.items[id] = { id };
    expect(
      getTreeItemIdsWithDescendants(data, ['folder', ...children, 'folder'])
    ).toHaveLength(10001);
    expect(reads).toBe(1);
    expect(
      setTreeSelection(data, [], ['folder', ...children], true)
    ).toHaveLength(10001);
    expect(
      setTreeSelection(data, ['folder'], children.slice(0, 5000), false)
    ).toHaveLength(5000);
  });
});
