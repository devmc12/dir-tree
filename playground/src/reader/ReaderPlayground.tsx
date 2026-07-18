import { useMemo, useReducer, type DragEvent, type ReactNode } from 'react';
import {
  DroppedDirectoryEntryAdapter,
  FileSystemReader,
  InMemoryFileTreeAdapter,
  LegacyDirectoryFilesAdapter,
  LocalFileSystemAdapter,
  ZipFileSystemAdapter,
  createExportedFileTreeJson,
  createFileTreeDownloadFilename,
  createFileTreeNode,
  createFileTreeReadStats,
  createVisibleFileTree,
  findFileNodeLocation,
  removeFileTreeNode,
  renameFileTreeNode,
  type ReaderAdapter,
} from '@devmc12/dir-tree';
import {
  CUSTOM_ASCII_TREE_METADATA_STYLE,
  createAsciiTreeOptionsFromConfig,
  renderAsciiTreeLines,
} from '@devmc12/dir-tree/ascii';
import {
  createAnnotatedAsciiTreeRenderOptionsFromConfig,
  filterTreeAnnotationsByPaths,
  remapTreeAnnotations,
  renderAnnotatedAsciiTree,
  TREE_ANNOTATION_INLINE_GAP,
  type TreeAnnotationMap,
} from '@devmc12/dir-tree/annotations';
import {
  isFileTreeSourceDrag,
  isLegacyDirectoryPickerSupported,
  isNativeDirectoryPickerSupported,
  openLegacyDirectoryPicker,
  resolveDroppedFileTreeSource,
  type DroppedFileTreeSource,
} from '@devmc12/dir-tree/browser';
import {
  filterFileTreeVisibilityByPaths,
  remapFileTreeVisibility,
  type FileTreeVisibilityMap,
} from '@devmc12/dir-tree/tree';

import { createSampleAnnotations, createSampleTree } from '../fixtures';
import { dictionaries } from '../i18n';
import { ReaderProvider, type ReaderActions } from './context';
import { ReaderWorkspace } from './ReaderWorkspace';
import {
  collectFileTreePaths,
  createInitialReaderState,
  readerReducer,
} from './state';
import type {
  PlaygroundReadOptionsState,
  PlaygroundSource,
  ReaderStatus,
} from './types';
import {
  areReadOptionsEqual,
  copyText,
  createMarkdownDownloadText,
  createPlaygroundReadOptions,
  downloadPlainText,
  flattenVisibleFileTree,
} from './utils';

function createStatus(text: string, tone: ReaderStatus['tone']): ReaderStatus {
  return { text, tone };
}

async function pickNativeDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  if (!picker) {
    throw new Error('Browser does not support showDirectoryPicker API');
  }

  return await picker({ mode: 'read' });
}

export function ReaderPlayground(): ReactNode {
  const [state, dispatch] = useReducer(readerReducer, null, () =>
    createInitialReaderState({
      loadedStatus: dictionaries.en.status.loaded,
      sampleLabel: dictionaries.en.source.sampleLabel,
    })
  );
  const copy = dictionaries[state.locale];
  const visibleTree = useMemo(
    () => createVisibleFileTree(state.tree, state.visibility) ?? state.tree,
    [state.tree, state.visibility]
  );
  const rows = useMemo(
    () => flattenVisibleFileTree(state.tree, state.expandedPaths),
    [state.expandedPaths, state.tree]
  );
  const selectedNode =
    useMemo(
      () => findFileNodeLocation(state.tree, state.selectedPath)?.node,
      [state.selectedPath, state.tree]
    ) ?? state.tree;
  const stats = useMemo(
    () => createFileTreeReadStats(state.tree, 0),
    [state.tree]
  );
  const asciiLines = useMemo(
    () =>
      renderAsciiTreeLines(
        visibleTree,
        createAsciiTreeOptionsFromConfig({
          appendDirectorySlash: state.asciiOptions.appendDirectorySlash,
          connectorParts: state.asciiOptions.connectorParts,
          connectorStyle: state.asciiOptions.connectorStyle,
          indentationStyle: state.asciiOptions.indentationStyle,
          metadataStyle: state.asciiOptions.metadataStyle,
          metadataTemplate:
            state.asciiOptions.metadataStyle ===
            CUSTOM_ASCII_TREE_METADATA_STYLE
              ? state.asciiOptions.metadataTemplate
              : undefined,
          rootLabelMode: state.asciiOptions.rootLabelMode,
          showFileSize: state.asciiOptions.showFileSize,
          showFullPath: state.asciiOptions.showFullPath,
          showLineNumbers: state.asciiOptions.showLineNumbers,
          showModifiedTime: state.asciiOptions.showModifiedTime,
          showRoot: state.asciiOptions.showRoot,
        })
      ),
    [state.asciiOptions, visibleTree]
  );
  const annotationRenderOptions = useMemo(
    () =>
      createAnnotatedAsciiTreeRenderOptionsFromConfig({
        alignmentMode: state.asciiOptions.annotationAlignmentMode,
        commentColumn: state.asciiOptions.annotationCommentColumn,
        commentPrefix: state.asciiOptions.annotationCommentPrefix,
        commentPrefixHasSpace: state.asciiOptions.annotationPrefixHasSpace,
        commentTemplate: state.asciiOptions.annotationTemplate,
        gap:
          state.asciiOptions.annotationAlignmentMode === 'inline'
            ? state.asciiOptions.annotationInlineGap
            : TREE_ANNOTATION_INLINE_GAP,
      }),
    [state.asciiOptions]
  );
  const asciiText = useMemo(
    () =>
      renderAnnotatedAsciiTree(
        asciiLines,
        state.annotations,
        annotationRenderOptions
      ),
    [annotationRenderOptions, asciiLines, state.annotations]
  );
  const hasPendingReadOptions = useMemo(
    () => !areReadOptionsEqual(state.readOptions, state.appliedReadOptions),
    [state.appliedReadOptions, state.readOptions]
  );

  function commitError(
    error: unknown,
    fallbackText = copy.status.importFailed
  ): void {
    dispatch({
      type: 'set-status',
      status: createStatus(
        error instanceof Error ? error.message : fallbackText,
        'error'
      ),
    });
  }

  async function readWithAdapter(options: {
    adapter: ReaderAdapter;
    annotations?: TreeAnnotationMap;
    nextReadOptions?: PlaygroundReadOptionsState;
    source: PlaygroundSource;
    statusText: string;
    visibility?: FileTreeVisibilityMap;
  }): Promise<void> {
    const nextReadOptions = options.nextReadOptions ?? state.readOptions;

    dispatch({
      type: 'set-reading',
      reading: true,
      status: createStatus(copy.status.reading, 'info'),
    });

    try {
      const reader = new FileSystemReader(options.adapter);
      const nextTree = await reader.read(
        createPlaygroundReadOptions(nextReadOptions)
      );
      const annotations =
        options.annotations ??
        filterTreeAnnotationsByPaths(
          state.annotations,
          collectFileTreePaths(nextTree)
        );

      dispatch({
        type: 'commit-read',
        annotations,
        readOptions: nextReadOptions,
        source: options.source,
        status: createStatus(options.statusText, 'success'),
        tree: nextTree,
        visibility: options.visibility,
      });
    } catch (error) {
      commitError(error);
      dispatch({ type: 'set-reading', reading: false });
    }
  }

  async function loadSample(): Promise<void> {
    await readWithAdapter({
      adapter: new InMemoryFileTreeAdapter(createSampleTree()),
      annotations: createSampleAnnotations(),
      nextReadOptions: state.readOptions,
      source: {
        kind: 'sample',
        label: copy.source.sampleLabel,
      },
      statusText: copy.status.loaded,
      visibility: {},
    });
  }

  async function readDirectory(): Promise<void> {
    if (isNativeDirectoryPickerSupported()) {
      try {
        const handle = await pickNativeDirectory();

        await readWithAdapter({
          adapter: new LocalFileSystemAdapter(
            createPlaygroundReadOptions(state.readOptions),
            handle
          ),
          source: {
            handle,
            kind: 'native-directory',
            label: handle.name,
          },
          statusText: copy.status.loaded,
          visibility: {},
        });
      } catch (error) {
        commitError(error, copy.status.directoryUnsupported);
      }

      return;
    }

    if (!isLegacyDirectoryPickerSupported()) {
      dispatch({
        type: 'set-status',
        status: createStatus(copy.status.directoryUnsupported, 'error'),
      });
      return;
    }

    try {
      const files = await openLegacyDirectoryPicker({ recursive: true });

      await readWithAdapter({
        adapter: new LegacyDirectoryFilesAdapter(
          files,
          createPlaygroundReadOptions(state.readOptions)
        ),
        source: {
          files,
          kind: 'legacy-directory',
          label: copy.source.localDirectory,
        },
        statusText: copy.status.loaded,
        visibility: {},
      });
    } catch (error) {
      commitError(error, copy.status.directoryUnsupported);
    }
  }

  async function readZipFile(file: File): Promise<void> {
    await readWithAdapter({
      adapter: new ZipFileSystemAdapter(
        file,
        createPlaygroundReadOptions(state.readOptions),
        file.name
      ),
      source: {
        file,
        kind: 'zip',
        label: file.name,
        name: file.name,
      },
      statusText: copy.status.loaded,
      visibility: {},
    });
  }

  async function applyReadOptions(): Promise<void> {
    const nextReadOptions = state.readOptions;

    const source = state.source;

    if (source.kind === 'sample') {
      await readWithAdapter({
        adapter: new InMemoryFileTreeAdapter(createSampleTree()),
        annotations: filterTreeAnnotationsByPaths(
          state.annotations,
          collectFileTreePaths(createSampleTree())
        ),
        nextReadOptions,
        source,
        statusText: copy.status.loaded,
      });
      return;
    }

    if (source.kind === 'legacy-directory') {
      await readWithAdapter({
        adapter: new LegacyDirectoryFilesAdapter(
          source.files,
          createPlaygroundReadOptions(nextReadOptions)
        ),
        nextReadOptions,
        source,
        statusText: copy.status.loaded,
      });
      return;
    }

    if (source.kind === 'dropped-directory-entry') {
      await readWithAdapter({
        adapter: new DroppedDirectoryEntryAdapter(
          source.entry,
          createPlaygroundReadOptions(nextReadOptions)
        ),
        nextReadOptions,
        source,
        statusText: copy.status.loaded,
      });
      return;
    }

    if (source.kind === 'zip') {
      await readWithAdapter({
        adapter: new ZipFileSystemAdapter(
          source.file,
          createPlaygroundReadOptions(nextReadOptions),
          source.name
        ),
        nextReadOptions,
        source,
        statusText: copy.status.loaded,
      });
      return;
    }

    if (source.kind === 'native-directory') {
      await readWithAdapter({
        adapter: new LocalFileSystemAdapter(
          createPlaygroundReadOptions(nextReadOptions),
          source.handle
        ),
        nextReadOptions,
        source,
        statusText: copy.status.loaded,
      });
    }
  }

  function resolveActionNode(path?: string) {
    const targetPath = path ?? state.selectedPath;

    return findFileNodeLocation(state.tree, targetPath)?.node ?? selectedNode;
  }

  function renameNode(path?: string): void {
    const targetNode = resolveActionNode(path);
    const nextName = state.renameName.trim();

    if (!nextName) {
      return;
    }

    const result = renameFileTreeNode(state.tree, targetNode.path, nextName);

    if (!result) {
      dispatch({
        type: 'set-status',
        status: createStatus(copy.status.operationFailed, 'error'),
      });
      return;
    }

    dispatch({
      type: 'commit-tree-update',
      annotations: remapTreeAnnotations(
        state.annotations,
        result.fromPath,
        result.toPath
      ),
      selectedPath: result.toPath,
      status: createStatus(copy.status.treeChanged, 'success'),
      tree: result.tree,
      visibility: remapFileTreeVisibility(
        state.visibility,
        result.fromPath,
        result.toPath
      ),
    });
  }

  function createNode(path?: string): void {
    const targetNode = resolveActionNode(
      path ?? state.createPath ?? state.selectedPath
    );
    const result = createFileTreeNode(state.tree, targetNode.path, {
      kind: state.createKind,
      name: state.createName,
    });

    if (!result) {
      dispatch({
        type: 'set-status',
        status: createStatus(copy.status.operationFailed, 'error'),
      });
      return;
    }

    dispatch({
      type: 'commit-tree-update',
      selectedPath: result.path,
      status: createStatus(copy.status.treeChanged, 'success'),
      tree: result.tree,
    });
  }

  function deleteNode(path?: string): void {
    const targetNode = resolveActionNode(path);

    if (targetNode.path === state.tree.path) {
      return;
    }

    const nextTree = removeFileTreeNode(state.tree, targetNode.path);

    if (!nextTree) {
      return;
    }

    const validPaths = collectFileTreePaths(nextTree);

    dispatch({
      type: 'commit-tree-update',
      annotations: filterTreeAnnotationsByPaths(state.annotations, validPaths),
      selectedPath: nextTree.path,
      status: createStatus(copy.status.treeChanged, 'success'),
      tree: nextTree,
      visibility: filterFileTreeVisibilityByPaths(state.visibility, validPaths),
    });
  }

  function hideNode(path?: string): void {
    const targetNode = resolveActionNode(path);

    if (targetNode.path === state.tree.path) {
      return;
    }

    dispatch({
      type: 'set-visibility',
      mode: 'hidden',
      path: targetNode.path,
      status: createStatus(copy.status.treeChanged, 'success'),
    });
  }

  function hideChildren(path?: string): void {
    const targetNode = resolveActionNode(path);

    if (targetNode.kind !== 'directory') {
      return;
    }

    dispatch({
      type: 'set-visibility',
      mode: 'children-hidden',
      path: targetNode.path,
      status: createStatus(copy.status.treeChanged, 'success'),
    });
  }

  function clearVisibility(): void {
    dispatch({
      type: 'clear-visibility',
      status: createStatus(copy.status.treeChanged, 'success'),
    });
  }

  function startAnnotation(path: string): void {
    dispatch({ type: 'activate-annotation', path });
  }

  function commitAnnotation(path: string): void {
    dispatch({
      type: 'commit-annotation',
      path,
      status: createStatus(copy.status.annotationSaved, 'success'),
    });
  }

  function clearAnnotation(path: string): void {
    dispatch({
      type: 'clear-annotation',
      path,
      status: createStatus(copy.status.annotationDeleted, 'success'),
    });
  }

  async function copyAscii(): Promise<void> {
    await copyText(asciiText);
    dispatch({
      type: 'set-status',
      status: createStatus(copy.status.copied, 'success'),
    });
  }

  function downloadJson(): void {
    downloadPlainText(
      createFileTreeDownloadFilename(state.tree, 'json'),
      createExportedFileTreeJson(state.tree, state.annotations, {
        visibility: state.visibility,
      }),
      'application/json'
    );
    dispatch({
      type: 'set-status',
      status: createStatus(copy.status.downloaded, 'success'),
    });
  }

  function downloadTextFile(): void {
    downloadPlainText(
      createFileTreeDownloadFilename(state.tree, 'txt'),
      asciiText
    );
    dispatch({
      type: 'set-status',
      status: createStatus(copy.status.downloaded, 'success'),
    });
  }

  function downloadMarkdown(): void {
    downloadPlainText(
      createFileTreeDownloadFilename(state.tree, 'md'),
      createMarkdownDownloadText(asciiText),
      'text/markdown'
    );
    dispatch({
      type: 'set-status',
      status: createStatus(copy.status.downloaded, 'success'),
    });
  }

  async function handleDroppedSource(
    source: DroppedFileTreeSource
  ): Promise<void> {
    if (source.kind === 'directory') {
      if (source.access === 'handle' && source.handle) {
        await readWithAdapter({
          adapter: new LocalFileSystemAdapter(
            createPlaygroundReadOptions(state.readOptions),
            source.handle
          ),
          source: {
            handle: source.handle,
            kind: 'native-directory',
            label: source.name,
          },
          statusText: copy.status.dropped,
          visibility: {},
        });
        return;
      }

      if (source.access === 'entry' && source.entry) {
        await readWithAdapter({
          adapter: new DroppedDirectoryEntryAdapter(
            source.entry,
            createPlaygroundReadOptions(state.readOptions)
          ),
          source: {
            entry: source.entry,
            kind: 'dropped-directory-entry',
            label: source.name,
          },
          statusText: copy.status.dropped,
          visibility: {},
        });
        return;
      }

      dispatch({
        type: 'set-status',
        status: createStatus(copy.status.dropUnsupported, 'error'),
      });
      return;
    }

    if (source.kind === 'zip') {
      await readWithAdapter({
        adapter: new ZipFileSystemAdapter(
          source.file,
          createPlaygroundReadOptions(state.readOptions),
          source.name
        ),
        source: {
          file: source.file,
          kind: 'zip',
          label: source.name,
          name: source.name,
        },
        statusText: copy.status.dropped,
        visibility: {},
      });
      return;
    }

    dispatch({
      type: 'set-status',
      status: createStatus(copy.status.dropUnsupported, 'error'),
    });
  }

  async function handleDrop(event: DragEvent<HTMLElement>): Promise<void> {
    if (!isFileTreeSourceDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dispatch({ type: 'set-drag-active', active: false });

    try {
      const resolution = await resolveDroppedFileTreeSource(event.dataTransfer);

      if (resolution.status === 'empty') {
        dispatch({
          type: 'set-status',
          status: createStatus(copy.status.dropEmpty, 'error'),
        });
        return;
      }

      if (resolution.status === 'unsupported-item') {
        dispatch({
          type: 'set-status',
          status: createStatus(copy.status.dropUnsupported, 'error'),
        });
        return;
      }

      await handleDroppedSource(resolution.source);
    } catch (error) {
      commitError(error, copy.status.dropUnsupported);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>): void {
    if (!isFileTreeSourceDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dispatch({ type: 'set-drag-active', active: true });
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (!isFileTreeSourceDrag(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    dispatch({ type: 'set-drag-active', active: true });
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    const relatedTarget = event.relatedTarget;

    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    dispatch({ type: 'set-drag-active', active: false });
  }

  const actions: ReaderActions = {
    applyReadOptions,
    clearAnnotation,
    clearVisibility,
    collapseAll: () => dispatch({ type: 'collapse-all' }),
    commitAnnotation,
    copyAscii,
    createNode,
    deleteNode,
    downloadJson,
    downloadMarkdown,
    downloadText: downloadTextFile,
    expandAll: () => dispatch({ type: 'expand-all' }),
    hideChildren,
    hideNode,
    loadSample,
    readDirectory,
    readZipFile,
    renameNode,
    startAnnotation,
    startCreate: (path, kind) => dispatch({ type: 'start-create', path, kind }),
    startRename: (path, name) => dispatch({ type: 'start-rename', path, name }),
  };

  return (
    <ReaderProvider
      value={{
        actions,
        derived: {
          annotationCount: Object.keys(state.annotations).length,
          asciiLines,
          asciiText,
          copy,
          hasPendingReadOptions,
          rows,
          selectedNode,
          stats,
          visibleTree,
        },
        dispatch,
        state,
      }}>
      <ReaderWorkspace
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
    </ReaderProvider>
  );
}
