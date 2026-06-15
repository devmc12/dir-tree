import { FileSystemReader } from '@devmc12/dir-tree';
import { renderAsciiTree } from '@devmc12/dir-tree/ascii';
import { NodeFileSystemAdapter } from '@devmc12/dir-tree/node';

/**
 * Date: 2026-06-14
 * Desc: Demonstrates reading a real filesystem directory path in Node.js
 */

/**
 * Reads a directory path from disk and prints it as an annotated ASCII tree
 * @param targetPath Absolute or relative directory path to read
 * @returns Promise that resolves when the demo output is printed
 */
export async function demoReadDirectory(targetPath: string): Promise<void> {
  const reader = new FileSystemReader(
    new NodeFileSystemAdapter(targetPath, {
      exclude: ['node_modules', 'dist', '.git'],
      useGitignore: true,
    })
  );
  const tree = await reader.read({ depth: 2, readFileMeta: true });

  console.log(
    renderAsciiTree(tree, {
      appendDirectorySlash: true,
      showFileSize: true,
    })
  );
}
