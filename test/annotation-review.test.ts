import { describe, expect, it } from 'vitest';
import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createManualAnnotationDiffResult,
  filterAnnotationDiffByExcludedPaths,
} from '../src/annotations';

/**
 * Date: 2026-11-14
 * Desc: Verifies manual deletion and batched review filtering without changing AI semantics
 */

describe('annotation review helpers', () => {
  it('deletes empty manual edits while retaining provider skips', () => {
    const base = applyTreeAnnotationPatches({}, [
      { path: 'root/a', comment: 'old', updatedAt: 1 },
    ]);
    const patches = [{ path: 'root/a', comment: '  ' }];
    const manual = createManualAnnotationDiffResult(base, patches);
    expect(manual.updated).toEqual([
      { path: 'root/a', previousComment: 'old', nextComment: '' },
    ]);
    expect(manual.nextAnnotations['root/a']).toBeUndefined();
    expect(base['root/a']?.comment).toBe('old');
    const ai = createAnnotationDiffResult(base, patches, new Set(['root/a']));
    expect(ai.applyPatches).toEqual([]);
    expect(ai.skipped[0]?.reason).toBe('empty-comment');
    expect(ai.nextAnnotations).toBe(base);
  });

  it('deduplicates edits, normalizes once, and retains unchanged and special-key behavior', () => {
    const base = applyTreeAnnotationPatches({}, [
      { path: 'same', comment: 'unchanged', updatedAt: 1 },
    ]);
    const diff = createManualAnnotationDiffResult(base, [
      { path: 'same', comment: ' unchanged ' },
      { path: 'blank', comment: '  ' },
      { path: '__proto__', comment: 'first' },
      { path: '__proto__', comment: ' last ', updatedAt: 2 },
    ]);
    expect(diff.skipped).toEqual([]);
    expect(diff.applyPatches).toEqual([
      { path: '__proto__', comment: 'last', updatedAt: 2 },
    ]);
    expect(diff.nextAnnotations['__proto__']?.comment).toBe('last');
    expect(Object.prototype.hasOwnProperty.call(base, '__proto__')).toBe(false);
  });

  it('filters manual and provider diffs without dropping read-only diagnostics', () => {
    const base = applyTreeAnnotationPatches({}, [
      { path: 'delete', comment: 'kept when unchecked' },
      { path: 'same', comment: 'same' },
    ]);
    const manual = createManualAnnotationDiffResult(base, [
      { path: 'delete', comment: '' },
      { path: 'new', comment: 'new' },
    ]);
    expect(filterAnnotationDiffByExcludedPaths(manual, new Set())).toBe(manual);
    const selected = filterAnnotationDiffByExcludedPaths(
      manual,
      new Set(['delete'])
    );
    expect(selected.nextAnnotations['delete']).toBe(base['delete']);
    expect(selected.added.map(entry => entry.path)).toEqual(['new']);
    const ai = createAnnotationDiffResult(
      base,
      [
        { path: 'same', comment: 'same' },
        { path: 'outside', comment: 'no' },
        { path: 'new', comment: 'new' },
      ],
      new Set(['same', 'new'])
    );
    const filtered = filterAnnotationDiffByExcludedPaths(
      ai,
      new Set(['new', 'same'])
    );
    expect(filtered.skipped).toBe(ai.skipped);
    expect(filtered.nextAnnotations).toBe(base);
    expect(ai.applyPatches).toHaveLength(1);
  });

  it('copies a large base map once for one batch of exclusions', () => {
    const patches = Array.from({ length: 10000 }, (_, i) => ({
      path: String(i),
      comment: 'old',
      updatedAt: 1,
    }));
    let copies = 0;
    const base = new Proxy(applyTreeAnnotationPatches({}, patches), {
      ownKeys(target) {
        copies++;
        return Reflect.ownKeys(target);
      },
    });
    const diff = createManualAnnotationDiffResult(
      base,
      patches.map(patch => ({ ...patch, comment: 'new' }))
    );
    copies = 0;
    const result = filterAnnotationDiffByExcludedPaths(
      diff,
      new Set(patches.slice(0, 9000).map(patch => patch.path))
    );
    expect(copies).toBe(1);
    expect(result.applyPatches).toHaveLength(1000);
    expect(result.nextAnnotations['0']?.comment).toBe('old');
    expect(result.nextAnnotations['9999']?.comment).toBe('new');
  });
});
