import type { AsciiTreeLine } from '../ascii/types';
import {
  getMonospaceTextWidth,
  padMonospaceEnd,
  type MonospacePaddingMode,
} from '../ascii/utils';
import {
  DEFAULT_TREE_ANNOTATION_ALIGNMENT_MODE,
  DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN,
  DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX,
  TREE_ANNOTATION_INLINE_GAP,
  TREE_ANNOTATION_TAB_WIDTH,
  TREE_ANNOTATION_TEMPLATE_PLACEHOLDER,
} from './types';
import type {
  AnnotatedAsciiTreeRenderOptions,
  ParsedAnnotatedAsciiTreeResult,
  TreeAnnotationMap,
  TreeAnnotationPatch,
} from './types';
import { getTreeAnnotationText } from './patch';
import {
  clampTreeAnnotationCommentColumn,
  normalizeTreeAnnotationGap,
  resolveTreeAnnotationTemplate,
} from './options';

/**
 * Date: 2026-06-08
 * Desc: Renders and parses annotated ASCII tree text
 */

interface ParsedAsciiLineAnnotation {
  status: 'parsed' | 'invalid';
  comment?: string;
}

/**
 * Renders ASCII tree lines with aligned annotation comments appended
 * @param lines Rendered ASCII tree lines to annotate
 * @param annotations Annotation map keyed by node path
 * @param options Alignment, gap, and comment template options
 * @returns Annotated ASCII tree text joined by newlines
 */
export function renderAnnotatedAsciiTree(
  lines: AsciiTreeLine[],
  annotations: TreeAnnotationMap,
  options: AnnotatedAsciiTreeRenderOptions = {}
): string {
  const gapPaddingMode = options.gapPaddingMode ?? 'spaces';
  const alignmentMode =
    options.alignmentMode ?? DEFAULT_TREE_ANNOTATION_ALIGNMENT_MODE;
  const commentColumn = clampTreeAnnotationCommentColumn(
    options.commentColumn ?? DEFAULT_TREE_ANNOTATION_COMMENT_COLUMN
  );
  const legacyInlineGap =
    alignmentMode === 'inline' && options.commentColumn !== undefined
      ? commentColumn
      : undefined;
  const gap = normalizeTreeAnnotationGap(
    options.gap ?? legacyInlineGap,
    TREE_ANNOTATION_INLINE_GAP
  );
  const resolvedCommentTemplate = resolveTreeAnnotationTemplate(
    options,
    DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX
  );
  const lineWidths = lines.map(line => getMonospaceTextWidth(line.text));
  const lineComments = lines.map(line =>
    line.isSynthetic ? '' : getTreeAnnotationText(annotations, line.path)
  );
  const annotatedTreeWidth = lineWidths.reduce(
    (maxWidth, lineWidth, index) =>
      lineComments[index] ? Math.max(maxWidth, lineWidth) : maxWidth,
    0
  );
  const wholeTreeTargetWidth = Math.max(
    commentColumn,
    annotatedTreeWidth + gap
  );
  const folderGroupWidths =
    alignmentMode === 'folder-groups'
      ? createFolderAnnotationGroupWidths(lines, lineWidths, lineComments)
      : [];

  /**
   * Resolves the annotation target width for one rendered line
   * @param line ASCII tree line being annotated
   * @param index Line index used to look up precomputed widths
   * @returns Target monospace width before appending the comment
   */
  function getTargetWidth(
    line: AsciiTreeLine,
    index: number,
    lineWidth: number
  ): number {
    const lineOffset = line.isRoot ? (options.rootCommentOffset ?? 0) : 0;

    if (alignmentMode === 'folder-groups') {
      return (
        Math.max(commentColumn, (folderGroupWidths[index] ?? 0) + gap) +
        lineOffset
      );
    }

    if (alignmentMode === 'smart-column') {
      return Math.max(commentColumn + lineOffset, lineWidth + gap);
    }

    return wholeTreeTargetWidth + lineOffset;
  }

  return lines
    .map((line, index) => {
      if (line.isSynthetic) {
        return line.text;
      }

      const comment = lineComments[index];

      if (!comment) {
        return line.text;
      }

      const renderedComment = applyTreeAnnotationTemplate(
        comment,
        resolvedCommentTemplate
      );
      const lineWidth = lineWidths[index] ?? getMonospaceTextWidth(line.text);

      if (alignmentMode === 'inline') {
        return `${padInlineAnnotatedAsciiLine(
          line,
          lineWidth,
          gap,
          gapPaddingMode
        )}${renderedComment}`;
      }

      const targetWidth = getTargetWidth(line, index, lineWidth);
      const paddedText = padMonospaceEnd(
        line.text,
        targetWidth,
        gapPaddingMode,
        TREE_ANNOTATION_TAB_WIDTH
      );

      return `${paddedText}${renderedComment}`;
    })
    .join('\n');
}

/**
 * Parses edited ASCII tree text back into annotation patches
 * @param lines Original rendered ASCII tree lines used as a baseline
 * @param editedText User-edited ASCII tree text
 * @param options Comment template options used during parsing
 * @returns Parsed annotation patches and ignored line numbers
 */
export function parseAnnotatedAsciiTree(
  lines: AsciiTreeLine[],
  editedText: string,
  options: AnnotatedAsciiTreeRenderOptions = {}
): ParsedAnnotatedAsciiTreeResult {
  const rawLines = editedText.split(/\r?\n/u);
  const patches: TreeAnnotationPatch[] = [];
  const ignoredLineNumbers: number[] = [];

  lines.forEach((line, index) => {
    const rawLine = rawLines[index];

    if (rawLine === undefined) {
      ignoredLineNumbers.push(index + 1);
      return;
    }

    const parsedLine = parseAnnotatedAsciiTreeLine(rawLine, line, options);

    if (line.isSynthetic) {
      if (parsedLine.status === 'invalid' || parsedLine.comment) {
        ignoredLineNumbers.push(index + 1);
      }
      return;
    }

    if (parsedLine.status === 'invalid') {
      ignoredLineNumbers.push(index + 1);
      return;
    }

    patches.push({
      path: line.path,
      comment: parsedLine.comment ?? '',
      source: 'manual',
      syncStatus: 'local',
    });
  });

  rawLines.slice(lines.length).forEach((rawLine, extraLineIndex) => {
    if (rawLine.trim()) {
      ignoredLineNumbers.push(lines.length + extraLineIndex + 1);
    }
  });

  return {
    patches,
    ignoredLineNumbers,
  };
}

/**
 * Wraps ASCII tree text in a fenced Markdown code block
 * @param asciiTreeText ASCII tree text to wrap
 * @returns Markdown fenced block containing the tree text
 */
export function formatAsciiTreeMarkdownBlock(asciiTreeText: string): string {
  const normalizedAsciiTreeText = asciiTreeText
    .replace(/\r\n?/gu, '\n')
    .replace(/\n+$/u, '');

  return `\n\`\`\`\n${normalizedAsciiTreeText}\n\`\`\`\n\n`;
}

/**
 * Formats ignored line numbers into a comma separated string
 * @param ignoredLineNumbers Line numbers that were ignored during parsing
 * @returns Comma separated list of line numbers
 */
export function formatIgnoredAsciiLineNumbers(
  ignoredLineNumbers: number[]
): string {
  return ignoredLineNumbers.join(', ');
}

/**
 * Maps node paths to their first one-based ASCII tree line number
 * @param lines Rendered ASCII tree lines
 * @returns Map from node path to line number
 */
export function createAsciiTreeLineNumberMap(
  lines: AsciiTreeLine[]
): Map<string, number> {
  const lineNumbers = new Map<string, number>();

  lines.forEach((line, index) => {
    if (line.isSynthetic || lineNumbers.has(line.path)) {
      return;
    }

    lineNumbers.set(line.path, index + 1);
  });

  return lineNumbers;
}

/**
 * Applies an annotation comment template to raw comment text
 * @param comment Annotation comment text
 * @param commentTemplate Template containing the comment placeholder
 * @returns Rendered annotation comment
 */
function applyTreeAnnotationTemplate(
  comment: string,
  commentTemplate: string | undefined
): string {
  if (!commentTemplate?.includes(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER)) {
    return comment;
  }

  return commentTemplate.replace(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER, comment);
}

/**
 * Extracts annotation text from a rendered comment using its template
 * @param renderedComment Rendered comment text taken from a line suffix
 * @param commentTemplate Template that wraps annotation text
 * @returns Extracted annotation text, or null when the template does not match
 */
function tryExtractTreeAnnotationFromTemplate(
  renderedComment: string,
  commentTemplate: string | undefined
): string | null {
  if (!commentTemplate?.includes(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER)) {
    return renderedComment.trim();
  }

  const [templatePrefix = '', templateSuffix = ''] = commentTemplate.split(
    TREE_ANNOTATION_TEMPLATE_PLACEHOLDER
  );
  const trimmedRenderedComment = renderedComment.trim();

  if (
    !trimmedRenderedComment.startsWith(templatePrefix) ||
    !trimmedRenderedComment.endsWith(templateSuffix)
  ) {
    return null;
  }

  return trimmedRenderedComment
    .slice(
      templatePrefix.length,
      trimmedRenderedComment.length - templateSuffix.length
    )
    .trim();
}

/**
 * Pads an ASCII line before appending an inline annotation
 * @param line ASCII tree line being annotated
 * @param lineWidth Current monospace width of the line
 * @param gap Minimum gap before the annotation
 * @param gapPaddingMode Padding mode used to create the gap
 * @returns Padded ASCII line text
 */
function padInlineAnnotatedAsciiLine(
  line: AsciiTreeLine,
  lineWidth: number,
  gap: number,
  gapPaddingMode: MonospacePaddingMode
): string {
  return padMonospaceEnd(
    line.text,
    lineWidth + gap,
    gapPaddingMode,
    TREE_ANNOTATION_TAB_WIDTH
  );
}

/**
 * Resolves the parent group key used for folder-group annotation alignment
 * @param line ASCII tree line to group
 * @returns Parent path group key
 */
function getAnnotatedAsciiParentGroupKey(line: AsciiTreeLine): string {
  if (line.isRoot) {
    return '__root__';
  }

  const separatorIndex = line.path.lastIndexOf('/');

  if (separatorIndex <= 0) {
    return '__root_children__';
  }

  return line.path.slice(0, separatorIndex);
}

/**
 * Computes the maximum line width within each folder group for alignment
 * @param lines Rendered ASCII tree lines
 * @param lineWidths Monospace widths matching each line by index
 * @param lineComments Annotation text matching each line by index
 * @returns Per-line group width used to align folder-grouped annotations
 */
function createFolderAnnotationGroupWidths(
  lines: AsciiTreeLine[],
  lineWidths: number[],
  lineComments: string[]
): number[] {
  const groupWidths = new Map<string, number>();
  const groupKeys = lines.map(getAnnotatedAsciiParentGroupKey);

  groupKeys.forEach((groupKey, index) => {
    if (!lineComments[index]) {
      return;
    }

    groupWidths.set(
      groupKey,
      Math.max(groupWidths.get(groupKey) ?? 0, lineWidths[index] ?? 0)
    );
  });

  return groupKeys.map(groupKey => groupWidths.get(groupKey) ?? 0);
}

/**
 * Parses a single edited ASCII line into an annotation result
 * @param rawLine Edited raw line text
 * @param line Original ASCII tree line used as a baseline
 * @param options Comment template options used during parsing
 * @returns Parsed status and extracted comment for the line
 */
function parseAnnotatedAsciiTreeLine(
  rawLine: string,
  line: AsciiTreeLine,
  options: AnnotatedAsciiTreeRenderOptions
): ParsedAsciiLineAnnotation {
  if (!rawLine.startsWith(line.text)) {
    return { status: 'invalid' };
  }

  const suffix = rawLine.slice(line.text.length);

  if (!suffix.trim()) {
    return { status: 'parsed', comment: '' };
  }

  const extractedComment = tryExtractTreeAnnotationFromTemplate(
    suffix.replace(/^[\t ]+/u, ''),
    resolveTreeAnnotationTemplate(
      options,
      DEFAULT_TREE_ANNOTATION_COMMENT_PREFIX
    )
  );

  return extractedComment === null
    ? { status: 'invalid' }
    : { status: 'parsed', comment: extractedComment };
}
