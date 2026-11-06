import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { strToU8, zipSync } from 'fflate';
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

const unicodeName = '笔记-😀.txt';
const unicodePath = 'metadata-fixture/子目录/' + unicodeName;
await mkdir('metadata-fixture/子目录', { recursive: true });
await writeFile(unicodePath, 'abc');
await writeFile('metadata-fixture/ignored.tmp', 'ignored');
await writeFile('metadata-fixture/.gitignore', '*.tmp\n');

for (const nodeEntry of nodeEntries) {
  const adapter = new nodeEntry.NodeFileSystemAdapter('metadata-fixture', {
    readFileMeta: true,
  });
  const fileTree = await adapter.read();
  const directory = fileTree.children[0];
  const file = directory.children[0];
  const shallow = await adapter.read({ depth: 1 });

  assert.deepEqual(shallow.children[0].children, []);
  assert.deepEqual(await adapter.read(), fileTree);

  for (const rootEntry of roots) {
    const metadata = rootEntry.getFileTreeMetadata(fileTree);
    assert.equal(metadata?.stats.totalFiles, 1);
    assert.equal(metadata?.stats.totalSize, 3);
    assert.equal(metadata?.itemsByPath[unicodePath]?.data, file);

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
        name: '子目录',
        path: 'metadata-fixture/子目录',
        kind: 'directory',
        children: [
          {
            name: unicodeName,
            path: unicodePath,
            kind: 'file',
            size: 3,
            lastModified: file.lastModified,
          },
        ],
      },
    ],
  });
}

const source = new Blob([
  zipSync({
    [unicodeName]: strToU8('abc'),
    'ignored.tmp': strToU8('ignored'),
    '.gitignore': strToU8('*.tmp\n'),
  }),
]);
const zip = new root.ZipFileSystemAdapter(source, { readFileMeta: true });
assert.deepEqual((await zip.read()).children, [
  {
    name: unicodeName,
    path: 'archive.zip/' + unicodeName,
    kind: 'file',
    size: 3,
  },
]);
assert.equal((await zip.read({ useGitignore: false })).children.length, 2);
