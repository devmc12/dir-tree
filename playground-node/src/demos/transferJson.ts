import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
import {
  createExportedFileTreeJson,
  parseImportedFileTreeJson,
} from '@devmc12/dir-tree/transfer';
import type { FileNode } from '@devmc12/dir-tree';
import type { TreeAnnotationMap } from '@devmc12/dir-tree/annotations';

/**
 * Date: 2026-06-14
 * Desc: Demonstrates a JSON export and import round trip with annotations
 */

/**
 * Exports a tree with annotations to JSON, parses it back, and renders it
 * @param tree File tree to export
 * @returns void
 */
export function demoTransferJson(tree: FileNode): void {
  const annotations: TreeAnnotationMap = {
    'project/README.md': {
      path: 'project/README.md',
      comment: 'Project overview',
      source: 'manual',
      syncStatus: 'local',
      updatedAt: Date.now(),
    },
  };
  const json = createExportedFileTreeJson(tree, annotations);

  console.log('Exported JSON (first 200 chars):');
  console.log(`${json.slice(0, 200)}...`);

  const restored = parseImportedFileTreeJson(json);

  console.log('\nRestored tree:');
  console.log(renderAsciiTree(restored.tree));
  console.log(
    `Restored annotations: ${Object.keys(restored.annotations).length}`
  );
}
