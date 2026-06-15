/**
 * Date: 2026-06-07
 * Desc: Exposes reader types and utilities
 */

export {
  FileSystemReader,
  FileSystemReader as Reader,
} from './FileSystemReader';
export { createReadOptionsFromConfig } from './options';
export type { ReadOptionsConfig } from './options';
export * from './types';
export {
  attachFileTreeMetadata,
  buildFileTreeMetadata,
  createFileTreeFromSnapshot,
  formatSize,
  getFileTreeMetadata,
  globToRegex,
  isPathExcluded,
  parseGitignore,
  sortChildren,
} from './utils';
