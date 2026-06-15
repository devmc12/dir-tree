import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { FileNode } from '@devmc12/dir-tree';
import type {
  FileTreeVisibilityMap,
  FileTreeVisibilityMode,
} from '@devmc12/dir-tree/tree';

import { useReaderActions, useReaderContext } from './context';
import styles from './Reader.module.css';
import { formatBytes } from './utils';

interface TreeVisibilityState {
  directMode: FileTreeVisibilityMode | null;
  isMuted: boolean;
}

export function TreePanel() {
  const { derived, state } = useReaderContext();
  const actions = useReaderActions();
  const { copy, rows, stats } = derived;
  const hiddenCount = Object.keys(state.visibility).length;

  return (
    <aside className={`${styles.panel} ${styles.treePanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{copy.panels.tree}</h2>
          <p>
            {stats.totalDirs} {copy.stats.dirs} · {stats.totalFiles}{' '}
            {copy.stats.files} · {formatBytes(stats.totalSize)}
          </p>
        </div>
        <div className={styles.iconGroup}>
          {hiddenCount > 0 && (
            <button
              aria-label={copy.actions.clearVisibility}
              className={styles.iconButton}
              onClick={actions.clearVisibility}
              title={copy.actions.clearVisibility}
              type="button">
              <Eye aria-hidden="true" />
            </button>
          )}
          <button
            aria-label={copy.tree.expandAll}
            className={styles.iconButton}
            onClick={actions.expandAll}
            title={copy.tree.expandAll}
            type="button">
            <Maximize2 aria-hidden="true" />
          </button>
          <button
            aria-label={copy.tree.collapseAll}
            className={styles.iconButton}
            onClick={actions.collapseAll}
            title={copy.tree.collapseAll}
            type="button">
            <Minimize2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.treeList}>
        {rows.map(row => (
          <TreeRow key={row.node.path} depth={row.depth} node={row.node} />
        ))}
      </div>
    </aside>
  );
}

function TreeRow({ depth, node }: { depth: number; node: FileNode }) {
  const { dispatch, derived, state } = useReaderContext();
  const actions = useReaderActions();
  const { copy } = derived;
  const isDirectory = node.kind === 'directory';
  const isExpanded = state.expandedPaths.includes(node.path);
  const isSelected = state.selectedPath === node.path;
  const annotation = state.annotations[node.path];
  const isEditingAnnotation = state.editingAnnotationPath === node.path;
  const isRenaming = state.renamingPath === node.path;
  const isCreating = state.createPath === node.path;
  const visibilityState = getTreeVisibilityState(node.path, state.visibility);
  const rowStyle = {
    '--depth': depth,
  } as CSSProperties;
  const rowClassName = [
    styles.treeRow,
    isSelected ? styles.selectedRow : '',
    visibilityState.isMuted ? styles.mutedRow : '',
    isCreating || isEditingAnnotation || isRenaming ? styles.rowHasEditor : '',
    annotation?.comment ? styles.rowHasAnnotation : '',
  ]
    .filter(Boolean)
    .join(' ');

  function stopRow(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'cancel-rename' });
    }
  }

  function handleTitleDoubleClick(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();

    if (node.path === state.tree.path) {
      return;
    }

    actions.startRename(node.path, node.name);
  }

  function handleCreateKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      actions.createNode(node.path);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'cancel-create' });
    }
  }

  return (
    <div className={styles.treeItem}>
      <div
        className={rowClassName}
        onClick={() => dispatch({ path: node.path, type: 'select-path' })}
        onDoubleClick={handleTitleDoubleClick}
        style={rowStyle}>
        {isDirectory ? (
          <button
            aria-label={isExpanded ? copy.tree.collapse : copy.tree.expand}
            className={styles.treeToggle}
            onClick={event => {
              stopRow(event);
              dispatch({ path: node.path, type: 'toggle-expanded' });
            }}
            type="button">
            {isExpanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className={styles.treeToggleSpacer} aria-hidden="true" />
        )}
        <span
          className={`${styles.nodeIcon} ${
            isDirectory ? styles.folderIcon : styles.fileIcon
          }`}>
          {isDirectory ? (
            isExpanded ? (
              <FolderOpen aria-hidden="true" />
            ) : (
              <Folder aria-hidden="true" />
            )
          ) : (
            <File aria-hidden="true" />
          )}
        </span>
        <span className={styles.nodeMain}>
          {isRenaming ? (
            <input
              autoFocus
              className={styles.inlineNameInput}
              onBlur={() => actions.renameNode(node.path)}
              onChange={event =>
                dispatch({ type: 'set-rename-name', value: event.target.value })
              }
              onClick={stopRow}
              onKeyDown={handleRenameKeyDown}
              value={state.renameName}
            />
          ) : (
            <strong
              data-reader-tree-rename-trigger="true"
              onDoubleClick={handleTitleDoubleClick}
              title={node.path}>
              {node.name || '.'}
            </strong>
          )}
          {node.size !== undefined && !isRenaming && (
            <span className={styles.sizeBadge}>{formatBytes(node.size)}</span>
          )}
        </span>
        <TreeRowActions
          directMode={visibilityState.directMode}
          isDirectory={isDirectory}
          isRoot={node.path === state.tree.path}
          node={node}
          onStopRow={stopRow}
        />
        <TreeRowAnnotation
          isEditing={isEditingAnnotation}
          nodePath={node.path}
          text={annotation?.comment ?? ''}
          onStopRow={stopRow}
        />
      </div>
      {isCreating && (
        <div className={styles.createInline} style={rowStyle} onClick={stopRow}>
          <div
            className={styles.createKindSwitch}
            aria-label={copy.fields.nodeKind}>
            <button
              className={
                state.createKind === 'file' ? styles.activeSegment : ''
              }
              onClick={() =>
                dispatch({ kind: 'file', type: 'set-create-kind' })
              }
              type="button">
              <File aria-hidden="true" />
              {copy.kinds.file}
            </button>
            <button
              className={
                state.createKind === 'directory' ? styles.activeSegment : ''
              }
              onClick={() =>
                dispatch({ kind: 'directory', type: 'set-create-kind' })
              }
              type="button">
              <Folder aria-hidden="true" />
              {copy.kinds.directory}
            </button>
          </div>
          <input
            autoFocus
            className={styles.inlineCreateInput}
            onChange={event =>
              dispatch({ type: 'set-create-name', value: event.target.value })
            }
            onKeyDown={handleCreateKeyDown}
            placeholder={copy.placeholders.createName}
            value={state.createName}
          />
          <button onClick={() => actions.createNode(node.path)} type="button">
            <Plus aria-hidden="true" />
            {copy.actions.createNode}
          </button>
          <button
            aria-label={copy.actions.cancel}
            className={styles.iconButton}
            onClick={() => dispatch({ type: 'cancel-create' })}
            title={copy.actions.cancel}
            type="button">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function TreeRowActions({
  directMode,
  isDirectory,
  isRoot,
  node,
  onStopRow,
}: {
  directMode: FileTreeVisibilityMode | null;
  isDirectory: boolean;
  isRoot: boolean;
  node: FileNode;
  onStopRow: (event: MouseEvent<HTMLElement>) => void;
}) {
  const actions = useReaderActions();
  const { derived } = useReaderContext();
  const { copy } = derived;
  const isHidden = directMode === 'hidden';
  const areChildrenHidden = directMode === 'children-hidden';

  return (
    <div className={styles.rowActions} onClick={onStopRow}>
      <button
        aria-label={isHidden ? copy.tree.showNode : copy.actions.hideNode}
        className={isHidden ? styles.activeIconButton : ''}
        disabled={isRoot}
        onClick={() => actions.hideNode(node.path)}
        title={isHidden ? copy.tree.showNode : copy.actions.hideNode}
        type="button">
        {isHidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
      {isDirectory && (
        <button
          aria-label={
            areChildrenHidden
              ? copy.tree.showChildren
              : copy.actions.hideChildren
          }
          className={areChildrenHidden ? styles.activeIconButton : ''}
          onClick={() => actions.hideChildren(node.path)}
          title={
            areChildrenHidden
              ? copy.tree.showChildren
              : copy.actions.hideChildren
          }
          type="button">
          {areChildrenHidden ? (
            <FolderClosed aria-hidden="true" />
          ) : (
            <FolderTree aria-hidden="true" />
          )}
        </button>
      )}
      <button
        aria-label={copy.actions.renameNode}
        onClick={() => actions.startRename(node.path, node.name)}
        title={copy.actions.renameNode}
        type="button">
        <Edit3 aria-hidden="true" />
      </button>
      <button
        aria-label={copy.actions.createNode}
        onClick={() => actions.startCreate(node.path, 'file')}
        title={copy.actions.createNode}
        type="button">
        <FolderPlus aria-hidden="true" />
      </button>
      <button
        aria-label={copy.actions.removeNode}
        className={styles.dangerIconButton}
        disabled={isRoot}
        onClick={() => actions.deleteNode(node.path)}
        title={copy.actions.removeNode}
        type="button">
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}

function TreeRowAnnotation({
  isEditing,
  nodePath,
  onStopRow,
  text,
}: {
  isEditing: boolean;
  nodePath: string;
  onStopRow: (event: MouseEvent<HTMLElement>) => void;
  text: string;
}) {
  const { dispatch, derived, state } = useReaderContext();
  const actions = useReaderActions();
  const { copy } = derived;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  function handleAnnotationKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'cancel-annotation' });
    }
  }

  if (isEditing) {
    return (
      <div className={styles.annotationCell} onClick={onStopRow}>
        <input
          ref={inputRef}
          className={styles.annotationInput}
          onBlur={() => actions.commitAnnotation(nodePath)}
          onChange={event =>
            dispatch({
              type: 'set-annotation-draft',
              value: event.target.value,
            })
          }
          onKeyDown={handleAnnotationKeyDown}
          placeholder={copy.tree.annotationPlaceholder}
          value={state.annotationDraft}
        />
      </div>
    );
  }

  if (text) {
    return (
      <div className={styles.annotationCell} onClick={onStopRow}>
        <div className={styles.annotationBadge}>
          <button
            onClick={() => actions.startAnnotation(nodePath)}
            title={text}
            type="button">
            <span>{text}</span>
          </button>
          <button
            aria-label={copy.tree.deleteAnnotation}
            className={styles.annotationDelete}
            onClick={() => actions.clearAnnotation(nodePath)}
            title={copy.tree.deleteAnnotation}
            type="button">
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.annotationCell} onClick={onStopRow}>
      <button
        className={styles.addAnnotation}
        onClick={() => actions.startAnnotation(nodePath)}
        type="button">
        {copy.tree.addAnnotation}
      </button>
    </div>
  );
}

function getTreeVisibilityState(
  path: string,
  visibility: FileTreeVisibilityMap
): TreeVisibilityState {
  const directMode = visibility[path] ?? null;

  if (directMode) {
    return { directMode, isMuted: true };
  }

  const segments = path.split('/');

  for (let index = segments.length - 1; index > 0; index -= 1) {
    const ancestorPath = segments.slice(0, index).join('/');
    const ancestorMode = visibility[ancestorPath];

    if (ancestorMode === 'hidden' || ancestorMode === 'children-hidden') {
      return { directMode, isMuted: true };
    }
  }

  return { directMode, isMuted: false };
}
