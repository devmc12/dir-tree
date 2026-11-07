import { describe, expect, it } from 'vitest';
import {
  attachFileTreeMetadata,
  createExportedFileTreeJson,
  parseImportedFileTreeJson,
  parseImportedTreeText,
  type FileNode,
} from '../src';
import {
  createVisibleFileTree,
  filterFileTreeVisibilityByPaths,
  getFileTreeItems,
  remapFileTreeVisibility,
} from '../src/tree';
import {
  createAnnotationDiffResult,
  filterTreeAnnotationsByPaths,
  getTreeAnnotationText,
  mergeParsedTreeAnnotationPatches,
  remapTreeAnnotations,
  resolveTreeAnnotationsAfterRead,
  type TreeAnnotationMap,
} from '../src/annotations';
import {
  createTreeSelectionModel,
  toggleTreeSelection,
} from '../src/selection';

/**
 * Date: 2026-11-07
 * Desc: Verifies arbitrary path names across indexes, annotations, and transfer
 */

describe('path dictionary ownership', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'retains the root %s through indexing, remapping, and JSON round trips',
    name => {
      const input = JSON.stringify({
        name,
        kind: 'directory',
        comment: 'note',
        visibility: 'hidden',
        children: [],
      });
      const parsed = parseImportedFileTreeJson(input);
      expect(Object.keys(parsed.annotations)).toEqual([name]);
      expect(Object.keys(parsed.hiddenItems)).toEqual([name]);
      expect(Object.keys(getFileTreeItems(parsed.tree))).toEqual([name]);
      const metadata = attachFileTreeMetadata(parsed.tree);
      expect(getFileTreeItems(parsed.tree)).toBe(metadata.itemsByPath);
      expect(Object.keys(metadata.itemsByPath)).toEqual([name]);
      expect(metadata.itemsByPath[name]?.data).toBe(parsed.tree);
      expect(createVisibleFileTree(parsed.tree, parsed.hiddenItems)).toBeNull();

      const annotations = resolveTreeAnnotationsAfterRead(
        parsed.tree,
        parsed.annotations,
        'matching-paths'
      );
      const filtered = filterTreeAnnotationsByPaths(annotations, [name]);
      expect(getTreeAnnotationText(filtered, name)).toBe('note');
      const merged = mergeParsedTreeAnnotationPatches(
        filtered,
        [{ path: name, comment: 'updated' }],
        [name]
      );
      const moved = remapTreeAnnotations(merged, name, '__proto__');
      expect(Object.keys(moved)).toEqual(['__proto__']);
      expect(moved['__proto__']?.comment).toBe('updated');
      const visibility = filterFileTreeVisibilityByPaths(parsed.hiddenItems, [
        name,
      ]);
      expect(
        Object.keys(remapFileTreeVisibility(visibility, name, '__proto__'))
      ).toEqual(['__proto__']);

      const exported = createExportedFileTreeJson(parsed.tree, filtered, {
        visibility,
      });
      const restored = parseImportedFileTreeJson(exported);
      expect(restored.tree).toEqual(parsed.tree);
      expect(restored.hiddenItems[name]).toBe('hidden');
      expect(getTreeAnnotationText(restored.annotations, name)).toBe('note');
      expect(
        Object.keys(parseImportedTreeText(input, 'fallback').annotations)
      ).toEqual([name]);
    }
  );

  it('ignores inherited annotations and visibility supplied by a caller', () => {
    const root: FileNode = {
      name: '__proto__',
      path: '__proto__',
      kind: 'directory',
      children: [],
    };
    expect(JSON.parse(createExportedFileTreeJson(root))).not.toHaveProperty(
      'visibility'
    );
    expect(
      createAnnotationDiffResult(
        {},
        [{ path: root.path, comment: 'new' }],
        new Set([root.path])
      ).added
    ).toHaveLength(1);
    const inherited = Object.create({
      __proto__: null,
      [root.path]: { path: root.path, comment: 'inherited' },
    }) as TreeAnnotationMap;
    expect(getTreeAnnotationText(inherited, root.path)).toBe('');
    expect(
      JSON.parse(createExportedFileTreeJson(root, inherited))
    ).not.toHaveProperty('comment');
  });

  it('stores special selection ids as own keys and ignores absent inherited ids', () => {
    const data = {
      rootId: 'root',
      items: {
        root: { id: 'root', children: ['__proto__'] },
        ['__proto__']: { id: '__proto__' },
      },
    };
    const model = createTreeSelectionModel(data, ['__proto__']);
    expect(Object.keys(model.selectionStateById)).toEqual(['__proto__']);
    expect(model.selectionStateById['__proto__']).toBe('checked');
    expect(toggleTreeSelection(data, [], 'constructor')).toEqual([]);
  });
});
