import {
  applyTreeAnnotationPatches,
  createAnnotationDiffResult,
  createAnnotationProviderRequest,
  createTreeAnnotationPatchesFromProviderResult,
  renderAnnotatedAsciiTree,
  type AnnotationProvider,
  type TreeAnnotationMap,
} from '@devmc12/dir-tree/annotations';
import { renderAsciiTreeLines } from '@devmc12/dir-tree/ascii';
import type { FileNode } from '@devmc12/dir-tree';

/**
 * Date: 2026-06-14
 * Desc: Demonstrates the annotation provider, diff, and annotated ASCII flow
 */

// Mock provider that fills a comment for every requested node
const mockAnnotationProvider: AnnotationProvider = {
  async annotate(payload) {
    return {
      annotations: payload.nodes.map(node => ({
        path: node.path,
        comment:
          node.kind === 'directory'
            ? 'Directory of related modules'
            : `Source file ${node.path.split('/').at(-1)}`,
      })),
    };
  },
};

/**
 * Requests annotations from a mock provider, reviews the diff, applies it, and
 * renders the annotated ASCII tree
 * @param tree File tree to annotate
 * @returns Promise that resolves when the demo output is printed
 */
export async function demoAnnotate(tree: FileNode): Promise<void> {
  let annotations: TreeAnnotationMap = {};
  const request = createAnnotationProviderRequest({
    tree,
    annotations,
    target: 'all',
  });
  const result = await mockAnnotationProvider.annotate(request.payload);
  const patches = createTreeAnnotationPatchesFromProviderResult(
    result,
    request.sourcePaths
  );
  const diff = createAnnotationDiffResult(
    annotations,
    patches,
    request.allowedPaths
  );

  console.log(`added: ${diff.added.length}, updated: ${diff.updated.length}`);

  annotations = applyTreeAnnotationPatches(annotations, diff.applyPatches);

  const lines = renderAsciiTreeLines(tree);

  console.log(
    renderAnnotatedAsciiTree(lines, annotations, {
      alignmentMode: 'smart-column',
    })
  );
}
