import type { DroppedFileSystemDirectoryEntry } from '../adapters';
import type { ImportedTreeFormat } from '../parser';

/**
 * Date: 2026-06-07
 * Desc: Provides optional browser helpers for file tree source integrations
 */

interface DirectoryDropCapableDataTransferItemPrototype {
  getAsEntry?: unknown;
  getAsFileSystemHandle?: unknown;
  webkitGetAsEntry?: unknown;
}

interface FileTreeSourceDataTransferItem extends DataTransferItem {
  getAsEntry?: () => FileSystemEntry | null;
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

// Recognized ZIP extensions for dropped file sources
const ZIP_FILE_NAME_PATTERN = /\.(zip|zipx)$/iu;

// Recognized import file extensions for parser-backed dropped sources
const IMPORT_FILE_NAME_PATTERN = /\.(json|txt|xml|html|htm|md|markdown)$/iu;

// ZIP MIME types observed across common browsers and operating systems
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'multipart/x-zip',
]);

// Parser-compatible MIME types for dropped import files
const IMPORT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/html',
  'text/json',
  'text/markdown',
  'text/plain',
  'text/xml',
]);

export interface LegacyDirectoryPickerEntry {
  kind: 'directory';
  name: string;
}

export interface LegacyDirectoryPickerOptions {
  recursive?: boolean;
  skipDirectory?: (entry: LegacyDirectoryPickerEntry) => boolean;
}

export interface DroppedFileTreeDirectorySource {
  access: 'entry' | 'handle';
  entry?: DroppedFileSystemDirectoryEntry;
  handle?: FileSystemDirectoryHandle;
  kind: 'directory';
  name: string;
}

export interface DroppedFileTreeZipSource {
  file: File;
  kind: 'zip';
  name: string;
}

export interface DroppedFileTreeImportSource {
  file: File;
  format: ImportedTreeFormat;
  kind: 'import-file';
  name: string;
}

export type DroppedFileTreeSource =
  | DroppedFileTreeDirectorySource
  | DroppedFileTreeImportSource
  | DroppedFileTreeZipSource;

export type DroppedFileTreeSourceResolution =
  | {
      source: DroppedFileTreeSource;
      status: 'success';
    }
  | {
      status: 'unsupported-item';
    }
  | {
      status: 'empty';
    };

/**
 * Checks whether the native directory picker API is available
 * @returns True when showDirectoryPicker is supported
 */
export function isNativeDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}

/**
 * Checks whether the legacy webkitdirectory input is available
 * @returns True when legacy directory selection is supported
 */
export function isLegacyDirectoryPickerSupported(): boolean {
  if (typeof document === 'undefined' || typeof File === 'undefined') {
    return false;
  }

  const input = document.createElement('input') as HTMLInputElement & {
    webkitdirectory?: boolean;
  };

  return 'webkitdirectory' in input && 'webkitRelativePath' in File.prototype;
}

/**
 * Checks whether any supported directory picker is available
 * @returns True when native or legacy directory selection is supported
 */
export function isDirectoryPickerSupported(): boolean {
  return (
    isNativeDirectoryPickerSupported() || isLegacyDirectoryPickerSupported()
  );
}

/**
 * Checks whether dropped directories can be read in this environment
 * @returns True when a directory drag-and-drop access path is available
 */
export function isDirectoryDragAndDropSupported(): boolean {
  if (typeof DataTransferItem === 'undefined') {
    return false;
  }

  const prototype =
    DataTransferItem.prototype as DirectoryDropCapableDataTransferItemPrototype;

  return (
    typeof prototype.getAsFileSystemHandle === 'function' ||
    typeof prototype.webkitGetAsEntry === 'function' ||
    typeof prototype.getAsEntry === 'function'
  );
}

/**
 * Checks whether a drag event carries file or directory sources
 * @param dataTransfer Drag event data transfer, or null
 * @returns True when the drag includes file-backed items
 */
export function isFileTreeSourceDrag(
  dataTransfer: DataTransfer | null
): boolean {
  if (!dataTransfer) {
    return false;
  }

  return (
    Array.from(dataTransfer.types).includes('Files') ||
    Array.from(dataTransfer.items).some(item => item.kind === 'file') ||
    dataTransfer.files.length > 0
  );
}

/**
 * Resolves the first usable directory, ZIP, or import source from a drop
 * @param dataTransfer Drag event data transfer to inspect
 * @returns Resolution describing the source, or an empty or unsupported status
 */
export async function resolveDroppedFileTreeSource(
  dataTransfer: DataTransfer
): Promise<DroppedFileTreeSourceResolution> {
  const fileItems = Array.from(dataTransfer.items).filter(
    item => item.kind === 'file'
  ) as FileTreeSourceDataTransferItem[];

  if (fileItems.length === 0 && dataTransfer.files.length === 0) {
    return { status: 'empty' };
  }

  for (const item of fileItems) {
    const resolvedSource = await resolveDataTransferItemSource(item);

    if (resolvedSource) {
      return {
        status: 'success',
        source: resolvedSource,
      };
    }
  }

  for (const file of Array.from(dataTransfer.files)) {
    const resolvedSource = resolveDroppedFileSource(file);

    if (resolvedSource) {
      return {
        status: 'success',
        source: resolvedSource,
      };
    }
  }

  return { status: 'unsupported-item' };
}

/**
 * Builds a directory skip matcher from exclude patterns and hidden settings
 * @param excludePatterns Exclude patterns used to derive skippable directory names
 * @param showHidden Whether hidden directories should be retained
 * @returns Matcher that flags directories to skip, or undefined when nothing is skipped
 */
export function createLegacyDirectorySkipMatcher(
  excludePatterns: string[],
  showHidden: boolean
): ((entry: LegacyDirectoryPickerEntry) => boolean) | undefined {
  const skippableDirectoryNames = new Set<string>();

  excludePatterns.forEach(pattern => {
    const directoryName = extractSkippableDirectoryName(pattern);

    if (directoryName) {
      skippableDirectoryNames.add(directoryName);
    }
  });

  if (showHidden && skippableDirectoryNames.size === 0) {
    return undefined;
  }

  return (entry: LegacyDirectoryPickerEntry): boolean => {
    if (!showHidden && entry.name.startsWith('.')) {
      return true;
    }

    return skippableDirectoryNames.has(entry.name);
  };
}

/**
 * Opens the legacy directory picker and resolves the selected files
 * @param options Recursion and directory skip options
 * @returns Selected files filtered by the provided options
 */
export async function openLegacyDirectoryPicker(
  options: LegacyDirectoryPickerOptions = {}
): Promise<File[]> {
  if (typeof document === 'undefined') {
    throw new Error('Directory picking is not supported in this environment');
  }

  const input = document.createElement('input') as HTMLInputElement & {
    webkitdirectory?: boolean;
  };

  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.style.position = 'fixed';
  input.style.top = '-100000px';
  input.style.left = '-100000px';
  document.body.appendChild(input);

  return await new Promise<File[]>((resolve, reject) => {
    /**
     * Removes the temporary picker input and event handlers
     */
    const cleanup = (): void => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };

    input.oncancel = () => {
      cleanup();
      reject(new DOMException('The user aborted a request', 'AbortError'));
    };

    input.onchange = () => {
      const files = Array.from(input.files ?? []);

      cleanup();
      resolve(filterLegacyDirectoryPickerFiles(files, options));
    };

    if ('showPicker' in HTMLInputElement.prototype) {
      input.showPicker();
      return;
    }

    input.click();
  });
}

/**
 * Extracts a plain directory name from an exclude pattern when possible
 * @param pattern Exclude glob pattern
 * @returns Directory name to skip, or null when the pattern is not a simple name
 */
function extractSkippableDirectoryName(pattern: string): string | null {
  let normalized = pattern.trim().replace(/\\/gu, '/');

  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/^\.?\//u, '').replace(/\/+$/u, '');

  if (normalized.endsWith('/**')) {
    normalized = normalized.slice(0, -3);
  }

  if (normalized.startsWith('**/')) {
    normalized = normalized.slice(3);
  }

  if (
    !normalized ||
    normalized.includes('/') ||
    /[*?[\]{}!]/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

/**
 * Filters legacy directory picker files by recursion and skip rules
 * @param files Files returned by the browser picker
 * @param options Picker recursion and skip options
 * @returns Files accepted by the picker options
 */
function filterLegacyDirectoryPickerFiles(
  files: File[],
  options: LegacyDirectoryPickerOptions
): File[] {
  if (!(options.recursive ?? false)) {
    return files.filter(file => {
      return normalizeLegacyDirectoryPickerPath(file).split('/').length === 2;
    });
  }

  if (!options.skipDirectory) {
    return files;
  }

  return files.filter(file => {
    const segments = normalizeLegacyDirectoryPickerPath(file)
      .split('/')
      .filter(Boolean);

    return segments.slice(0, -1).every(directoryName => {
      return !options.skipDirectory?.({
        kind: 'directory',
        name: directoryName,
      });
    });
  });
}

/**
 * Normalizes a legacy picker file path
 * @param file File with webkitRelativePath
 * @returns Slash-normalized relative path
 */
function normalizeLegacyDirectoryPickerPath(file: File): string {
  return file.webkitRelativePath
    .replace(/\\/gu, '/')
    .replace(/^\/+|\/+$/gu, '');
}

/**
 * Resolves a dropped data transfer item into a file tree source
 * @param item Data transfer item that may expose a handle or legacy entry
 * @returns Resolved source, or null when the item is unsupported
 */
async function resolveDataTransferItemSource(
  item: FileTreeSourceDataTransferItem
): Promise<DroppedFileTreeSource | null> {
  if (item.getAsFileSystemHandle) {
    const handle = await item.getAsFileSystemHandle();

    if (handle?.kind === 'directory') {
      return {
        access: 'handle',
        handle: handle as FileSystemDirectoryHandle,
        kind: 'directory',
        name: handle.name,
      };
    }

    if (handle?.kind === 'file') {
      const droppedFile =
        item.getAsFile() ?? (await (handle as FileSystemFileHandle).getFile());

      return resolveDroppedFileSource(droppedFile);
    }
  }

  const legacyEntry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.();

  if (legacyEntry?.isDirectory) {
    return {
      access: 'entry',
      entry: legacyEntry as unknown as DroppedFileSystemDirectoryEntry,
      kind: 'directory',
      name: legacyEntry.name,
    };
  }

  return resolveDroppedFileSource(item.getAsFile());
}

/**
 * Classifies a dropped file as a ZIP or importable source
 * @param file Dropped file, or null
 * @returns ZIP or import source, or null when the file is unsupported
 */
function resolveDroppedFileSource(
  file: File | null
): DroppedFileTreeImportSource | DroppedFileTreeZipSource | null {
  if (!file) {
    return null;
  }

  if (isZipFile(file)) {
    return {
      file,
      kind: 'zip',
      name: file.name,
    };
  }

  if (isImportFile(file)) {
    return {
      file,
      format: resolveImportFileFormat(file),
      kind: 'import-file',
      name: file.name,
    };
  }

  return null;
}

/**
 * Checks whether a dropped file looks like a ZIP archive
 * @param file Dropped file to test
 * @returns True when the file name or MIME type identifies a ZIP
 */
function isZipFile(file: File): boolean {
  return (
    ZIP_FILE_NAME_PATTERN.test(file.name) ||
    ZIP_MIME_TYPES.has(file.type.toLowerCase())
  );
}

/**
 * Checks whether a dropped file is an importable tree document
 * @param file Dropped file to test
 * @returns True when the file name or MIME type is supported
 */
function isImportFile(file: File): boolean {
  return (
    IMPORT_FILE_NAME_PATTERN.test(file.name) ||
    IMPORT_MIME_TYPES.has(file.type.toLowerCase())
  );
}

/**
 * Determines the import format from a file name extension
 * @param file Importable file
 * @returns Imported tree format inferred from the extension
 */
function resolveImportFileFormat(file: File): ImportedTreeFormat {
  const lowerCaseFileName = file.name.toLowerCase();

  if (lowerCaseFileName.endsWith('.json')) {
    return 'tree-json';
  }

  if (lowerCaseFileName.endsWith('.xml')) {
    return 'tree-xml';
  }

  if (
    lowerCaseFileName.endsWith('.html') ||
    lowerCaseFileName.endsWith('.htm')
  ) {
    return 'tree-html';
  }

  if (
    lowerCaseFileName.endsWith('.md') ||
    lowerCaseFileName.endsWith('.markdown')
  ) {
    return 'markdown-list';
  }

  return 'auto';
}
