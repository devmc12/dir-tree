import type { FileNode } from '../reader/types';
import { formatSize } from '../reader/utils';
import type {
  AsciiTreeConnectorParts,
  AsciiTreeConnectorStyle,
  AsciiTreeIndentationStyle,
  AsciiTreeLine,
  AsciiTreeOptions,
} from './types';
import {
  ASCII_TREE_CONNECTOR_PRESETS,
  ASCII_TREE_METADATA_STYLE_TEMPLATES,
  DEFAULT_ASCII_TREE_METADATA_TEMPLATE,
  type AsciiTreeMetadataPresetStyle,
  type AsciiTreeMetadataStyle,
} from './types';

/**
 * Date: 2026-06-07
 * Desc: Renders FileNode trees as configurable ASCII text trees
 */

interface AsciiTreeSymbols {
  branch: string;
  fileBranch: string;
  lastBranch: string;
  vertical: string;
  empty: string;
}

interface ResolvedAsciiTreeOptions {
  showLineNumbers: boolean;
  appendDirectorySlash: boolean;
  showRoot: boolean;
  rootLabelMode: 'name' | 'dot';
  showFileSize: boolean;
  showModifiedTime: boolean;
  metadataTemplate: string;
  showFullPath: boolean;
  symbols: AsciiTreeSymbols;
  renderNodeLabel?: AsciiTreeOptions['renderNodeLabel'];
}

interface AsciiTreeMetadataTemplateContext {
  filename: string;
  size?: number;
  lastModified?: number;
}

type AsciiTreeMetadataTemplatePiece =
  | {
      type: 'literal';
      value: string;
    }
  | {
      role: 'filename' | 'metadata';
      type: 'token';
      value: string | null;
    };

/**
 * Checks whether a metadata style is one of the built-in presets
 * @param metadataStyle Metadata style value to test
 * @returns True when the style has a preset template
 */
function isAsciiTreeMetadataPresetStyle(
  metadataStyle: AsciiTreeMetadataStyle
): metadataStyle is AsciiTreeMetadataPresetStyle {
  return metadataStyle in ASCII_TREE_METADATA_STYLE_TEMPLATES;
}

/**
 * Resolves the metadata template used when rendering node labels
 * @param options ASCII tree rendering options
 * @returns Custom, preset, or default metadata template
 */
function resolveAsciiTreeMetadataTemplate(options: AsciiTreeOptions): string {
  if (options.metadataTemplate?.trim()) {
    return options.metadataTemplate;
  }

  const metadataStyle = options.metadataStyle ?? 'suffix-parentheses';

  if (isAsciiTreeMetadataPresetStyle(metadataStyle)) {
    return ASCII_TREE_METADATA_STYLE_TEMPLATES[metadataStyle];
  }

  return DEFAULT_ASCII_TREE_METADATA_TEMPLATE;
}

/**
 * Resolves connector characters from a preset and optional overrides
 * @param connectorStyle Built-in connector style
 * @param connectorParts Optional custom connector character overrides
 * @returns Complete connector character set
 */
function resolveAsciiTreeConnectorParts(
  connectorStyle: AsciiTreeConnectorStyle,
  connectorParts: Partial<AsciiTreeConnectorParts> | undefined
): AsciiTreeConnectorParts {
  const presetParts = ASCII_TREE_CONNECTOR_PRESETS[connectorStyle];

  return {
    vertical: connectorParts?.vertical?.[0] ?? presetParts.vertical,
    branch: connectorParts?.branch?.[0] ?? presetParts.branch,
    horizontal: connectorParts?.horizontal?.[0] ?? presetParts.horizontal,
    lastBranch: connectorParts?.lastBranch?.[0] ?? presetParts.lastBranch,
  };
}

/**
 * Builds rendered connector strings for the selected indentation style
 * @param connectorParts Connector character parts
 * @param indentationStyle Indentation style used between levels
 * @returns Connector symbols used while rendering
 */
function createAsciiTreeSymbols(
  connectorParts: AsciiTreeConnectorParts,
  indentationStyle: AsciiTreeIndentationStyle
): AsciiTreeSymbols {
  if (indentationStyle === 'spaces-2') {
    return {
      branch: `${connectorParts.branch}${connectorParts.horizontal} `,
      fileBranch: `${connectorParts.vertical}${connectorParts.horizontal} `,
      lastBranch: `${connectorParts.lastBranch}${connectorParts.horizontal} `,
      vertical: `${connectorParts.vertical} `,
      empty: '  ',
    };
  }

  const indentation =
    indentationStyle === 'tab-1'
      ? '\t'
      : indentationStyle === 'tab-2'
        ? '\t\t'
        : '    ';
  const verticalPadding = indentationStyle === 'spaces-4' ? '   ' : indentation;

  return {
    branch: `${connectorParts.branch}${connectorParts.horizontal}${connectorParts.horizontal} `,
    fileBranch: `${connectorParts.vertical}${connectorParts.horizontal}${connectorParts.horizontal} `,
    lastBranch: `${connectorParts.lastBranch}${connectorParts.horizontal}${connectorParts.horizontal} `,
    vertical: `${connectorParts.vertical}${verticalPadding}`,
    empty: indentation,
  };
}

/**
 * Normalizes ASCII tree render options and derived symbols
 * @param options Public render options
 * @returns Resolved render options with defaults applied
 */
function resolveAsciiTreeOptions(
  options: AsciiTreeOptions = {}
): ResolvedAsciiTreeOptions {
  const connectorStyle = options.connectorStyle ?? 'unicode';
  const indentationStyle = options.indentationStyle ?? 'spaces-4';
  const connectorParts = resolveAsciiTreeConnectorParts(
    connectorStyle,
    options.connectorParts
  );
  const resolvedOptions: ResolvedAsciiTreeOptions = {
    showLineNumbers: options.showLineNumbers ?? false,
    appendDirectorySlash: options.appendDirectorySlash ?? false,
    showRoot: options.showRoot ?? true,
    rootLabelMode: options.rootLabelMode ?? 'name',
    showFileSize: options.showFileSize ?? false,
    showModifiedTime: options.showModifiedTime ?? false,
    metadataTemplate: resolveAsciiTreeMetadataTemplate(options),
    showFullPath: options.showFullPath ?? false,
    symbols: createAsciiTreeSymbols(connectorParts, indentationStyle),
  };

  if (options.renderNodeLabel) {
    resolvedOptions.renderNodeLabel = options.renderNodeLabel;
  }

  return resolvedOptions;
}

/**
 * Formats a modified timestamp for the default metadata token
 * @param timestamp Millisecond timestamp
 * @returns Formatted local date and time
 */
function formatAsciiTreeModifiedTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Formats a file size for compact ASCII metadata
 * @param bytes Size in bytes
 * @returns Compact size without internal whitespace
 */
function formatAsciiTreeSize(bytes: number): string {
  return formatSize(bytes)
    .replace(/\s+/gu, '')
    .replace(/\.0(?=[A-Za-z])/u, '');
}

/**
 * Formats a timestamp with metadata date token syntax
 * @param timestamp Millisecond timestamp
 * @param format Date token format
 * @returns Formatted date text
 */
function formatAsciiTreeDateToken(timestamp: number, format: string): string {
  const date = new Date(timestamp);
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  };

  return format.replace(
    /YYYY|YY|MM|DD|HH|mm|ss/gu,
    token => values[token] ?? token
  );
}

/**
 * Checks whether a metadata token is a date format token
 * @param token Metadata token text
 * @returns True when the token can format a modified timestamp
 */
function isAsciiTreeDateFormatToken(token: string): boolean {
  return (
    /YYYY|YY|MM|DD|HH|mm|ss/u.test(token) && /^[YMDHms\s:._/-]+$/u.test(token)
  );
}

/**
 * Resolves a metadata template token against a node label context
 * @param token Template token without percent delimiters
 * @param context Metadata values for the current node
 * @returns Token role and rendered value
 */
function resolveAsciiTreeMetadataToken(
  token: string,
  context: AsciiTreeMetadataTemplateContext
): { role: 'filename' | 'metadata'; value: string | null } {
  if (token === 'filename' || token === 'name') {
    return { role: 'filename', value: context.filename };
  }

  if (token === 'size') {
    return {
      role: 'metadata',
      value:
        context.size === undefined ? null : formatAsciiTreeSize(context.size),
    };
  }

  if (token === 'bytes' || token === 'rawSize' || token === 'sizeBytes') {
    return {
      role: 'metadata',
      value: context.size === undefined ? null : String(context.size),
    };
  }

  if (token === 'modified' || token === 'time') {
    return {
      role: 'metadata',
      value:
        context.lastModified === undefined
          ? null
          : formatAsciiTreeModifiedTime(context.lastModified),
    };
  }

  if (isAsciiTreeDateFormatToken(token)) {
    return {
      role: 'metadata',
      value:
        context.lastModified === undefined
          ? null
          : formatAsciiTreeDateToken(context.lastModified, token),
    };
  }

  return { role: 'metadata', value: null };
}

/**
 * Splits a metadata template into literal and token pieces
 * @param template Metadata template containing percent-delimited tokens
 * @param context Values used to resolve token roles and content
 * @returns Ordered literal and token pieces
 */
function parseAsciiTreeMetadataTemplate(
  template: string,
  context: AsciiTreeMetadataTemplateContext
): AsciiTreeMetadataTemplatePiece[] {
  const pieces: AsciiTreeMetadataTemplatePiece[] = [];
  const tokenPattern = /%([^%]+)%/gu;
  let nextLiteralStart = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(template)) !== null) {
    if (match.index > nextLiteralStart) {
      pieces.push({
        type: 'literal',
        value: template.slice(nextLiteralStart, match.index),
      });
    }

    const tokenResolution = resolveAsciiTreeMetadataToken(
      match[1] ?? '',
      context
    );

    pieces.push({
      type: 'token',
      role: tokenResolution.role,
      value: tokenResolution.value,
    });
    nextLiteralStart = match.index + match[0].length;
  }

  if (nextLiteralStart < template.length) {
    pieces.push({ type: 'literal', value: template.slice(nextLiteralStart) });
  }

  return pieces;
}

/**
 * Renders a metadata token group, dropping it when all values are missing
 * @param pieces Template pieces belonging to a single metadata group
 * @returns Rendered group text, or an empty string when no values are available
 */
function renderAsciiTreeMetadataTemplateGroup(
  pieces: AsciiTreeMetadataTemplatePiece[]
): string {
  const metadataTokenIndexes = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece.type === 'token' && piece.role === 'metadata')
    .map(({ index }) => index);

  if (metadataTokenIndexes.length === 0) {
    return pieces
      .filter(piece => piece.type === 'literal')
      .map(piece => piece.value)
      .join('');
  }

  const availableTokenIndexes = metadataTokenIndexes.filter(index => {
    const piece = pieces[index];

    return piece?.type === 'token' && piece.value !== null;
  });

  if (availableTokenIndexes.length === 0) {
    return '';
  }

  const firstMetadataTokenIndex = metadataTokenIndexes[0] ?? 0;
  const lastMetadataTokenIndex =
    metadataTokenIndexes[metadataTokenIndexes.length - 1] ?? 0;
  const prefix = joinAsciiTreeLiteralPieces(
    pieces.slice(0, firstMetadataTokenIndex)
  );
  const suffix = joinAsciiTreeLiteralPieces(
    pieces.slice(lastMetadataTokenIndex + 1)
  );
  const body = availableTokenIndexes
    .map((tokenIndex, order) => {
      const piece = pieces[tokenIndex];
      const value = piece?.type === 'token' ? (piece.value ?? '') : '';

      if (order === 0) {
        return value;
      }

      return `${getAsciiTreeMetadataSeparatorBeforeToken(pieces, tokenIndex)}${value}`;
    })
    .join('');

  return `${prefix}${body}${suffix}`;
}

/**
 * Joins literal template pieces into plain text
 * @param pieces Template pieces to join
 * @returns Concatenated literal text
 */
function joinAsciiTreeLiteralPieces(
  pieces: AsciiTreeMetadataTemplatePiece[]
): string {
  return pieces
    .filter(piece => piece.type === 'literal')
    .map(piece => piece.value)
    .join('');
}

/**
 * Finds literal separator text between adjacent metadata tokens
 * @param pieces Template pieces in the metadata group
 * @param tokenIndex Index of the token needing a separator
 * @returns Separator text before the token
 */
function getAsciiTreeMetadataSeparatorBeforeToken(
  pieces: AsciiTreeMetadataTemplatePiece[],
  tokenIndex: number
): string {
  let previousMetadataTokenIndex = -1;

  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    const piece = pieces[index];

    if (piece?.type === 'token' && piece.role === 'metadata') {
      previousMetadataTokenIndex = index;
      break;
    }
  }

  if (previousMetadataTokenIndex === -1) {
    return '';
  }

  return joinAsciiTreeLiteralPieces(
    pieces.slice(previousMetadataTokenIndex + 1, tokenIndex)
  );
}

/**
 * Renders a complete metadata template around the filename token
 * @param template Metadata template to render
 * @param context Values used to resolve tokens
 * @returns Rendered metadata text, falling back to the filename when empty
 */
function renderAsciiTreeMetadataTemplate(
  template: string,
  context: AsciiTreeMetadataTemplateContext
): string {
  const pieces = parseAsciiTreeMetadataTemplate(template, context);
  const outputParts: string[] = [];
  let metadataGroup: AsciiTreeMetadataTemplatePiece[] = [];

  pieces.forEach(piece => {
    if (piece.type !== 'token' || piece.role !== 'filename') {
      metadataGroup.push(piece);
      return;
    }

    outputParts.push(renderAsciiTreeMetadataTemplateGroup(metadataGroup));
    metadataGroup = [];
    outputParts.push(piece.value ?? context.filename);
  });

  outputParts.push(renderAsciiTreeMetadataTemplateGroup(metadataGroup));

  return outputParts.join('') || context.filename;
}

/**
 * Renders a preview of a metadata template using sample values
 * @param template Metadata template to render
 * @param context Optional sample filename, size, and modified time
 * @returns Rendered metadata preview text
 */
export function renderAsciiTreeMetadataTemplatePreview(
  template: string,
  context: Partial<AsciiTreeMetadataTemplateContext> = {}
): string {
  return renderAsciiTreeMetadataTemplate(template, {
    filename: context.filename ?? 'README.md',
    size: context.size ?? 12 * 1024,
    lastModified: context.lastModified ?? Date.now(),
  });
}

/**
 * Renders a preview for a preset metadata style using sample values
 * @param metadataStyle Preset metadata style to preview
 * @param context Optional sample filename, size, and modified time
 * @returns Rendered metadata preview text for the preset style
 */
export function renderAsciiTreeMetadataStylePreview(
  metadataStyle: AsciiTreeMetadataPresetStyle,
  context: Partial<AsciiTreeMetadataTemplateContext> = {}
): string {
  return renderAsciiTreeMetadataTemplatePreview(
    ASCII_TREE_METADATA_STYLE_TEMPLATES[metadataStyle],
    context
  );
}

/**
 * Creates the default rendered label for a file tree node
 * @param node File tree node being rendered
 * @param options Resolved ASCII tree options
 * @returns Node label with optional directory slash and metadata
 */
function createDefaultNodeLabel(
  node: FileNode,
  options: ResolvedAsciiTreeOptions
): string {
  const baseLabel = options.showFullPath ? node.path : node.name;
  const label =
    node.kind !== 'directory' || !options.appendDirectorySlash
      ? baseLabel || '.'
      : baseLabel === '.'
        ? './'
        : `${baseLabel}/`;

  const context: AsciiTreeMetadataTemplateContext = {
    filename: label,
  };

  if (options.showFileSize && node.size !== undefined) {
    context.size = node.size;
  }

  if (options.showModifiedTime && node.lastModified !== undefined) {
    context.lastModified = node.lastModified;
  }

  return renderAsciiTreeMetadataTemplate(options.metadataTemplate, context);
}

/**
 * Resolves the final node label, including optional host override
 * @param node File tree node being rendered
 * @param options Resolved ASCII tree options
 * @param depth Current render depth
 * @param isRoot Whether the node is rendered as the root line
 * @returns Final label text
 */
function resolveNodeLabel(
  node: FileNode,
  options: ResolvedAsciiTreeOptions,
  depth: number,
  isRoot: boolean
): string {
  const defaultLabel = createDefaultNodeLabel(node, options);

  return options.renderNodeLabel
    ? options.renderNodeLabel(node, { depth, isRoot, defaultLabel })
    : defaultLabel;
}

/**
 * Recursively appends rendered lines for a node and its children
 * @param lines Rendered line accumulator
 * @param node File tree node to render
 * @param prefix Connector prefix inherited from ancestors
 * @param isLast Whether the node is the last child of its parent
 * @param depth Current render depth
 * @param options Resolved ASCII tree options
 */
function appendAsciiTreeLines(
  lines: AsciiTreeLine[],
  node: FileNode,
  prefix: string,
  isLast: boolean,
  depth: number,
  options: ResolvedAsciiTreeOptions
): void {
  const connector = isLast
    ? options.symbols.lastBranch
    : node.kind === 'directory'
      ? options.symbols.branch
      : options.symbols.fileBranch;
  const text = `${prefix}${connector}${resolveNodeLabel(node, options, depth, false)}`;

  lines.push({
    node,
    path: node.path,
    depth,
    isRoot: false,
    text,
  });

  if (node.kind !== 'directory' || !node.children?.length) {
    return;
  }

  const childPrefix = `${prefix}${isLast ? options.symbols.empty : options.symbols.vertical}`;

  node.children.forEach((child, index) => {
    appendAsciiTreeLines(
      lines,
      child,
      childPrefix,
      index === node.children!.length - 1,
      depth + 1,
      options
    );
  });
}

/**
 * Adds one-based line number prefixes to rendered lines
 * @param lines Rendered ASCII tree lines
 * @returns Lines with line number prefixes
 */
function prependAsciiTreeLineNumbers(lines: AsciiTreeLine[]): AsciiTreeLine[] {
  if (lines.length === 0) {
    return lines;
  }

  const lineNumberWidth = String(lines.length).length;

  return lines.map((line, index) => ({
    ...line,
    text: `${String(index + 1).padStart(lineNumberWidth, ' ')} | ${line.text}`,
  }));
}

/**
 * Renders a file tree into structured ASCII tree lines
 * @param root Root file node to render
 * @param options ASCII tree rendering options
 * @returns Structured lines including node, depth, and rendered text
 */
export function renderAsciiTreeLines(
  root: FileNode,
  options: AsciiTreeOptions = {}
): AsciiTreeLine[] {
  const resolvedOptions = resolveAsciiTreeOptions(options);
  const lines: AsciiTreeLine[] = [];

  if (resolvedOptions.showRoot && resolvedOptions.rootLabelMode === 'dot') {
    lines.push({
      node: root,
      path: '',
      depth: 0,
      isRoot: true,
      isSynthetic: true,
      text: '.',
    });
    appendAsciiTreeLines(lines, root, '', true, 1, resolvedOptions);

    return resolvedOptions.showLineNumbers
      ? prependAsciiTreeLineNumbers(lines)
      : lines;
  }

  if (resolvedOptions.showRoot) {
    lines.push({
      node: root,
      path: root.path,
      depth: 0,
      isRoot: true,
      text: resolveNodeLabel(root, resolvedOptions, 0, true),
    });
  }

  if (!resolvedOptions.showRoot && root.kind !== 'directory') {
    return [
      {
        node: root,
        path: root.path,
        depth: 0,
        isRoot: true,
        text: resolveNodeLabel(root, resolvedOptions, 0, false),
      },
    ];
  }

  const nodesToRender = resolvedOptions.showRoot
    ? (root.children ?? [])
    : (root.children ?? []);

  nodesToRender.forEach((child, index) => {
    appendAsciiTreeLines(
      lines,
      child,
      '',
      index === nodesToRender.length - 1,
      resolvedOptions.showRoot ? 1 : 0,
      resolvedOptions
    );
  });

  return resolvedOptions.showLineNumbers
    ? prependAsciiTreeLineNumbers(lines)
    : lines;
}

/**
 * Renders a file tree into a single ASCII tree string
 * @param root Root file node to render
 * @param options ASCII tree rendering options
 * @returns ASCII tree text joined by newlines
 */
export function renderAsciiTree(
  root: FileNode,
  options: AsciiTreeOptions = {}
): string {
  return renderAsciiTreeLines(root, options)
    .map(line => line.text)
    .join('\n');
}
