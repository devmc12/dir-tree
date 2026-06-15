import { fileURLToPath } from 'node:url';
import { demoAnnotate } from './demos/annotate';
import { demoEditTree } from './demos/editTree';
import { demoParseImport } from './demos/parseImport';
import { demoReadDirectory } from './demos/readDirectory';
import { demoTransferJson } from './demos/transferJson';
import { sampleTree } from './fixtures';

/**
 * Date: 2026-06-14
 * Desc: Runs the headless dir-tree feature demos in a Node.js environment
 */

// Absolute path to the package src directory used by the read-directory demo
const PACKAGE_SRC_PATH = fileURLToPath(new URL('../../src', import.meta.url));

/**
 * Prints a labeled section header before each demo
 * @param title Section title
 * @returns void
 */
function printSection(title: string): void {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

/**
 * Runs every Node playground demo in sequence
 * @returns Promise that resolves when all demos finish
 */
async function main(): Promise<void> {
  printSection('1. Read a real directory path (NodeFileSystemAdapter)');
  await demoReadDirectory(PACKAGE_SRC_PATH);

  printSection('2. Parse imported ASCII tree text (parser)');
  demoParseImport();

  printSection('3. Annotate via a mock provider (annotations)');
  await demoAnnotate(sampleTree);

  printSection('4. Edit a tree and filter visibility (tree)');
  demoEditTree(sampleTree);

  printSection('5. Export and import JSON (transfer)');
  demoTransferJson(sampleTree);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
