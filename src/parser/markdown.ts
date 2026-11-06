import type { ImportedTreeParseOptions, ParsedImportedTree } from './types';
import { FileTreeError } from '../reader/errors';
import { extractImportedTreeComment } from './comments';
import { buildImportedTreeFromEntries, normalizeIndentLevels } from './entries';

/**
 * Date: 2026-11-07
 * Desc: Parses indented Markdown list trees
 */

// Detects Markdown bullet and numbered list items
const MARKDOWN_LIST_ITEM_PATTERN = /^([ \t]*)(?:[-*+]|\d+\.)\s+(.+)$/u;

/**
 * Detects whether text is predominantly a Markdown list
 * @param rawText Raw imported text
 * @returns True when most non-empty lines are Markdown list items
 */
export function isImportedMarkdownListText(rawText: string): boolean {
  const lines = rawText
    .split(/\r?\n/u)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return false;
  }

  const matchedLineCount = lines.filter(line =>
    MARKDOWN_LIST_ITEM_PATTERN.test(line)
  ).length;

  return matchedLineCount > 0 && matchedLineCount / lines.length >= 0.6;
}

/**
 * Parses a Markdown list into a file tree and annotations
 * @param rawText Raw Markdown list text
 * @param fallbackRootName Root name used when the list lacks one
 * @param options Comment template options used during parsing
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedMarkdownListTree(
  rawText: string,
  fallbackRootName: string,
  options: ImportedTreeParseOptions = {}
): ParsedImportedTree {
  const entries = rawText
    .split(/\r?\n/u)
    .map((rawLine, index) => ({
      lineNumber: index + 1,
      text: rawLine.trimEnd(),
    }))
    .filter(line => line.text.trim().length > 0)
    .map(line => {
      const matchedLine = line.text.match(MARKDOWN_LIST_ITEM_PATTERN);

      if (!matchedLine) {
        throw new FileTreeError(
          'invalid_tree',
          `Line ${line.lineNumber} is not a valid Markdown list item`,
          { line: line.lineNumber }
        );
      }

      const extractedComment = extractImportedTreeComment(
        matchedLine[2] ?? '',
        options.commentTemplate
      );

      return {
        comment: extractedComment.comment,
        label: extractedComment.text,
        level: getIndentWidth(matchedLine[1] ?? ''),
        line: line.lineNumber,
      };
    });

  return buildImportedTreeFromEntries(
    normalizeIndentLevels(entries),
    fallbackRootName
  );
}

/**
 * Measures indentation width with tabs normalized to two spaces
 * @param value Leading indentation text
 * @returns Indentation width used for Markdown list levels
 */
export function getIndentWidth(value: string): number {
  return value.replace(/\t/gu, '  ').length;
}
