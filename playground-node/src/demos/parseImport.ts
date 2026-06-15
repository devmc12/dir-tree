import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
import { parseImportedTreeText } from '@devmc12/dir-tree/parser';

/**
 * Date: 2026-06-14
 * Desc: Demonstrates parsing imported ASCII tree text back into a FileNode tree
 */

// Sample ASCII tree text a user might paste or import
const ASCII_TREE_INPUT = `project
├── src
│   ├── index.ts
│   └── utils.ts
└── README.md`;

/**
 * Parses ASCII tree text and re-renders it with an ASCII connector style
 * @returns void
 */
export function demoParseImport(): void {
  const parsed = parseImportedTreeText(ASCII_TREE_INPUT, 'project');

  console.log(renderAsciiTree(parsed.tree, { connectorStyle: 'ascii' }));
}
