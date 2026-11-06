import { TREE_ANNOTATION_TEMPLATE_PLACEHOLDER } from '../annotations/types';

/**
 * Date: 2026-11-07
 * Desc: Extracts comments from imported tree labels
 */

interface ParsedImportedTreeComment {
  comment: string | null;
  text: string;
}

// Splits labels from trailing annotation comments in imported text
const COMMENT_SUFFIX_PATTERN = /^(.*?)(?:\t+| {2,})(\/\/|#|;|--)\s*(.*?)\s*$/u;

/**
 * Splits a label from a trailing annotation comment
 * @param line Line text that may contain a comment suffix
 * @param commentTemplate Optional template used to recognize comments
 * @returns Label text and the extracted comment, if any
 */
export function extractImportedTreeComment(
  line: string,
  commentTemplate?: string
): ParsedImportedTreeComment {
  const templateComment = extractTemplateComment(line, commentTemplate);

  if (templateComment) {
    return templateComment;
  }

  const matchedValue = line.match(COMMENT_SUFFIX_PATTERN);

  if (!matchedValue) {
    return { text: line, comment: null };
  }

  const comment = matchedValue[3]?.trim() ?? '';

  return {
    text: (matchedValue[1] ?? '').replace(/[\t ]+$/u, ''),
    comment: comment || null,
  };
}

/**
 * Extracts a comment suffix using a configured annotation template
 * @param line Line text that may contain a templated comment
 * @param commentTemplate Template containing the annotation placeholder
 * @returns Label and comment pair, or null when the template does not match
 */
function extractTemplateComment(
  line: string,
  commentTemplate: string | undefined
): ParsedImportedTreeComment | null {
  if (
    !commentTemplate?.includes(TREE_ANNOTATION_TEMPLATE_PLACEHOLDER) ||
    commentTemplate === TREE_ANNOTATION_TEMPLATE_PLACEHOLDER
  ) {
    return null;
  }

  const [templatePrefix = '', templateSuffix = ''] = commentTemplate.split(
    TREE_ANNOTATION_TEMPLATE_PLACEHOLDER
  );
  const pattern = new RegExp(
    `^(.*?)(?:\\t+| {2,})${escapeRegExp(templatePrefix)}(.*?)${escapeRegExp(templateSuffix)}\\s*$`,
    'u'
  );
  const matchedValue = line.match(pattern);

  if (!matchedValue) {
    return null;
  }

  const comment = matchedValue[2]?.trim() ?? '';

  return {
    text: (matchedValue[1] ?? '').replace(/[\t ]+$/u, ''),
    comment: comment || null,
  };
}

/**
 * Escapes text for safe insertion into a regular expression
 * @param value Text to escape
 * @returns Escaped regular expression source
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
