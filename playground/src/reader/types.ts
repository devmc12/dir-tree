import type { FileNode, SortBy, SortOrder } from '@devmc12/dir-tree';
import type { DroppedFileSystemDirectoryEntry } from '@devmc12/dir-tree/adapters';
import type {
  AsciiTreeConnectorParts,
  AsciiTreeConnectorStyle,
  AsciiTreeIndentationStyle,
  AsciiTreeMetadataStyle,
  AsciiTreeRootLabelMode,
} from '@devmc12/dir-tree/ascii';
import type {
  TreeAnnotationAlignmentMode,
  TreeAnnotationCommentPrefix,
} from '@devmc12/dir-tree/annotations';

import type { PlaygroundLocale } from '../i18n';

export interface PlaygroundReadOptionsState {
  depth: string;
  excludePatterns: string;
  foldersFirst: boolean;
  readFileMeta: boolean;
  showHidden: boolean;
  sortBy: SortBy;
  sortOrder: SortOrder;
  useGitignore: boolean;
}

export interface PlaygroundAsciiOptionsState {
  annotationAlignmentMode: TreeAnnotationAlignmentMode;
  annotationCommentColumn: number;
  annotationCommentPrefix: TreeAnnotationCommentPrefix;
  annotationPrefixHasSpace: boolean;
  annotationTemplate: string;
  appendDirectorySlash: boolean;
  connectorParts: AsciiTreeConnectorParts;
  connectorStyle: AsciiTreeConnectorStyle;
  indentationStyle: AsciiTreeIndentationStyle;
  metadataStyle: AsciiTreeMetadataStyle;
  metadataTemplate: string;
  rootLabelMode: AsciiTreeRootLabelMode;
  showFileSize: boolean;
  showFullPath: boolean;
  showLineNumbers: boolean;
  showModifiedTime: boolean;
  showRoot: boolean;
  useMonospaceFont: boolean;
}

export type PlaygroundSource =
  | {
      kind: 'sample';
      label: string;
    }
  | {
      handle: FileSystemDirectoryHandle;
      kind: 'native-directory';
      label: string;
    }
  | {
      files: File[];
      kind: 'legacy-directory';
      label: string;
    }
  | {
      entry: DroppedFileSystemDirectoryEntry;
      kind: 'dropped-directory-entry';
      label: string;
    }
  | {
      file: File;
      kind: 'zip';
      label: string;
      name: string;
    };

export interface ReaderTreeRow {
  depth: number;
  node: FileNode;
}

export type ReaderControlTab = 'source' | 'style';

export type ReaderStatusTone = 'error' | 'info' | 'success';

export interface ReaderStatus {
  text: string;
  tone: ReaderStatusTone;
}

export type ReaderLocale = PlaygroundLocale;
