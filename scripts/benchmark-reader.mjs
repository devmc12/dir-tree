import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { strToU8, zipSync } from 'fflate';
import {
  ZipFileSystemAdapter,
  applyTreeAnnotationPatches,
  getFileTreeMetadata,
  renameFileTreeNode,
} from '../dist/index.js';

/**
 * Date: 2026-11-07
 * Desc: Measures fixed ZIP, annotation, and tree editing workloads locally
 */

const fileCount = 800;
const fileSize = 32 * 1024;
const annotationCount = 2_000;
const patchCount = 500;
const rounds = 5;
const fileData = new Uint8Array(fileSize).fill(65);
const entries = Object.fromEntries(
  Array.from({ length: fileCount }, (_, index) => [
    `dir-${index % 20}/file-${index}.bin`,
    fileData,
  ])
);
const archive = zipSync(
  {
    ...entries,
    '.gitignore': strToU8('ignored.bin\n'),
    'ignored.bin': fileData,
  },
  { level: 1 }
);
const source = new Blob([archive]);
const annotations = Object.fromEntries(
  Array.from({ length: annotationCount }, (_, index) => {
    const path = `project/file-${index}`;
    return [
      path,
      {
        path,
        comment: 'before',
        source: 'manual',
        syncStatus: 'local',
        updatedAt: 1,
      },
    ];
  })
);
const patches = Array.from({ length: patchCount }, (_, index) => ({
  path: `project/file-${index}`,
  comment: 'after',
  updatedAt: 2,
}));

/**
 * Samples process memory and elapsed time around one isolated operation
 */
async function measure(operation, verify) {
  globalThis.gc?.();
  const before = process.memoryUsage();
  const start = performance.now();
  const result = await operation();
  const elapsed = performance.now() - start;
  const after = process.memoryUsage();
  verify(result);

  return {
    result,
    elapsed,
    arrayBufferMiB: (after.arrayBuffers - before.arrayBuffers) / 2 ** 20,
    rssMiB: (after.rss - before.rss) / 2 ** 20,
  };
}

/**
 * Returns the middle measurement across the fixed odd number of rounds
 */
function median(samples, key) {
  const values = samples
    .map(sample => sample[key])
    .sort((left, right) => left - right);
  return Number(values[Math.floor(values.length / 2)].toFixed(2));
}

/**
 * Confirms the archive's metadata and filtering match the fixture
 */
function verifyTree(tree) {
  const stats = getFileTreeMetadata(tree).stats;
  assert.equal(stats.totalFiles, fileCount);
  assert.equal(stats.totalSize, fileCount * fileSize);
}

const samples = {
  firstZipRead: [],
  repeatedZipRead: [],
  batchPatches: [],
  renameTreeNode: [],
};

for (let round = 0; round < rounds; round += 1) {
  const reader = new ZipFileSystemAdapter(source, { readFileMeta: true });
  const first = await measure(() => reader.read(), verifyTree);
  samples.firstZipRead.push(first);
  samples.repeatedZipRead.push(
    await measure(
      () =>
        reader.read({
          sort: { sortBy: 'name', order: 'desc', foldersFirst: true },
        }),
      verifyTree
    )
  );
  samples.batchPatches.push(
    await measure(
      () => applyTreeAnnotationPatches(annotations, patches),
      result => {
        assert.equal(result['project/file-0'].updatedAt, 2);
        assert.equal(Object.keys(result).length, annotationCount);
      }
    )
  );
  samples.renameTreeNode.push(
    await measure(
      () =>
        renameFileTreeNode(
          first.result,
          'archive.zip/dir-0/file-0.bin',
          'renamed.bin'
        ),
      result => {
        assert.equal(result.toPath, 'archive.zip/dir-0/renamed.bin');
      }
    )
  );
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      fixture: {
        rounds,
        fileCount,
        fileSize,
        archiveBytes: archive.length,
        annotationCount,
        patchCount,
      },
      medians: Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          {
            milliseconds: median(values, 'elapsed'),
            arrayBufferDeltaMiB: median(values, 'arrayBufferMiB'),
            rssDeltaMiB: median(values, 'rssMiB'),
          },
        ])
      ),
    },
    null,
    2
  )
);
