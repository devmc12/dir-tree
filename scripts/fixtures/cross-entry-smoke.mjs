import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as root from '@devmc12/dir-tree';
import * as node from '@devmc12/dir-tree/node';
import * as tree from '@devmc12/dir-tree/tree';

/**
 * Date: 2026-11-07
 * Desc: Verifies installed entries can share the metadata of the same tree
 */

const require = createRequire(import.meta.url);
const roots = [root, require('@devmc12/dir-tree')];
const nodeEntries = [node, require('@devmc12/dir-tree/node')];
const treeEntries = [tree, require('@devmc12/dir-tree/tree')];

await mkdir('metadata-fixture');
await writeFile('metadata-fixture/notes.txt', 'abc');

for (const nodeEntry of nodeEntries) {
  const fileTree = await new nodeEntry.NodeFileSystemAdapter(
    'metadata-fixture',
    {
      readFileMeta: true,
    }
  ).read();

  for (const rootEntry of roots) {
    const metadata = rootEntry.getFileTreeMetadata(fileTree);
    assert.equal(metadata?.stats.totalFiles, 1);
    assert.equal(metadata?.stats.totalSize, 3);
    assert.equal(
      metadata?.itemsByPath['metadata-fixture/notes.txt']?.data,
      fileTree.children[0]
    );

    for (const treeEntry of treeEntries) {
      assert.equal(treeEntry.getFileTreeItems(fileTree), metadata.itemsByPath);
      const cloned = treeEntry.createPreparedFileTree(fileTree);
      assert.equal(rootEntry.getFileTreeMetadata(cloned)?.stats.totalSize, 3);
    }
  }

  const [key] = Object.getOwnPropertySymbols(fileTree);
  assert.ok(key);
  assert.equal(
    Object.getOwnPropertyDescriptor(fileTree, key).enumerable,
    false
  );
  assert.deepEqual(JSON.parse(JSON.stringify(fileTree)), {
    name: 'metadata-fixture',
    path: 'metadata-fixture',
    kind: 'directory',
    children: [
      {
        name: 'notes.txt',
        path: 'metadata-fixture/notes.txt',
        kind: 'file',
        size: 3,
        lastModified: fileTree.children[0].lastModified,
      },
    ],
  });
}
