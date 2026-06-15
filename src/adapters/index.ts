/**
 * Date: 2026-06-07
 * Desc: Exposes file system adapters and remote repository helpers
 */

export { BaseFileSystemAdapter } from './BaseFileSystemAdapter';
export {
  DroppedDirectoryEntryAdapter,
  type DroppedFileSystemDirectoryEntry,
  type DroppedFileSystemDirectoryReader,
  type DroppedFileSystemEntry,
  type DroppedFileSystemEntryBase,
  type DroppedFileSystemFileEntry,
} from './DroppedDirectoryEntryAdapter';
export type { IFileSystemAdapter, ReaderAdapter } from './IFileSystemAdapter';
export { InMemoryFileTreeAdapter } from './InMemoryFileTreeAdapter';
export { LegacyDirectoryFilesAdapter } from './LegacyDirectoryFilesAdapter';
export { LocalFileSystemAdapter } from './LocalFileSystemAdapter';
export { RemoteRepositoryFileSystemAdapter } from './RemoteRepositoryFileSystemAdapter';
export { ZipFileSystemAdapter, type ZipSource } from './ZipFileSystemAdapter';
export * from './remoteRepository';
