import type { ImportedTreeParseOptions, ParsedImportedTree } from './types';
import { FileTreeError } from '../reader/errors';
import {
  buildImportedTreeFromEntries,
  type ImportedTreeEntry,
} from './entries';
import { extractImportedTreeComment } from './comments';
import { getIndentWidth } from './markdown';

/**
 * Date: 2026-11-07
 * Desc: Parses tree connector text and line labels
 */

// Recognizes common connector variants emitted by tree renderers
const ASCII_BRANCH_PATTERN =
  /(?:├───|└───|│───|\+---|\\---|├──|└──|│──|\|--|`--|\+--|\\--|├─|└─|│─|\|-|`-)/u;

// Removes optional line numbers rendered by the ASCII tree output
const LINE_NUMBER_PATTERN = /^\s*\d+\s\|\s/u;

/**
 * Detects whether text can be treated as an ASCII tree
 * @param rawText Raw imported text
 * @returns True when the text is non-empty and not JSON, XML, or HTML
 */
export function isImportedAsciiTreeText(rawText: string): boolean {
  const trimmedText = rawText.trimStart();

  return (
    trimmedText.length > 0 &&
    !trimmedText.startsWith('{') &&
    !trimmedText.startsWith('[') &&
    !trimmedText.startsWith('<')
  );
}

/**
 * Parses ASCII tree text into a file tree and annotations
 * @param rawText Raw ASCII tree text
 * @param fallbackRootName Root name used when the text lacks one
 * @param options Comment template options used during parsing
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedAsciiTreeText(
  rawText: string,
  fallbackRootName: string,
  options: ImportedTreeParseOptions = {}
): ParsedImportedTree {
  const lines = rawText
    .split(/\r?\n/u)
    .map(line => line.trimEnd())
    .filter(line => !isIgnorableAsciiTreeLine(line));

  if (lines.length === 0) {
    throw new FileTreeError('invalid_tree', 'Imported content is empty');
  }

  return buildImportedTreeFromEntries(
    lines.map(line => parseAsciiTreeLine(line, options)),
    fallbackRootName
  );
}

/**
 * Parses one ASCII tree line into a leveled tree entry
 * @param line Single ASCII tree line
 * @param options Comment template options used during parsing
 * @returns Tree entry with label, comment, and nesting level
 */
function parseAsciiTreeLine(
  line: string,
  options: ImportedTreeParseOptions
): ImportedTreeEntry {
  const strippedLine = line.replace(LINE_NUMBER_PATTERN, '');
  const extractedComment = extractImportedTreeComment(
    strippedLine,
    options.commentTemplate
  );
  const branchMatch = extractedComment.text.match(ASCII_BRANCH_PATTERN);

  if (!branchMatch || branchMatch.index === undefined) {
    const leadingWhitespace =
      extractedComment.text.match(/^[ \t]*/u)?.[0] ?? '';

    return {
      comment: extractedComment.comment,
      label: extractedComment.text.trim(),
      level: getIndentWidth(leadingWhitespace),
    };
  }

  return {
    comment: extractedComment.comment,
    label: extractedComment.text
      .slice(branchMatch.index + branchMatch[0].length)
      .trim(),
    level:
      getTreePrefixLevel(extractedComment.text.slice(0, branchMatch.index)) + 1,
  };
}

/**
 * Checks whether an ASCII line should be ignored during import
 * @param line Raw ASCII tree line
 * @returns True for empty, fence, or connector-only lines
 */
function isIgnorableAsciiTreeLine(line: string): boolean {
  const trimmedLine = line.trim();

  return (
    trimmedLine.length === 0 ||
    trimmedLine === '```' ||
    /^```[\w-]*$/u.test(trimmedLine) ||
    /^[\s│|]+$/u.test(line)
  );
}

/**
 * Estimates the nesting level encoded in an ASCII tree line prefix
 * @param prefix Prefix text preceding the branch connector
 * @returns Estimated nesting level
 */
function getTreePrefixLevel(prefix: string): number {
  const verticalMarkerCount = Array.from(prefix.matchAll(/[│|]/gu)).length;
  const normalizedWidth = prefix.replace(/\t/gu, '    ').length;

  return Math.max(verticalMarkerCount, Math.floor(normalizedWidth / 4));
}
