import { createPathMap } from '../tree/records';
import type { ParsedImportedTree, ImportedTreeParseOptions } from './types';
import { FileTreeError } from '../reader/errors';
import type { TreeAnnotationMap } from '../annotations/types';
import { createImportedTreeNode } from '../reader/importedNode';
import { parseImportedAsciiTreeText } from './ascii';
import {
  buildImportedTreeFromEntries,
  sanitizeNodeName,
  type ImportedTreeEntry,
  normalizeIndentLevels,
} from './entries';
import type { FileNode } from '../reader/types';
import { appendImportedTreeAnnotation } from '../annotations/imported';
import { extractImportedTreeComment } from './comments';

/**
 * Date: 2026-11-07
 * Desc: Parses XML and HTML tree markup
 */

interface ParsedMarkupElement {
  attributes: Record<string, string>;
  children: ParsedMarkupElement[];
  tagName: string;
}

interface OpenHtmlListItem {
  finalized: boolean;
  labelParts: string[];
  level: number;
}

// Parses simple XML and HTML attribute assignments
const MARKUP_ATTRIBUTE_PATTERN =
  /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/]+))/gu;

// Finds XML and HTML tags while leaving text parsing to callers
const MARKUP_TAG_PATTERN = /<[^>]+>/gu;

// Matches a preformatted HTML block that may contain an ASCII tree
const HTML_PRE_BLOCK_PATTERN = /<pre\b[^>]*>([\s\S]*?)<\/pre>/iu;

/**
 * Detects whether text looks like an XML tree document
 * @param rawText Raw imported text
 * @returns True when the text begins with a recognized XML tree tag
 */
export function isImportedTreeXmlText(rawText: string): boolean {
  const trimmedText = rawText.trimStart().toLowerCase();

  return (
    trimmedText.startsWith('<?xml') ||
    trimmedText.startsWith('<tree') ||
    trimmedText.startsWith('<directory') ||
    trimmedText.startsWith('<dir') ||
    trimmedText.startsWith('<folder') ||
    trimmedText.startsWith('<file')
  );
}

/**
 * Parses an XML tree document into a file tree and annotations
 * @param rawText Raw XML tree text
 * @param fallbackRootName Root name used when nodes omit one
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedTreeXml(
  rawText: string,
  fallbackRootName: string
): ParsedImportedTree {
  const rootElements = parseMarkupElements(rawText);
  const firstElement = rootElements[0];

  if (!firstElement) {
    throw new FileTreeError(
      'invalid_tree',
      'XML content does not contain recognizable tree nodes'
    );
  }

  const candidateElements =
    firstElement.tagName === 'tree'
      ? firstElement.children.filter(isImportedTreeNodeElement)
      : rootElements.filter(isImportedTreeNodeElement);

  if (candidateElements.length === 0) {
    throw new FileTreeError(
      'invalid_tree',
      'XML content does not contain recognizable tree nodes'
    );
  }

  const annotations: TreeAnnotationMap = createPathMap();
  const paths = new Set<string>();

  if (candidateElements.length === 1) {
    return {
      tree: normalizeImportedMarkupTreeElement(
        candidateElements[0]!,
        fallbackRootName,
        '',
        annotations,
        paths
      ),
      annotations,
    };
  }

  const tree = createImportedTreeNode(paths, fallbackRootName, 'directory');
  tree.children = candidateElements.map(element =>
    normalizeImportedMarkupTreeElement(
      element,
      fallbackRootName,
      tree.path,
      annotations,
      paths
    )
  );

  return { tree, annotations };
}

/**
 * Detects whether text looks like an HTML tree document
 * @param rawText Raw imported text
 * @returns True when the text contains recognized HTML list or preformatted markup
 */
export function isImportedTreeHtmlText(rawText: string): boolean {
  const trimmedText = rawText.trimStart().toLowerCase();

  return (
    trimmedText.startsWith('<!doctype html') ||
    trimmedText.startsWith('<html') ||
    trimmedText.startsWith('<body') ||
    trimmedText.startsWith('<ul') ||
    trimmedText.startsWith('<ol') ||
    trimmedText.startsWith('<pre') ||
    /<(?:ul|ol|pre)\b/iu.test(rawText)
  );
}

/**
 * Parses an HTML tree document from preformatted text or nested lists
 * @param rawText Raw HTML tree text
 * @param fallbackRootName Root name used when the markup lacks one
 * @param options Comment template options used during parsing
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedTreeHtml(
  rawText: string,
  fallbackRootName: string,
  options: ImportedTreeParseOptions = {}
): ParsedImportedTree {
  const preformattedText = extractHtmlPreformattedText(rawText);

  if (preformattedText.trim()) {
    return parseImportedAsciiTreeText(
      preformattedText,
      fallbackRootName,
      options
    );
  }

  const entries = collectImportedHtmlListEntries(rawText, options);

  if (entries.length > 0) {
    return buildImportedTreeFromEntries(entries, fallbackRootName);
  }

  const plainText = normalizeHtmlText(stripMarkupTags(rawText));

  if (!plainText) {
    throw new FileTreeError(
      'invalid_tree',
      'HTML content does not contain a recognizable tree'
    );
  }

  return parseImportedAsciiTreeText(plainText, fallbackRootName, options);
}

/**
 * Parses markup text into a nested element tree
 * @param rawText Raw XML or HTML text
 * @returns Root markup elements with nested children
 */
function parseMarkupElements(rawText: string): ParsedMarkupElement[] {
  const rootElements: ParsedMarkupElement[] = [];
  const stack: ParsedMarkupElement[] = [];

  for (const match of rawText.matchAll(MARKUP_TAG_PATTERN)) {
    const rawTag = match[0];
    const parsedTag = parseMarkupTag(rawTag);

    if (!parsedTag) {
      continue;
    }

    if (parsedTag.closing) {
      while (stack.length > 0) {
        const currentElement = stack.pop();

        if (currentElement?.tagName === parsedTag.tagName) {
          break;
        }
      }
      continue;
    }

    const element: ParsedMarkupElement = {
      attributes: parsedTag.attributes,
      children: [],
      tagName: parsedTag.tagName,
    };
    const parentElement = stack.at(-1);

    if (parentElement) {
      parentElement.children.push(element);
    } else {
      rootElements.push(element);
    }

    if (!parsedTag.selfClosing) {
      stack.push(element);
    }
  }

  return rootElements;
}

/**
 * Parses a single markup tag into its name, attributes, and flags
 * @param rawTag Raw tag text including angle brackets
 * @returns Parsed tag details, or null when the tag is not an element tag
 */
function parseMarkupTag(rawTag: string): {
  attributes: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
  tagName: string;
} | null {
  const innerTag = rawTag.slice(1, -1).trim();

  if (!innerTag || innerTag.startsWith('!') || innerTag.startsWith('?')) {
    return null;
  }

  const closing = innerTag.startsWith('/');
  const normalizedInnerTag = closing ? innerTag.slice(1).trim() : innerTag;
  const selfClosing = !closing && normalizedInnerTag.endsWith('/');
  const tagBody = selfClosing
    ? normalizedInnerTag.slice(0, -1).trim()
    : normalizedInnerTag;
  const nameMatch = tagBody.match(/^([\w:-]+)/u);
  const tagNameText = nameMatch?.[0];
  const tagName = nameMatch?.[1]?.toLowerCase();

  if (!tagName || !tagNameText) {
    return null;
  }

  return {
    attributes: closing
      ? {}
      : parseMarkupAttributes(tagBody.slice(tagNameText.length)),
    closing,
    selfClosing,
    tagName,
  };
}

/**
 * Parses key-value attributes from a markup tag body
 * @param attributeText Text after the tag name
 * @returns Attribute map with decoded values
 */
function parseMarkupAttributes(attributeText: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of attributeText.matchAll(MARKUP_ATTRIBUTE_PATTERN)) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';

    if (key) {
      attributes[key] = decodeMarkupEntities(value);
    }
  }

  return attributes;
}

/**
 * Checks whether a parsed markup element is a supported tree node
 * @param element Parsed markup element to test
 * @returns True when the tag represents a directory or file
 */
function isImportedTreeNodeElement(element: ParsedMarkupElement): boolean {
  return (
    isImportedTreeDirectoryTag(element.tagName) ||
    isImportedTreeFileTag(element.tagName)
  );
}

/**
 * Checks whether a tag name is a supported directory tag
 * @param tagName Lowercase markup tag name
 * @returns True when the tag maps to a directory node
 */
function isImportedTreeDirectoryTag(tagName: string): boolean {
  return tagName === 'directory' || tagName === 'dir' || tagName === 'folder';
}

/**
 * Checks whether a tag name is a supported file tag
 * @param tagName Lowercase markup tag name
 * @returns True when the tag maps to a file node
 */
function isImportedTreeFileTag(tagName: string): boolean {
  return tagName === 'file';
}

/**
 * Converts a parsed XML or HTML tree element into a file node
 * @param element Parsed markup element to normalize
 * @param fallbackRootName Root name used when attributes omit a name
 * @param parentPath Path of the parent node
 * @param annotations Annotation map updated with extracted comments
 * @param paths Paths already claimed in this import
 * @returns Normalized file node
 */
function normalizeImportedMarkupTreeElement(
  element: ParsedMarkupElement,
  fallbackRootName: string,
  parentPath: string,
  annotations: TreeAnnotationMap,
  paths: Set<string>
): FileNode {
  const rawName =
    element.attributes.name ??
    element.attributes.label ??
    element.attributes.path ??
    fallbackRootName;
  const name = sanitizeNodeName(rawName, fallbackRootName);
  const kind: FileNode['kind'] = isImportedTreeDirectoryTag(element.tagName)
    ? 'directory'
    : 'file';
  const node = createImportedTreeNode(paths, name, kind, parentPath);
  const children = element.children.filter(isImportedTreeNodeElement);

  if (kind === 'file' && children.length > 0) {
    throw new FileTreeError(
      'invalid_tree',
      'A file node cannot contain children',
      { path: node.path }
    );
  }
  const size = parseOptionalNumber(element.attributes.size);
  const lastModified = parseOptionalNumber(
    element.attributes.lastmodified ?? element.attributes['last-modified']
  );

  if (size !== undefined) {
    node.size = size;
  }

  if (lastModified !== undefined) {
    node.lastModified = lastModified;
  }

  appendImportedTreeAnnotation(
    annotations,
    node.path,
    element.attributes.comment ?? element.attributes.annotation ?? null
  );

  if (kind === 'directory') {
    node.children = children.map(child =>
      normalizeImportedMarkupTreeElement(
        child,
        fallbackRootName,
        node.path,
        annotations,
        paths
      )
    );
  }

  return node;
}

/**
 * Extracts and decodes text from the first HTML preformatted block
 * @param rawText Raw HTML document text
 * @returns Preformatted text, or an empty string when none exists
 */
function extractHtmlPreformattedText(rawText: string): string {
  const matchedValue = rawText.match(HTML_PRE_BLOCK_PATTERN);

  return matchedValue?.[1]
    ? decodeMarkupEntities(stripMarkupTags(matchedValue[1]))
    : '';
}

/**
 * Collects nested HTML list items into leveled tree entries
 * @param rawText Raw HTML text containing list markup
 * @param options Comment template options used during parsing
 * @returns Leveled tree entries derived from the list structure
 */
function collectImportedHtmlListEntries(
  rawText: string,
  options: ImportedTreeParseOptions
): ImportedTreeEntry[] {
  const entries: ImportedTreeEntry[] = [];
  const openItems: OpenHtmlListItem[] = [];
  let listDepth = -1;
  let previousIndex = 0;

  /**
   * Appends decoded text content to the current open list item
   * @param text Raw text between HTML tags
   */
  function appendTextToCurrentItem(text: string): void {
    const currentItem = openItems.at(-1);

    if (!currentItem || currentItem.finalized) {
      return;
    }

    currentItem.labelParts.push(decodeMarkupEntities(stripMarkupTags(text)));
  }

  /**
   * Converts an open list item into a tree entry once its label is known
   * @param item Open list item to finalize
   */
  function finalizeItem(item: OpenHtmlListItem): void {
    if (item.finalized) {
      return;
    }

    const labelText = normalizeHtmlText(item.labelParts.join(' '));

    item.finalized = true;

    if (!labelText) {
      return;
    }

    const extractedComment = extractImportedTreeComment(
      labelText,
      options.commentTemplate
    );

    entries.push({
      comment: extractedComment.comment,
      label: extractedComment.text,
      level: item.level,
    });
  }

  /**
   * Finalizes and removes the current open list item
   */
  function closeCurrentItem(): void {
    const currentItem = openItems.pop();

    if (currentItem) {
      finalizeItem(currentItem);
    }
  }

  /**
   * Closes all open list items at or below a nesting level
   * @param level Minimum level to close
   */
  function closeItemsAtOrBelowLevel(level: number): void {
    while (openItems.at(-1) && openItems.at(-1)!.level >= level) {
      closeCurrentItem();
    }
  }

  for (const match of rawText.matchAll(MARKUP_TAG_PATTERN)) {
    appendTextToCurrentItem(rawText.slice(previousIndex, match.index));

    const parsedTag = parseMarkupTag(match[0]);

    previousIndex = match.index + match[0].length;

    if (!parsedTag) {
      continue;
    }

    if (parsedTag.tagName === 'ul' || parsedTag.tagName === 'ol') {
      if (parsedTag.closing) {
        closeItemsAtOrBelowLevel(listDepth + 1);
        listDepth = Math.max(-1, listDepth - 1);
        continue;
      }

      const currentItem = openItems.at(-1);

      if (currentItem) {
        finalizeItem(currentItem);
      }

      listDepth += 1;
      continue;
    }

    if (parsedTag.tagName !== 'li') {
      continue;
    }

    if (parsedTag.closing) {
      closeCurrentItem();
      continue;
    }

    closeItemsAtOrBelowLevel(listDepth);
    openItems.push({ finalized: false, labelParts: [], level: listDepth });
  }

  appendTextToCurrentItem(rawText.slice(previousIndex));
  closeItemsAtOrBelowLevel(-1);

  return normalizeIndentLevels(entries);
}

/**
 * Replaces markup tags with spacing while preserving surrounding text
 * @param rawText Raw XML or HTML text
 * @returns Plain text with tags removed
 */
function stripMarkupTags(rawText: string): string {
  return rawText.replace(MARKUP_TAG_PATTERN, ' ');
}

/**
 * Collapses HTML whitespace into a single-line label
 * @param rawText Text extracted from HTML markup
 * @returns Trimmed normalized text
 */
function normalizeHtmlText(rawText: string): string {
  return rawText.replace(/\s+/gu, ' ').trim();
}

/**
 * Decodes the small entity set needed for imported tree labels
 * @param value Text that may contain XML or HTML entities
 * @returns Text with supported entities decoded
 */
function decodeMarkupEntities(value: string): string {
  return value
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

/**
 * Parses an optional numeric attribute value
 * @param value Raw attribute value
 * @returns Number value, or undefined for empty or invalid input
 */
function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || !value.trim()) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
