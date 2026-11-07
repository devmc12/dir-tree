import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryFileTreeAdapter } from '@devmc12/dir-tree';
import { createPlaygroundReadOptions } from '../../playground/src/reader/utils';
import type { PlaygroundReadOptionsState } from '../../playground/src/reader/types';

/**
 * Date: 2026-11-07
 * Desc: Checks that playground settings preserve the per-read library contract
 */

const settings: PlaygroundReadOptionsState = {
  depth: '',
  excludePatterns: '',
  foldersFirst: true,
  readFileMeta: false,
  showHidden: false,
  sortBy: 'name',
  sortOrder: 'asc',
  useGitignore: true,
};

test('clearing playground exclude text overrides constructor exclusions', async () => {
  const adapter = new InMemoryFileTreeAdapter(
    {
      name: 'project',
      path: 'project',
      kind: 'directory',
      children: [{ name: 'notes.md', path: 'project/notes.md', kind: 'file' }],
    },
    { exclude: ['notes.md'] }
  );
  assert.equal((await adapter.read()).children?.length, 0);
  const restored = await adapter.read(createPlaygroundReadOptions(settings));
  assert.equal(restored.children?.[0]?.name, 'notes.md');
});

test('reusing a source restores hidden and deep entries after settings are cleared', async () => {
  const adapter = new InMemoryFileTreeAdapter({
    name: 'project',
    path: 'project',
    kind: 'directory',
    children: [
      { name: '.env', path: 'project/.env', kind: 'file' },
      {
        name: 'src',
        path: 'project/src',
        kind: 'directory',
        children: [
          { name: 'index.ts', path: 'project/src/index.ts', kind: 'file' },
        ],
      },
    ],
  });
  const shallow = await adapter.read(
    createPlaygroundReadOptions({ ...settings, depth: '1' })
  );
  assert.equal(shallow.children?.length, 1);
  assert.deepEqual(shallow.children?.[0]?.children, []);

  const full = await adapter.read(
    createPlaygroundReadOptions({ ...settings, showHidden: true })
  );
  assert.equal(
    full.children?.some(node => node.name === '.env'),
    true
  );
  assert.equal(
    full.children?.find(node => node.name === 'src')?.children?.length,
    1
  );
  assert.equal(
    (await adapter.read(createPlaygroundReadOptions(settings))).children
      ?.length,
    1
  );
});
