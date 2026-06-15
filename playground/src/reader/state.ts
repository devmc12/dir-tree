import type { FileNode } from '@devmc12/dir-tree';
import { createPreparedFileTree } from '@devmc12/dir-tree';
import {
  ASCII_TREE_CONNECTOR_PRESETS,
  DEFAULT_ASCII_TREE_METADATA_TEMPLATE,
} from '@devmc12/dir-tree/ascii';
import {
  DEFAULT_TREE_ANNOTATION_ALIGNMENT_MODE,
  DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN,
  DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX,
  createTreeAnnotationPresetTemplate,
  applyTreeAnnotationPatch,
  type TreeAnnotationMap,
} from '@devmc12/dir-tree/annotations';
import type {
  FileTreeVisibilityMap,
  FileTreeVisibilityMode,
} from '@devmc12/dir-tree/tree';

import { createSampleAnnotations, createSampleTree } from '../fixtures';
import {
  type PlaygroundAsciiOptionsState,
  type PlaygroundReadOptionsState,
  type PlaygroundSource,
  type ReaderControlTab,
  type ReaderLocale,
  type ReaderStatus,
} from './types';

export interface ReaderState {
  activeControlTab: ReaderControlTab;
  annotations: TreeAnnotationMap;
  annotationDraft: string;
  asciiOptions: PlaygroundAsciiOptionsState;
  createKind: FileNode['kind'];
  createName: string;
  createPath: string | null;
  editingAnnotationPath: string | null;
  expandedPaths: string[];
  isControlPanelHidden: boolean;
  isDragActive: boolean;
  isReading: boolean;
  isTreePanelHidden: boolean;
  locale: ReaderLocale;
  readOptions: PlaygroundReadOptionsState;
  appliedReadOptions: PlaygroundReadOptionsState;
  renameName: string;
  renamingPath: string | null;
  selectedPath: string;
  source: PlaygroundSource;
  status: ReaderStatus;
  tree: FileNode;
  visibility: FileTreeVisibilityMap;
}

type ReaderAction =
  | { type: 'activate-annotation'; path: string }
  | { type: 'cancel-annotation' }
  | { type: 'cancel-create' }
  | { type: 'cancel-rename' }
  | { type: 'clear-annotation'; path: string; status: ReaderStatus }
  | { type: 'clear-visibility'; status: ReaderStatus }
  | { type: 'collapse-all' }
  | { type: 'commit-annotation'; path: string; status: ReaderStatus }
  | {
      type: 'commit-read';
      annotations: TreeAnnotationMap;
      readOptions: PlaygroundReadOptionsState;
      source: PlaygroundSource;
      status: ReaderStatus;
      tree: FileNode;
      visibility?: FileTreeVisibilityMap;
    }
  | {
      type: 'commit-tree-update';
      annotations?: TreeAnnotationMap;
      selectedPath: string;
      status: ReaderStatus;
      tree: FileNode;
      visibility?: FileTreeVisibilityMap;
    }
  | { type: 'expand-all' }
  | { type: 'select-path'; path: string }
  | { type: 'set-active-control-tab'; tab: ReaderControlTab }
  | {
      type: 'set-ascii-option';
      key: keyof PlaygroundAsciiOptionsState;
      value: PlaygroundAsciiOptionsState[keyof PlaygroundAsciiOptionsState];
    }
  | { type: 'set-annotation-draft'; value: string }
  | { type: 'set-create-kind'; kind: FileNode['kind'] }
  | { type: 'set-create-name'; value: string }
  | { type: 'set-drag-active'; active: boolean }
  | { type: 'set-locale'; locale: ReaderLocale; status: ReaderStatus }
  | { type: 'set-reading'; reading: boolean; status?: ReaderStatus }
  | {
      type: 'set-read-option';
      key: keyof PlaygroundReadOptionsState;
      value: PlaygroundReadOptionsState[keyof PlaygroundReadOptionsState];
    }
  | { type: 'set-rename-name'; value: string }
  | { type: 'set-status'; status: ReaderStatus }
  | {
      type: 'set-visibility';
      mode: FileTreeVisibilityMode;
      path: string;
      status: ReaderStatus;
    }
  | {
      type: 'start-create';
      kind?: FileNode['kind'];
      name?: string;
      path: string;
    }
  | { type: 'start-rename'; name: string; path: string }
  | { type: 'toggle-control-panel' }
  | { type: 'toggle-expanded'; path: string }
  | { type: 'toggle-tree-panel' };

export const defaultReadOptionsState: PlaygroundReadOptionsState = {
  depth: '',
  excludePatterns: 'node_modules\ndist\n.git',
  foldersFirst: true,
  readFileMeta: true,
  showHidden: false,
  sortBy: 'name',
  sortOrder: 'asc',
  useGitignore: true,
};

export const defaultAsciiOptionsState: PlaygroundAsciiOptionsState = {
  annotationAlignmentMode: DEFAULT_TREE_ANNOTATION_ALIGNMENT_MODE,
  annotationCommentColumn: DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN,
  annotationCommentPrefix: DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX,
  annotationPrefixHasSpace: true,
  annotationTemplate: createTreeAnnotationPresetTemplate(
    DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX,
    true
  ),
  appendDirectorySlash: true,
  connectorParts: ASCII_TREE_CONNECTOR_PRESETS.unicode,
  connectorStyle: 'unicode',
  indentationStyle: 'spaces-4',
  metadataStyle: 'suffix-parentheses',
  metadataTemplate: DEFAULT_ASCII_TREE_METADATA_TEMPLATE,
  rootLabelMode: 'name',
  showFileSize: false,
  showFullPath: false,
  showLineNumbers: false,
  showModifiedTime: false,
  showRoot: true,
  useMonospaceFont: true,
};

export function createInitialReaderState(options: {
  loadedStatus: string;
  sampleLabel: string;
}): ReaderState {
  const tree = createSampleTree();

  return {
    activeControlTab: 'source',
    annotations: createSampleAnnotations(),
    annotationDraft: '',
    asciiOptions: defaultAsciiOptionsState,
    createKind: 'file',
    createName: 'notes.md',
    createPath: null,
    editingAnnotationPath: null,
    expandedPaths: collectInitialExpandedPaths(tree),
    isControlPanelHidden: false,
    isDragActive: false,
    isReading: false,
    isTreePanelHidden: false,
    locale: 'en',
    readOptions: defaultReadOptionsState,
    appliedReadOptions: defaultReadOptionsState,
    renameName: '',
    renamingPath: null,
    selectedPath: tree.path,
    source: {
      kind: 'sample',
      label: options.sampleLabel,
    },
    status: {
      text: options.loadedStatus,
      tone: 'success',
    },
    tree,
    visibility: {},
  };
}

export function readerReducer(
  state: ReaderState,
  action: ReaderAction
): ReaderState {
  switch (action.type) {
    case 'activate-annotation':
      return {
        ...state,
        annotationDraft: state.annotations[action.path]?.comment ?? '',
        editingAnnotationPath: action.path,
        selectedPath: action.path,
      };

    case 'cancel-annotation':
      return {
        ...state,
        annotationDraft: '',
        editingAnnotationPath: null,
      };

    case 'cancel-create':
      return {
        ...state,
        createPath: null,
        createName: state.createKind === 'directory' ? 'folder' : 'notes.md',
      };

    case 'cancel-rename':
      return {
        ...state,
        renameName: '',
        renamingPath: null,
      };

    case 'clear-annotation':
      return {
        ...state,
        annotations: applyTreeAnnotationPatch(state.annotations, {
          comment: '',
          path: action.path,
          source: 'manual',
          syncStatus: 'local',
        }),
        annotationDraft:
          state.editingAnnotationPath === action.path
            ? ''
            : state.annotationDraft,
        editingAnnotationPath:
          state.editingAnnotationPath === action.path
            ? null
            : state.editingAnnotationPath,
        status: action.status,
      };

    case 'clear-visibility':
      return {
        ...state,
        status: action.status,
        visibility: {},
      };

    case 'collapse-all':
      return {
        ...state,
        expandedPaths: [state.tree.path],
      };

    case 'commit-annotation': {
      if (state.editingAnnotationPath !== action.path) {
        return state;
      }

      return {
        ...state,
        annotations: applyTreeAnnotationPatch(state.annotations, {
          comment: state.annotationDraft,
          path: action.path,
          source: 'manual',
          syncStatus: 'local',
        }),
        annotationDraft: '',
        editingAnnotationPath: null,
        status: action.status,
      };
    }

    case 'commit-read': {
      const nextTree = createPreparedFileTree(action.tree);

      return {
        ...state,
        annotations: action.annotations,
        annotationDraft: '',
        appliedReadOptions: action.readOptions,
        createPath: null,
        editingAnnotationPath: null,
        expandedPaths: collectInitialExpandedPaths(nextTree),
        isReading: false,
        renameName: '',
        renamingPath: null,
        selectedPath: nextTree.path,
        source: action.source,
        status: action.status,
        tree: nextTree,
        visibility: action.visibility ?? {},
      };
    }

    case 'commit-tree-update': {
      const nextTree = createPreparedFileTree(action.tree);
      const validPaths = new Set(collectFileTreePaths(nextTree));
      const nextExpandedPaths = state.expandedPaths.filter(path =>
        validPaths.has(path)
      );

      if (
        nextTree.kind === 'directory' &&
        !nextExpandedPaths.includes(nextTree.path)
      ) {
        nextExpandedPaths.unshift(nextTree.path);
      }

      return {
        ...state,
        annotations: action.annotations ?? state.annotations,
        annotationDraft: '',
        createPath: null,
        editingAnnotationPath: null,
        expandedPaths: nextExpandedPaths,
        renameName: '',
        renamingPath: null,
        selectedPath: action.selectedPath,
        status: action.status,
        tree: nextTree,
        visibility: action.visibility ?? state.visibility,
      };
    }

    case 'expand-all':
      return {
        ...state,
        expandedPaths: collectDirectoryPaths(state.tree),
      };

    case 'select-path':
      return {
        ...state,
        selectedPath: action.path,
      };

    case 'set-active-control-tab':
      return {
        ...state,
        activeControlTab: action.tab,
      };

    case 'set-ascii-option':
      return {
        ...state,
        asciiOptions: {
          ...state.asciiOptions,
          [action.key]: action.value,
        },
      };

    case 'set-annotation-draft':
      return {
        ...state,
        annotationDraft: action.value,
      };

    case 'set-create-kind':
      return {
        ...state,
        createKind: action.kind,
      };

    case 'set-create-name':
      return {
        ...state,
        createName: action.value,
      };

    case 'set-drag-active':
      return {
        ...state,
        isDragActive: action.active,
      };

    case 'set-locale':
      return {
        ...state,
        locale: action.locale,
        status: action.status,
      };

    case 'set-reading':
      return {
        ...state,
        isReading: action.reading,
        status: action.status ?? state.status,
      };

    case 'set-read-option':
      return {
        ...state,
        readOptions: {
          ...state.readOptions,
          [action.key]: action.value,
        },
      };

    case 'set-rename-name':
      return {
        ...state,
        renameName: action.value,
      };

    case 'set-status':
      return {
        ...state,
        status: action.status,
      };

    case 'set-visibility': {
      const nextVisibility = { ...state.visibility };

      if (nextVisibility[action.path] === action.mode) {
        delete nextVisibility[action.path];
      } else {
        nextVisibility[action.path] = action.mode;
      }

      return {
        ...state,
        status: action.status,
        visibility: nextVisibility,
      };
    }

    case 'start-create':
      return {
        ...state,
        createKind: action.kind ?? state.createKind,
        createName:
          action.name ?? (action.kind === 'directory' ? 'folder' : 'notes.md'),
        createPath: action.path,
        selectedPath: action.path,
      };

    case 'start-rename':
      return {
        ...state,
        renameName: action.name,
        renamingPath: action.path,
        selectedPath: action.path,
      };

    case 'toggle-control-panel':
      return {
        ...state,
        isControlPanelHidden: !state.isControlPanelHidden,
      };

    case 'toggle-expanded':
      return {
        ...state,
        expandedPaths: state.expandedPaths.includes(action.path)
          ? state.expandedPaths.filter(path => path !== action.path)
          : [...state.expandedPaths, action.path],
      };

    case 'toggle-tree-panel':
      return {
        ...state,
        isTreePanelHidden: !state.isTreePanelHidden,
      };

    default:
      return state;
  }
}

export function collectFileTreePaths(node: FileNode): string[] {
  return [
    node.path,
    ...(node.children ?? []).flatMap(child => collectFileTreePaths(child)),
  ];
}

export function collectDirectoryPaths(node: FileNode): string[] {
  return [
    ...(node.kind === 'directory' ? [node.path] : []),
    ...(node.children ?? []).flatMap(child => collectDirectoryPaths(child)),
  ];
}

export function collectInitialExpandedPaths(node: FileNode): string[] {
  return [
    node.path,
    ...(node.children ?? [])
      .filter(child => child.kind === 'directory')
      .map(child => child.path),
  ];
}
