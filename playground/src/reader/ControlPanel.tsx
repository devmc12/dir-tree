import {
  Archive,
  Check,
  FileType,
  FolderOpen,
  ListPlus,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import {
  ASCII_TREE_CONNECTOR_PART_KEYS,
  ASCII_TREE_CONNECTOR_PART_PRESETS,
  ASCII_TREE_CONNECTOR_PRESETS,
  ASCII_TREE_INDENTATION_STYLES,
  ASCII_TREE_METADATA_PRESET_STYLES,
  CUSTOM_ASCII_TREE_METADATA_STYLE,
  DEFAULT_ASCII_TREE_METADATA_TEMPLATE,
  renderAsciiTreeMetadataStylePreview,
  renderAsciiTreeMetadataTemplatePreview,
  type AsciiTreeConnectorPartKey,
  type AsciiTreeConnectorParts,
  type AsciiTreeConnectorStyle,
  type AsciiTreeIndentationStyle,
  type AsciiTreeMetadataStyle,
} from '@devmc12/dir-tree/ascii';
import {
  DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN,
  MAX_TREE_ANNOTATION_COMMENT_COLUMN,
  MIN_TREE_ANNOTATION_COMMENT_COLUMN,
  TREE_ANNOTATION_ALIGNMENT_MODES,
  TREE_ANNOTATION_COMMENT_PREFIXES,
  TREE_ANNOTATION_INLINE_GAP,
  TREE_ANNOTATION_TEMPLATE_PLACEHOLDER,
  clampTreeAnnotationCommentColumn,
  createTreeAnnotationPresetTemplate,
  getActiveTreeAnnotationPresetPrefix,
  getTreeAnnotationPresetSpacing,
  type TreeAnnotationAlignmentMode,
  type TreeAnnotationCommentPrefix,
} from '@devmc12/dir-tree/annotations';
import { useReaderActions, useReaderContext } from './context';
import { defaultAsciiOptionsState } from './state';
import styles from './Reader.module.css';

const COMMON_EXCLUDE_TEMPLATE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.git',
  '.cache',
  '*.log',
];

const METADATA_PREVIEW_TIMESTAMP = Date.UTC(2026, 4, 9, 12, 0);
const MAX_ANNOTATION_INLINE_GAP = 96;
const METADATA_PREVIEW_FILE = {
  filename: 'README.md',
  lastModified: METADATA_PREVIEW_TIMESTAMP,
  size: 12 * 1024,
};

function areConnectorPartsEqual(
  left: AsciiTreeConnectorParts,
  right: AsciiTreeConnectorParts
): boolean {
  return ASCII_TREE_CONNECTOR_PART_KEYS.every(
    partKey => left[partKey] === right[partKey]
  );
}

function formatConnectorPresetPreview(parts: AsciiTreeConnectorParts): string {
  return `${parts.branch}${parts.horizontal}${parts.horizontal} ${parts.lastBranch}${parts.horizontal}${parts.horizontal}`;
}

export function ControlPanel() {
  const { dispatch, derived, state } = useReaderContext();
  const actions = useReaderActions();
  const { copy, hasPendingReadOptions } = derived;

  async function handleZipChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    await actions.readZipFile(file);
    event.target.value = '';
  }

  return (
    <aside className={`${styles.panel} ${styles.controlPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{copy.panels.source}</h2>
          <p>{copy.source.panelDescription}</p>
        </div>
      </div>

      <div
        className={styles.tabs}
        role="tablist"
        aria-label={copy.panels.source}>
        <button
          aria-selected={state.activeControlTab === 'source'}
          className={
            state.activeControlTab === 'source' ? styles.activeTab : ''
          }
          onClick={() =>
            dispatch({ tab: 'source', type: 'set-active-control-tab' })
          }
          role="tab"
          type="button">
          {copy.controlTabs.source}
        </button>
        <button
          aria-selected={state.activeControlTab === 'style'}
          className={state.activeControlTab === 'style' ? styles.activeTab : ''}
          onClick={() =>
            dispatch({ tab: 'style', type: 'set-active-control-tab' })
          }
          role="tab"
          type="button">
          {copy.controlTabs.style}
        </button>
      </div>

      {state.activeControlTab === 'source' ? (
        <div className={styles.controlScroll}>
          <div className={styles.dropCard}>
            <Upload aria-hidden="true" />
            <strong>{copy.source.dropIdleTitle}</strong>
            <span>{copy.source.dropDescription}</span>
          </div>
          <div className={styles.actionGrid}>
            <button onClick={actions.loadSample} type="button">
              <RotateCcw aria-hidden="true" />
              {copy.actions.loadSample}
            </button>
            <button onClick={actions.readDirectory} type="button">
              <FolderOpen aria-hidden="true" />
              {copy.actions.readDirectory}
            </button>
            <label className={styles.fileAction}>
              <Archive aria-hidden="true" />
              {copy.fields.zipFile}
              <input
                accept=".zip,.zipx"
                onChange={handleZipChange}
                type="file"
              />
            </label>
          </div>

          <ReadOptions />
          {hasPendingReadOptions && (
            <div className={styles.pendingBar}>
              <span>{copy.readOptions.pending}</span>
              <button onClick={actions.applyReadOptions} type="button">
                {copy.readOptions.apply}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.controlScroll}>
          <AsciiOptions />
        </div>
      )}
    </aside>
  );
}

function ReadOptions() {
  const { dispatch, derived, state } = useReaderContext();
  const { copy } = derived;

  function handleApplyExcludeTemplate(): void {
    const currentPatterns = state.readOptions.excludePatterns
      .split(/\r?\n/u)
      .map(pattern => pattern.trim())
      .filter(Boolean);
    const patternSet = new Set(currentPatterns);
    const nextPatterns = [...currentPatterns];

    COMMON_EXCLUDE_TEMPLATE_PATTERNS.forEach(pattern => {
      if (patternSet.has(pattern)) {
        return;
      }

      patternSet.add(pattern);
      nextPatterns.push(pattern);
    });

    dispatch({
      type: 'set-read-option',
      key: 'excludePatterns',
      value: nextPatterns.join('\n'),
    });
  }

  return (
    <section className={styles.optionCard}>
      <div>
        <h3>{copy.readOptions.title}</h3>
        <p>{copy.readOptions.description}</p>
      </div>
      <div className={styles.optionRow}>
        <span>{copy.readOptions.depth}</span>
        <div className={styles.segmentControl}>
          <button
            className={!state.readOptions.depth ? styles.activeSegment : ''}
            onClick={() =>
              dispatch({ type: 'set-read-option', key: 'depth', value: '' })
            }
            type="button">
            {copy.readOptions.unlimited}
          </button>
          <button
            className={state.readOptions.depth ? styles.activeSegment : ''}
            onClick={() =>
              dispatch({
                type: 'set-read-option',
                key: 'depth',
                value: state.readOptions.depth || '3',
              })
            }
            type="button">
            <SlidersHorizontal aria-hidden="true" />
            {copy.readOptions.custom}
          </button>
        </div>
      </div>
      {state.readOptions.depth && (
        <label className={styles.field}>
          <span>{copy.readOptions.depth}</span>
          <input
            inputMode="numeric"
            onChange={event =>
              dispatch({
                type: 'set-read-option',
                key: 'depth',
                value: event.target.value,
              })
            }
            placeholder="3"
            value={state.readOptions.depth}
          />
        </label>
      )}
      <div className={styles.toggleStack}>
        <ReadToggleOption
          checked={state.readOptions.showHidden}
          label={copy.readOptions.showHidden}
          onChange={checked =>
            dispatch({
              type: 'set-read-option',
              key: 'showHidden',
              value: checked,
            })
          }
        />
        <ReadToggleOption
          checked={state.readOptions.useGitignore}
          label={copy.readOptions.useGitignore}
          onChange={checked =>
            dispatch({
              type: 'set-read-option',
              key: 'useGitignore',
              value: checked,
            })
          }
        />
        <ReadToggleOption
          checked={state.readOptions.readFileMeta}
          label={copy.readOptions.readFileMeta}
          onChange={checked =>
            dispatch({
              type: 'set-read-option',
              key: 'readFileMeta',
              value: checked,
            })
          }
        />
        <ReadToggleOption
          checked={state.readOptions.foldersFirst}
          label={copy.readOptions.foldersFirst}
          onChange={checked =>
            dispatch({
              type: 'set-read-option',
              key: 'foldersFirst',
              value: checked,
            })
          }
        />
      </div>
      <label className={styles.field}>
        <span>{copy.readOptions.excludePatterns}</span>
        <textarea
          onChange={event =>
            dispatch({
              type: 'set-read-option',
              key: 'excludePatterns',
              value: event.target.value,
            })
          }
          value={state.readOptions.excludePatterns}
        />
      </label>
      <button
        className={styles.subtleAction}
        onClick={handleApplyExcludeTemplate}
        type="button">
        <ListPlus aria-hidden="true" />
        {copy.readOptions.excludeTemplate}
      </button>
      <div className={styles.twoColumns}>
        <label className={styles.field}>
          <span>{copy.readOptions.sortBy}</span>
          <select
            onChange={event =>
              dispatch({
                type: 'set-read-option',
                key: 'sortBy',
                value: event.target.value,
              })
            }
            value={state.readOptions.sortBy}>
            <option value="name">{copy.readOptions.sortByName}</option>
            <option value="type">{copy.readOptions.sortByType}</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>{copy.readOptions.sortOrder}</span>
          <select
            onChange={event =>
              dispatch({
                type: 'set-read-option',
                key: 'sortOrder',
                value: event.target.value,
              })
            }
            value={state.readOptions.sortOrder}>
            <option value="asc">{copy.readOptions.sortAsc}</option>
            <option value="desc">{copy.readOptions.sortDesc}</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function AsciiOptions() {
  const { dispatch, derived, state } = useReaderContext();
  const { copy } = derived;
  const activeAnnotationPrefix = getActiveTreeAnnotationPresetPrefix(
    state.asciiOptions.annotationTemplate
  );
  const activeAnnotationSpacing = getTreeAnnotationPresetSpacing(
    state.asciiOptions.annotationTemplate
  );
  const annotationPrefixHasSpace =
    activeAnnotationSpacing ?? state.asciiOptions.annotationPrefixHasSpace;
  const isInlineAnnotationMode =
    state.asciiOptions.annotationAlignmentMode === 'inline';
  const annotationSpacingDefault = isInlineAnnotationMode
    ? TREE_ANNOTATION_INLINE_GAP
    : DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN;
  const annotationSpacingLabel = isInlineAnnotationMode
    ? copy.annotationStyle.inlineGap
    : copy.annotationStyle.commentColumn;
  const annotationSpacingMax = isInlineAnnotationMode
    ? MAX_ANNOTATION_INLINE_GAP
    : MAX_TREE_ANNOTATION_COMMENT_COLUMN;
  const annotationSpacingMin = isInlineAnnotationMode
    ? TREE_ANNOTATION_INLINE_GAP
    : MIN_TREE_ANNOTATION_COMMENT_COLUMN;
  const annotationSpacingValue = isInlineAnnotationMode
    ? state.asciiOptions.annotationInlineGap
    : state.asciiOptions.annotationCommentColumn;
  const connectorPartPresets =
    ASCII_TREE_CONNECTOR_PART_PRESETS[state.asciiOptions.connectorStyle];
  const activeConnectorPartPresetId = connectorPartPresets.find(preset =>
    areConnectorPartsEqual(
      state.asciiOptions.connectorParts,
      preset.connectorParts
    )
  )?.id;
  const metadataPreview =
    state.asciiOptions.metadataStyle === CUSTOM_ASCII_TREE_METADATA_STYLE
      ? renderAsciiTreeMetadataTemplatePreview(
          state.asciiOptions.metadataTemplate ||
            DEFAULT_ASCII_TREE_METADATA_TEMPLATE,
          METADATA_PREVIEW_FILE
        )
      : renderAsciiTreeMetadataStylePreview(
          state.asciiOptions.metadataStyle,
          METADATA_PREVIEW_FILE
        );

  function setAsciiOption<Key extends keyof typeof state.asciiOptions>(
    key: Key,
    value: (typeof state.asciiOptions)[Key]
  ): void {
    dispatch({ type: 'set-ascii-option', key, value });
  }

  function resetAsciiOptions(): void {
    Object.entries(defaultAsciiOptionsState).forEach(([key, value]) => {
      dispatch({
        type: 'set-ascii-option',
        key: key as keyof typeof state.asciiOptions,
        value,
      });
    });
  }

  function setConnectorStyle(connectorStyle: AsciiTreeConnectorStyle): void {
    setAsciiOption('connectorStyle', connectorStyle);
    setAsciiOption(
      'connectorParts',
      ASCII_TREE_CONNECTOR_PRESETS[connectorStyle]
    );
  }

  function setConnectorPart(
    partKey: AsciiTreeConnectorPartKey,
    value: string
  ): void {
    const nextCharacter = Array.from(value)[0] ?? '';

    setAsciiOption('connectorParts', {
      ...state.asciiOptions.connectorParts,
      [partKey]: nextCharacter,
    });
  }

  function handleConnectorPartBlur(partKey: AsciiTreeConnectorPartKey): void {
    if (state.asciiOptions.connectorParts[partKey]) {
      return;
    }

    setConnectorPart(
      partKey,
      ASCII_TREE_CONNECTOR_PRESETS[state.asciiOptions.connectorStyle][partKey]
    );
  }

  function applyAnnotationPrefix(prefix: TreeAnnotationCommentPrefix): void {
    setAsciiOption('annotationCommentPrefix', prefix);
    setAsciiOption(
      'annotationTemplate',
      createTreeAnnotationPresetTemplate(prefix, annotationPrefixHasSpace)
    );
  }

  function setAnnotationPrefixSpacing(hasSpace: boolean): void {
    setAsciiOption('annotationPrefixHasSpace', hasSpace);
    const activePrefix =
      activeAnnotationPrefix ?? state.asciiOptions.annotationCommentPrefix;

    setAsciiOption(
      'annotationTemplate',
      createTreeAnnotationPresetTemplate(activePrefix, hasSpace)
    );
  }

  function setAnnotationCommentColumn(value: number): void {
    setAsciiOption(
      'annotationCommentColumn',
      clampTreeAnnotationCommentColumn(value)
    );
  }

  function setAnnotationInlineGap(value: number): void {
    const nextValue = Number.isFinite(value)
      ? Math.min(
          MAX_ANNOTATION_INLINE_GAP,
          Math.max(TREE_ANNOTATION_INLINE_GAP, Math.round(value))
        )
      : TREE_ANNOTATION_INLINE_GAP;

    setAsciiOption('annotationInlineGap', nextValue);
  }

  function setAnnotationSpacing(value: number): void {
    if (isInlineAnnotationMode) {
      setAnnotationInlineGap(value);
      return;
    }

    setAnnotationCommentColumn(value);
  }

  return (
    <>
      <section className={styles.optionCard}>
        <div className={styles.optionTitleRow}>
          <div>
            <h3>{copy.ascii.styleTitle}</h3>
            <p>{copy.ascii.styleDescription}</p>
          </div>
          <button
            aria-label={copy.ascii.resetStyle}
            className={styles.iconButton}
            onClick={resetAsciiOptions}
            title={copy.ascii.resetStyle}
            type="button">
            <RotateCcw aria-hidden="true" />
          </button>
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>
            {copy.ascii.connectorStyle}
          </span>
          <div className={styles.segmentControl}>
            {(['unicode', 'ascii'] as const).map(style => (
              <button
                className={
                  state.asciiOptions.connectorStyle === style
                    ? styles.activeSegment
                    : ''
                }
                key={style}
                onClick={() => setConnectorStyle(style)}
                type="button">
                {style === 'unicode'
                  ? copy.ascii.connectorUnicode
                  : copy.ascii.connectorAscii}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.connectorEditor}>
          <div className={styles.connectorPreview}>
            <span>{copy.ascii.connectorCharacters}</span>
            <div className={styles.inlinePreviewActions}>
              <code>
                {state.asciiOptions.connectorParts.branch}
                {state.asciiOptions.connectorParts.horizontal}
                {state.asciiOptions.connectorParts.horizontal} item
              </code>
              <button
                aria-label={copy.ascii.resetStyle}
                className={styles.inlineIconButton}
                onClick={() =>
                  setAsciiOption(
                    'connectorParts',
                    ASCII_TREE_CONNECTOR_PRESETS[
                      state.asciiOptions.connectorStyle
                    ]
                  )
                }
                title={copy.ascii.resetStyle}
                type="button">
                <RotateCcw aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={styles.connectorGrid}>
            {ASCII_TREE_CONNECTOR_PART_KEYS.map(partKey => (
              <label className={styles.field} key={partKey}>
                <span>{copy.ascii.connectorParts[partKey]}</span>
                <input
                  className={styles.centerInput}
                  maxLength={1}
                  onBlur={() => handleConnectorPartBlur(partKey)}
                  onChange={event =>
                    setConnectorPart(partKey, event.target.value)
                  }
                  value={state.asciiOptions.connectorParts[partKey]}
                />
              </label>
            ))}
          </div>
          {connectorPartPresets.length > 1 && (
            <div className={styles.segmentControl}>
              {connectorPartPresets.map(preset => (
                <button
                  className={
                    activeConnectorPartPresetId === preset.id
                      ? styles.activeSegment
                      : ''
                  }
                  key={preset.id}
                  onClick={() =>
                    setAsciiOption('connectorParts', preset.connectorParts)
                  }
                  type="button">
                  <code>
                    {formatConnectorPresetPreview(preset.connectorParts)}
                  </code>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>{copy.ascii.indentation}</span>
          <div className={styles.segmentGrid}>
            {ASCII_TREE_INDENTATION_STYLES.map(indentationStyle => (
              <button
                className={
                  state.asciiOptions.indentationStyle === indentationStyle
                    ? styles.activeSegment
                    : ''
                }
                key={indentationStyle}
                onClick={() =>
                  setAsciiOption(
                    'indentationStyle',
                    indentationStyle as AsciiTreeIndentationStyle
                  )
                }
                type="button">
                {copy.ascii.indentationOptions[indentationStyle]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.toggleStack}>
          <ToggleOption
            checked={state.asciiOptions.useMonospaceFont}
            label={copy.ascii.useMonospaceFont}
            onChange={checked => setAsciiOption('useMonospaceFont', checked)}
          />
          <ToggleOption
            checked={state.asciiOptions.showLineNumbers}
            label={copy.ascii.lineNumbers}
            onChange={checked => setAsciiOption('showLineNumbers', checked)}
          />
          <ToggleOption
            checked={state.asciiOptions.appendDirectorySlash}
            label={copy.ascii.appendDirectorySlash}
            onChange={checked =>
              setAsciiOption('appendDirectorySlash', checked)
            }
          />
          <ToggleOption
            checked={state.asciiOptions.showRoot}
            label={copy.ascii.showRoot}
            onChange={checked => setAsciiOption('showRoot', checked)}
          />
          <ToggleOption
            checked={state.asciiOptions.showFullPath}
            label={copy.ascii.showFullPath}
            onChange={checked => setAsciiOption('showFullPath', checked)}
          />
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>{copy.ascii.rootLabelMode}</span>
          <div className={styles.segmentControl}>
            {(['name', 'dot'] as const).map(mode => (
              <button
                className={
                  state.asciiOptions.rootLabelMode === mode
                    ? styles.activeSegment
                    : ''
                }
                disabled={!state.asciiOptions.showRoot}
                key={mode}
                onClick={() => setAsciiOption('rootLabelMode', mode)}
                type="button">
                {copy.ascii.rootLabelOptions[mode]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.optionCard}>
        <div>
          <h3>{copy.ascii.metadataTitle}</h3>
          <p>{copy.ascii.metadataDescription}</p>
        </div>
        <div className={styles.toggleStack}>
          <ToggleOption
            checked={state.asciiOptions.showFileSize}
            label={copy.ascii.fileSize}
            onChange={checked => setAsciiOption('showFileSize', checked)}
          />
          <ToggleOption
            checked={state.asciiOptions.showModifiedTime}
            label={copy.ascii.modifiedTime}
            onChange={checked => setAsciiOption('showModifiedTime', checked)}
          />
        </div>
        <label className={styles.field}>
          <span>{copy.ascii.metadataStyle}</span>
          <select
            onChange={event =>
              setAsciiOption(
                'metadataStyle',
                event.target.value as AsciiTreeMetadataStyle
              )
            }
            value={state.asciiOptions.metadataStyle}>
            {ASCII_TREE_METADATA_PRESET_STYLES.map(metadataStyle => (
              <option key={metadataStyle} value={metadataStyle}>
                {renderAsciiTreeMetadataStylePreview(
                  metadataStyle,
                  METADATA_PREVIEW_FILE
                )}
              </option>
            ))}
            <option value={CUSTOM_ASCII_TREE_METADATA_STYLE}>
              {copy.ascii.metadataCustomStyle}
            </option>
          </select>
        </label>
        {state.asciiOptions.metadataStyle ===
          CUSTOM_ASCII_TREE_METADATA_STYLE && (
          <label className={styles.field}>
            <span>{copy.ascii.metadataTemplate}</span>
            <input
              className={styles.monoInput}
              onChange={event =>
                setAsciiOption('metadataTemplate', event.target.value)
              }
              placeholder={DEFAULT_ASCII_TREE_METADATA_TEMPLATE}
              value={state.asciiOptions.metadataTemplate}
            />
          </label>
        )}
        <div className={styles.previewLine}>
          <FileType aria-hidden="true" />
          <code>{metadataPreview}</code>
        </div>
      </section>

      <section className={styles.optionCard}>
        <div>
          <h3>{copy.annotationStyle.title}</h3>
          <p>{copy.annotationStyle.description}</p>
        </div>
        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>
            {copy.annotationStyle.prefix}
          </span>
          <div className={styles.segmentGridFour}>
            {TREE_ANNOTATION_COMMENT_PREFIXES.map(prefix => (
              <button
                className={
                  activeAnnotationPrefix === prefix ? styles.activeSegment : ''
                }
                key={prefix}
                onClick={() => applyAnnotationPrefix(prefix)}
                type="button">
                {prefix}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.field}>
          <span>{copy.annotationStyle.template}</span>
          <input
            className={styles.monoInput}
            onChange={event =>
              setAsciiOption('annotationTemplate', event.target.value)
            }
            placeholder={`# ${TREE_ANNOTATION_TEMPLATE_PLACEHOLDER}`}
            value={state.asciiOptions.annotationTemplate}
          />
        </label>
        <ToggleOption
          checked={annotationPrefixHasSpace}
          label={copy.annotationStyle.space}
          onChange={setAnnotationPrefixSpacing}
        />
        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>
            {copy.annotationStyle.alignment}
          </span>
          <div className={styles.segmentGrid}>
            {TREE_ANNOTATION_ALIGNMENT_MODES.map(mode => (
              <button
                className={
                  state.asciiOptions.annotationAlignmentMode === mode
                    ? styles.activeSegment
                    : ''
                }
                key={mode}
                onClick={() =>
                  setAsciiOption(
                    'annotationAlignmentMode',
                    mode as TreeAnnotationAlignmentMode
                  )
                }
                type="button">
                {copy.annotationStyle.alignmentOptions[mode]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.optionRow}>
          <span>{annotationSpacingLabel}</span>
          <div className={styles.inlinePreviewActions}>
            <input
              className={styles.numberInput}
              inputMode="numeric"
              max={annotationSpacingMax}
              min={annotationSpacingMin}
              onChange={event =>
                setAnnotationSpacing(Number(event.target.value))
              }
              type="number"
              value={annotationSpacingValue}
            />
            <button
              aria-label={copy.ascii.resetStyle}
              className={styles.inlineIconButton}
              onClick={() => setAnnotationSpacing(annotationSpacingDefault)}
              title={copy.ascii.resetStyle}
              type="button">
              <RotateCcw aria-hidden="true" />
            </button>
          </div>
        </div>
        <input
          max={annotationSpacingMax}
          min={annotationSpacingMin}
          onChange={event => setAnnotationSpacing(Number(event.target.value))}
          type="range"
          value={annotationSpacingValue}
        />
        <div className={styles.rangeTicks}>
          <span>{annotationSpacingMin}</span>
          <span>{annotationSpacingMax}</span>
        </div>
      </section>
    </>
  );
}

function ReadToggleOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function ToggleOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <input
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        type="checkbox"
      />
      {checked && <Check aria-hidden="true" />}
      <span>{label}</span>
    </label>
  );
}
