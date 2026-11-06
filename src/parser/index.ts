import type { ImportedTreeParseOptions, ParsedImportedTree } from './types';
import { parseImportedTreeJson, isImportedTreeJsonText } from './json';
import {
  parseImportedTreeXml,
  parseImportedTreeHtml,
  isImportedTreeXmlText,
  isImportedTreeHtmlText,
} from './markup';
import {
  parseImportedMarkdownListTree,
  isImportedMarkdownListText,
} from './markdown';
import { parseImportedAsciiTreeText } from './ascii';
import { FileTreeError } from '../reader/errors';

/**
 * Date: 2026-06-07
 * Desc: Parses common imported directory tree text formats
 */

/**
 * Parses imported tree text using the requested or auto-detected format
 * @param rawText Raw imported tree text
 * @param fallbackRootName Root name used when the text lacks one
 * @param options Format selection and comment template options
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedTreeText(
  rawText: string,
  fallbackRootName: string,
  options: ImportedTreeParseOptions = {}
): ParsedImportedTree {
  const requestedFormat = options.format ?? 'auto';

  if (requestedFormat === 'tree-json') {
    return parseImportedTreeJson(rawText, fallbackRootName);
  }

  if (requestedFormat === 'tree-xml') {
    return parseImportedTreeXml(rawText, fallbackRootName);
  }

  if (requestedFormat === 'tree-html') {
    return parseImportedTreeHtml(rawText, fallbackRootName, options);
  }

  if (requestedFormat === 'markdown-list') {
    return parseImportedMarkdownListTree(rawText, fallbackRootName, options);
  }

  if (requestedFormat === 'ascii') {
    return parseImportedAsciiTreeText(rawText, fallbackRootName, options);
  }

  if (isImportedTreeJsonText(rawText)) {
    return parseImportedTreeJson(rawText, fallbackRootName);
  }

  if (isImportedTreeXmlText(rawText)) {
    return parseImportedTreeXml(rawText, fallbackRootName);
  }

  if (isImportedTreeHtmlText(rawText)) {
    return parseImportedTreeHtml(rawText, fallbackRootName, options);
  }

  if (isImportedMarkdownListText(rawText)) {
    return parseImportedMarkdownListTree(rawText, fallbackRootName, options);
  }

  return parseImportedAsciiTreeText(rawText, fallbackRootName, options);
}

/**
 * Parses tree text from Markdown fenced code blocks, falling back to the whole document
 * @param rawText Raw Markdown document text
 * @param fallbackRootName Root name used when the content lacks one
 * @param options Format and comment template options used during parsing
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedMarkdownDocumentTreeText(
  rawText: string,
  fallbackRootName: string,
  options: ImportedTreeParseOptions = {}
): ParsedImportedTree {
  for (const match of rawText.matchAll(/```[\w-]*\r?\n([\s\S]*?)\r?\n```/gmu)) {
    const candidateText = match[1]?.trim();

    if (!candidateText) {
      continue;
    }

    try {
      return parseImportedTreeText(candidateText, fallbackRootName, options);
    } catch (error) {
      if (
        error instanceof FileTreeError &&
        error.code === 'duplicate_tree_path'
      ) {
        if (error.line === undefined) {
          throw error;
        }

        const openingLineEnd = (match.index ?? 0) + match[0].indexOf('\n') + 1;
        const leadingWhitespace = match[1]?.match(/^\s*/u)?.[0] ?? '';
        const linesBeforeCandidate =
          (rawText.slice(0, openingLineEnd) + leadingWhitespace).split('\n')
            .length - 1;

        throw new FileTreeError(error.code, error.message, {
          ...(error.path === undefined ? {} : { path: error.path }),
          line: linesBeforeCandidate + error.line,
        });
      }

      // Continue scanning later candidates
    }
  }

  return parseImportedTreeText(rawText, fallbackRootName, options);
}

export { isImportedTreeJsonText, parseImportedTreeJson } from './json';
export {
  isImportedTreeXmlText,
  parseImportedTreeXml,
  isImportedTreeHtmlText,
  parseImportedTreeHtml,
} from './markup';
export {
  isImportedMarkdownListText,
  parseImportedMarkdownListTree,
} from './markdown';
export { isImportedAsciiTreeText, parseImportedAsciiTreeText } from './ascii';

export * from './types';
