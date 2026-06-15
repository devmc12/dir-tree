import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
import {
  createFileTreeNode,
  createVisibleFileTree,
  renameFileTreeNode,
} from '@devmc12/dir-tree/tree';
import type { FileNode } from '@devmc12/dir-tree';

/**
 * Date: 2026-06-14
 * Desc: Demonstrates pure tree editing and visibility filtering
 */

/**
 * Creates a node, renames it, hides another node, and prints each result
 * @param tree File tree to edit
 * @returns void
 */
export function demoEditTree(tree: FileNode): void {
  const created = createFileTreeNode(tree, 'project/src', {
    kind: 'file',
    name: 'config.ts',
  });

  if (!created) {
    console.log('create failed');
    return;
  }

  const renamed = renameFileTreeNode(
    created.tree,
    created.path,
    'app.config.ts'
  );

  if (!renamed) {
    console.log('rename failed');
    return;
  }

  console.log('After create + rename:');
  console.log(renderAsciiTree(renamed.tree));

  const visibleTree = createVisibleFileTree(renamed.tree, {
    'project/README.md': 'hidden',
  });

  console.log('\nWith README.md hidden:');
  console.log(visibleTree ? renderAsciiTree(visibleTree) : '(empty)');
}
