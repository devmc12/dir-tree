import { createPreparedFileTree, type FileNode } from '@devmc12/dir-tree';
import { createAnnotatedAsciiTreeRenderOptionsFromConfig } from '@devmc12/dir-tree/annotations';
import type { TreeAnnotationMap } from '@devmc12/dir-tree/annotations';

/**
 * Date: 2026-06-08
 * Desc: Provides sample data and default options for the playground
 */

export const annotationRenderOptions =
  createAnnotatedAsciiTreeRenderOptionsFromConfig({
    commentPrefix: '#',
    commentPrefixHasSpace: true,
  });

export function createSampleTree(): FileNode {
  return createPreparedFileTree({
    name: 'dir-tree',
    path: 'dir-tree',
    kind: 'directory',
    children: [
      {
        name: 'src',
        path: 'dir-tree/src',
        kind: 'directory',
        children: [
          {
            name: 'index.ts',
            path: 'dir-tree/src/index.ts',
            kind: 'file',
            size: 2800,
            lastModified: Date.UTC(2026, 5, 7, 12, 10),
          },
          {
            name: 'parser',
            path: 'dir-tree/src/parser',
            kind: 'directory',
            children: [
              {
                name: 'index.ts',
                path: 'dir-tree/src/parser/index.ts',
                kind: 'file',
                size: 22480,
                lastModified: Date.UTC(2026, 5, 7, 13, 25),
              },
            ],
          },
        ],
      },
      {
        name: 'playground',
        path: 'dir-tree/playground',
        kind: 'directory',
        children: [
          {
            name: 'src',
            path: 'dir-tree/playground/src',
            kind: 'directory',
            children: [
              {
                name: 'App.tsx',
                path: 'dir-tree/playground/src/App.tsx',
                kind: 'file',
                size: 12600,
                lastModified: Date.UTC(2026, 5, 7, 14, 12),
              },
            ],
          },
        ],
      },
      {
        name: 'README.md',
        path: 'dir-tree/README.md',
        kind: 'file',
        size: 1353,
        lastModified: Date.UTC(2026, 5, 7, 10, 45),
      },
    ],
  });
}

export function createSampleAnnotations(): TreeAnnotationMap {
  const updatedAt = Date.now();

  return {
    'dir-tree/src': {
      path: 'dir-tree/src',
      comment: 'Headless package source',
      source: 'manual',
      syncStatus: 'local',
      updatedAt,
    },
    'dir-tree/playground': {
      path: 'dir-tree/playground',
      comment: 'Vite React reference implementation',
      source: 'manual',
      syncStatus: 'local',
      updatedAt,
    },
  };
}
