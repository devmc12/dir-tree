import type { FileNode } from '../reader/types';
import { buildFileTreeChildPath } from '../tree';
import {
  type TreeAnnotationMap,
  TREE_ANNOTATION_TEMPLATE_PLACEHOLDER,
} from '../annotations';
import type { ImportedTreeParseOptions, ParsedImportedTree } from './types';

/**
 * Date: 2026-06-07
 * Desc: Parses common imported directory tree text formats
 */

export * from './types';

interface ImportedTreeEntry {
  comment: string | null;
  label: string;
  level: number;
}

interface ImportedJsonNode extends Record<string, unknown> {
  children?: unknown;
  contents?: unknown;
}

interface ParsedImportedTreeComment {
  comment: string | null;
  text: string;
}

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

// Recognizes common connector variants emitted by tree renderers
const ASCII_BRANCH_PATTERN =
  /(?:├───|└───|\+---|\\---|├──|└──|\|--|`--|\+--|\\--|├─|└─|\|-|`-)/u;
// Splits labels from trailing annotation comments in imported text
const COMMENT_SUFFIX_PATTERN = /^(.*?)(?:\t+| {2,})(\/\/|#|;|--)\s*(.*?)\s*$/u;
// Removes optional line numbers rendered by the ASCII tree output
const LINE_NUMBER_PATTERN = /^\s*\d+\s\|\s/u;
// Detects Markdown bullet and numbered list items
const MARKDOWN_LIST_ITEM_PATTERN = /^([ \t]*)(?:[-*+]|\d+\.)\s+(.+)$/u;
// Parses simple XML and HTML attribute assignments
const MARKUP_ATTRIBUTE_PATTERN =
  /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/]+))/gu;
// Finds XML and HTML tags while leaving text parsing to callers
const MARKUP_TAG_PATTERN = /<[^>]+>/gu;
// Matches a preformatted HTML block that may contain an ASCII tree
const HTML_PRE_BLOCK_PATTERN = /<pre\b[^>]*>([\s\S]*?)<\/pre>/iu;

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
 * Detects whether text looks like a JSON tree document
 * @param rawText Raw imported text
 * @returns True when the text begins with a JSON object or array
 */
export function isImportedTreeJsonText(rawText: string): boolean {
  const trimmedText = rawText.trimStart();

  return trimmedText.startsWith('{') || trimmedText.startsWith('[');
}

/**
 * Parses a JSON tree document into a file tree and annotations
 * @param rawText Raw JSON tree text
 * @param fallbackRootName Root name used when nodes omit one
 * @returns Parsed tree and extracted annotations
 */
export function parseImportedTreeJson(
  rawText: string,
  fallbackRootName: string
): ParsedImportedTree {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawText);
  } catch {
    throw new Error('JSON content could not be parsed');
  }

  const rootCandidates = Array.isArray(parsedValue)
    ? parsedValue
    : isRecordValue(parsedValue)
      ? [parsedValue]
      : [];

  if (rootCandidates.length === 0) {
    throw new Error('JSON content does not contain recognizable tree nodes');
  }

  const annotations: TreeAnnotationMap = {};

  if (rootCandidates.length === 1) {
    return {
      tree: normalizeImportedJsonNode(
        rootCandidates[0],
        fallbackRootName,
        '',
        annotations
      ),
      annotations,
    };
  }

  return {
    tree: {
      name: fallbackRootName,
      path: fallbackRootName,
      kind: 'directory',
      children: rootCandidates.map(candidate =>
        normalizeImportedJsonNode(
          candidate,
          fallbackRootName,
          fallbackRootName,
          annotations
        )
      ),
    },
    annotations,
  };
}

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
    throw new Error('XML content does not contain recognizable tree nodes');
  }

  const candidateElements =
    firstElement.tagName === 'tree'
      ? firstElement.children.filter(isImportedTreeNodeElement)
      : rootElements.filter(isImportedTreeNodeElement);

  if (candidateElements.length === 0) {
    throw new Error('XML content does not contain recognizable tree nodes');
  }

  const annotations: TreeAnnotationMap = {};

  if (candidateElements.length === 1) {
    return {
      tree: normalizeImportedMarkupTreeElement(
        candidateElements[0]!,
        fallbackRootName,
        '',
        annotations
      ),
      annotations,
    };
  }

  return {
    tree: {
      name: fallbackRootName,
      path: fallbackRootName,
      kind: 'directory',
      children: candidateElements.map(element =>
        normalizeImportedMarkupTreeElement(
          element,
          fallbackRootName,
          fallbackRootName,
          annotations
        )
      ),
    },
    annotations,
  };
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
    throw new Error('HTML content does not contain a recognizable tree');
  }

  return parseImportedAsciiTreeText(plainText, fallbackRootName, options);
}

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
        throw new Error(
          `Line ${line.lineNumber} is not a valid Markdown list item`
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
      };
    });

  return buildImportedTreeFromEntries(
    normalizeIndentLevels(entries),
    fallbackRootName
  );
}

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
    throw new Error('Imported content is empty');
  }

  return buildImportedTreeFromEntries(
    lines.map(line => parseAsciiTreeLine(line, options)),
    fallbackRootName
  );
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
    } catch {
      // Continue scanning later candidates
    }
  }

  return parseImportedTreeText(rawText, fallbackRootName, options);
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
 * @returns Normalized file node
 */
function normalizeImportedMarkupTreeElement(
  element: ParsedMarkupElement,
  fallbackRootName: string,
  parentPath: string,
  annotations: TreeAnnotationMap
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
  const node: FileNode = {
    name,
    path: parentPath ? buildFileTreeChildPath(parentPath, name) : name,
    kind,
  };
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
    node.children = element.children
      .filter(isImportedTreeNodeElement)
      .map(child =>
        normalizeImportedMarkupTreeElement(
          child,
          fallbackRootName,
          node.path,
          annotations
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

/**
 * Builds a file tree from leveled tree entries
 * @param entries Leveled entries describing nodes and indentation
 * @param fallbackRootName Root name used when the entries lack one
 * @returns Parsed tree and extracted annotations
 */
function buildImportedTreeFromEntries(
  entries: ImportedTreeEntry[],
  fallbackRootName: string
): ParsedImportedTree {
  if (entries.length === 0) {
    throw new Error('Imported content does not contain parseable tree nodes');
  }

  const normalizedEntries = promoteSingleTopLevelEntry(
    entries,
    fallbackRootName
  );
  const rootEntry = normalizedEntries[0];
  const rootName = sanitizeNodeName(
    rootEntry?.label ?? fallbackRootName,
    fallbackRootName
  );
  const root: FileNode = {
    name: rootName,
    path: rootName,
    kind: 'directory',
    children: [],
  };
  const annotations: TreeAnnotationMap = {};
  const stack: Array<{ level: number; node: FileNode }> = [
    { level: -1, node: root },
  ];

  appendImportedTreeAnnotation(
    annotations,
    root.path,
    rootEntry?.comment ?? null
  );

  normalizedEntries.slice(1).forEach((entry, index, childEntries) => {
    while (stack.length > 1 && stack[stack.length - 1]!.level >= entry.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!.node;
    const nextEntry = childEntries[index + 1];
    const name = sanitizeNodeName(entry.label, fallbackRootName);
    const kind: FileNode['kind'] =
      entry.label.endsWith('/') || (nextEntry && nextEntry.level > entry.level)
        ? 'directory'
        : isLikelyFileName(name)
          ? 'file'
          : 'directory';
    const node: FileNode = {
      name,
      path: buildFileTreeChildPath(parent.path, name),
      kind,
    };

    if (kind === 'directory') {
      node.children = [];
    }

    parent.children ??= [];
    parent.children.push(node);
    appendImportedTreeAnnotation(annotations, node.path, entry.comment);

    if (kind === 'directory') {
      stack.push({ level: entry.level, node });
    }
  });

  return { tree: root, annotations };
}

/**
 * Promotes a single top-level entry to the root, or synthesizes a root
 * @param entries Leveled tree entries
 * @param fallbackRootName Root name used when synthesizing a root
 * @returns Entries arranged so the first entry is the root
 */
function promoteSingleTopLevelEntry(
  entries: ImportedTreeEntry[],
  fallbackRootName: string
): ImportedTreeEntry[] {
  const topLevelEntries = entries.filter(entry => entry.level === 0);

  if (topLevelEntries.length !== 1) {
    return [
      { label: fallbackRootName, level: -1, comment: null },
      ...entries.map(entry => ({ ...entry, level: entry.level + 1 })),
    ];
  }

  const [firstEntry, ...restEntries] = entries;

  if (!firstEntry) {
    return [];
  }

  return [
    { ...firstEntry, level: -1 },
    ...restEntries.map(entry => ({
      ...entry,
      level: Math.max(0, entry.level - 1),
    })),
  ];
}

/**
 * Converts raw indentation widths into contiguous zero-based levels
 * @param entries Entries whose levels reflect raw indentation
 * @returns Entries with normalized nesting levels
 */
function normalizeIndentLevels(
  entries: ImportedTreeEntry[]
): ImportedTreeEntry[] {
  const indentStack: number[] = [];

  return entries.map(entry => {
    while (
      indentStack.length > 0 &&
      entry.level < indentStack[indentStack.length - 1]!
    ) {
      indentStack.pop();
    }

    if (
      indentStack.length === 0 ||
      entry.level > indentStack[indentStack.length - 1]!
    ) {
      indentStack.push(entry.level);
    }

    return {
      ...entry,
      level: indentStack.length - 1,
    };
  });
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
 * Splits a label from a trailing annotation comment
 * @param line Line text that may contain a comment suffix
 * @param commentTemplate Optional template used to recognize comments
 * @returns Label text and the extracted comment, if any
 */
function extractImportedTreeComment(
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
 * Normalizes a raw JSON value into a file node and collects annotations
 * @param value Raw JSON node value
 * @param fallbackRootName Root name used when the node omits one
 * @param parentPath Path of the parent node
 * @param annotations Annotation map updated with extracted comments
 * @returns Normalized file node
 */
function normalizeImportedJsonNode(
  value: unknown,
  fallbackRootName: string,
  parentPath: string,
  annotations: TreeAnnotationMap
): FileNode {
  if (!isRecordValue(value)) {
    throw new Error('JSON tree nodes must be objects');
  }

  const importedNode = value as ImportedJsonNode;
  const rawName =
    getOptionalStringField(importedNode, ['name', 'label', 'path']) ??
    fallbackRootName;
  const name = sanitizeNodeName(rawName, fallbackRootName);
  const rawChildren = getOptionalArrayField(importedNode, [
    'contents',
    'children',
  ]);
  const rawKind =
    getOptionalStringField(importedNode, ['type', 'kind'])?.toLowerCase() ?? '';
  const kind: FileNode['kind'] =
    rawKind === 'directory' || rawKind === 'dir' || rawChildren !== undefined
      ? 'directory'
      : 'file';
  const node: FileNode = {
    name,
    path: parentPath ? buildFileTreeChildPath(parentPath, name) : name,
    kind,
  };

  if (typeof importedNode.size === 'number') {
    node.size = importedNode.size;
  }

  if (typeof importedNode.lastModified === 'number') {
    node.lastModified = importedNode.lastModified;
  }

  if (typeof importedNode.mimeType === 'string') {
    node.mimeType = importedNode.mimeType;
  }

  appendImportedTreeAnnotation(
    annotations,
    node.path,
    getOptionalStringField(importedNode, ['comment', 'annotation']) ?? null
  );

  if (kind === 'directory') {
    node.children = (rawChildren ?? []).map(child =>
      normalizeImportedJsonNode(child, fallbackRootName, node.path, annotations)
    );
  }

  return node;
}

/**
 * Adds a manual annotation when imported comment text is non-empty
 * @param annotations Annotation map keyed by tree path
 * @param path Tree path receiving the annotation
 * @param comment Imported comment text
 */
function appendImportedTreeAnnotation(
  annotations: TreeAnnotationMap,
  path: string,
  comment: string | null
): void {
  if (!comment?.trim()) {
    return;
  }

  annotations[path] = {
    path,
    comment: comment.trim(),
    source: 'manual',
    syncStatus: 'local',
    updatedAt: Date.now(),
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
 * Measures indentation width with tabs normalized to two spaces
 * @param value Leading indentation text
 * @returns Indentation width used for Markdown list levels
 */
function getIndentWidth(value: string): number {
  return value.replace(/\t/gu, '  ').length;
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

/**
 * Heuristically determines whether a label looks like a file name
 * @param name Sanitized node name
 * @returns True when the name has a file-like extension or dot prefix
 */
function isLikelyFileName(name: string): boolean {
  return name.startsWith('.') || /\.[^./]+$/u.test(name);
}

/**
 * Cleans a raw node label into a safe single-segment name
 * @param value Raw label or path text
 * @param fallbackRootName Name used when sanitizing yields an empty string
 * @returns Sanitized node name
 */
function sanitizeNodeName(value: string, fallbackRootName: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/\/+$/u, '');
  const segments = normalizedValue.split('/').filter(Boolean);
  const candidate = segments.at(-1) ?? normalizedValue;

  return candidate.replace(/[\\/:*?"<>|]/gu, '').trim() || fallbackRootName;
}

/**
 * Returns the first string field found on a record
 * @param value Record to inspect
 * @param keys Candidate field names in priority order
 * @returns String field value, or undefined when none match
 */
function getOptionalStringField(
  value: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === 'string') {
      return value[key];
    }
  }

  return undefined;
}

/**
 * Returns the first array field found on a record
 * @param value Record to inspect
 * @param keys Candidate field names in priority order
 * @returns Array field value, or undefined when none match
 */
function getOptionalArrayField(
  value: Record<string, unknown>,
  keys: string[]
): unknown[] | undefined {
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return undefined;
}

/**
 * Checks whether a value is a plain object-like record
 * @param value Value to test
 * @returns True when the value can be read as a record
 */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Escapes text for safe insertion into a regular expression
 * @param value Text to escape
 * @returns Escaped regular expression source
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
