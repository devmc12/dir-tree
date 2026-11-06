import {
  DroppedDirectoryEntryAdapter,
  LegacyDirectoryFilesAdapter,
  LocalFileSystemAdapter,
  isDirectoryPickerSupported,
  type DroppedFileTreeSource,
  type DroppedFileSystemDirectoryEntry,
} from '@devmc12/dir-tree/browser';
import { FileSystemReader, type FileNode } from '@devmc12/dir-tree';

/**
 * Date: 2026-11-07
 * Desc: Exercises the installed package declarations
 */

declare const source: DroppedFileTreeSource;
declare const entry: DroppedFileSystemDirectoryEntry;
declare const files: FileList;
const reader = new FileSystemReader(
  source.kind === 'directory' && source.handle
    ? new LocalFileSystemAdapter({}, source.handle)
    : new DroppedDirectoryEntryAdapter(entry)
);
const tree: FileNode = await reader.read();
new LegacyDirectoryFilesAdapter(files);
void tree;
isDirectoryPickerSupported();
