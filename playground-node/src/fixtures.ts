import type { FileNode } from '@devmc12/dir-tree';

/**
 * Date: 2026-06-14
 * Desc: Provides a shared in-memory sample tree for the Node playground demos
 */

export const sampleTree: FileNode = {
  name: 'project',
  path: 'project',
  kind: 'directory',
  children: [
    {
      name: 'src',
      path: 'project/src',
      kind: 'directory',
      children: [
        {
          name: 'index.ts',
          path: 'project/src/index.ts',
          kind: 'file',
          size: 1024,
        },
        {
          name: 'utils.ts',
          path: 'project/src/utils.ts',
          kind: 'file',
          size: 512,
        },
      ],
    },
    { name: 'README.md', path: 'project/README.md', kind: 'file', size: 2048 },
    {
      name: 'package.json',
      path: 'project/package.json',
      kind: 'file',
      size: 256,
    },
  ],
};
