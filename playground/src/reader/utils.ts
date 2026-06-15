import type { FileNode, ReadOptions } from '@devmc12/dir-tree';
import { createReadOptionsFromConfig } from '@devmc12/dir-tree';
import { formatAsciiTreeMarkdownBlock } from '@devmc12/dir-tree/annotations';

import type { PlaygroundReadOptionsState, ReaderTreeRow } from './types';

export function flattenVisibleFileTree(
  node: FileNode,
  expandedPaths: string[],
  depth = 0
): ReaderTreeRow[] {
  const rows: ReaderTreeRow[] = [{ node, depth }];

  if (node.kind !== 'directory' || !expandedPaths.includes(node.path)) {
    return rows;
  }

  return rows.concat(
    (node.children ?? []).flatMap(child =>
      flattenVisibleFileTree(child, expandedPaths, depth + 1)
    )
  );
}

export function createPlaygroundReadOptions(
  state: PlaygroundReadOptionsState
): ReadOptions {
  const depth = state.depth.trim() ? Number(state.depth) : undefined;

  return createReadOptionsFromConfig({
    depth: depth && Number.isFinite(depth) && depth > 0 ? depth : undefined,
    excludePatterns: state.excludePatterns,
    foldersFirst: state.foldersFirst,
    readFileMeta: state.readFileMeta,
    showHidden: state.showHidden,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    useGitignore: state.useGitignore,
  });
}

export function areReadOptionsEqual(
  left: PlaygroundReadOptionsState,
  right: PlaygroundReadOptionsState
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return String(bytes);
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');

  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.top = '-100000px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export function downloadPlainText(
  filename: string,
  value: string,
  type = 'text/plain'
): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function createMarkdownDownloadText(asciiText: string): string {
  return formatAsciiTreeMarkdownBlock(asciiText);
}
