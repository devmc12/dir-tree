import type { AsciiTreeLine, AsciiTreeOptions } from '../ascii/types';
import { ASCII_TREE_CONNECTOR_PRESETS } from '../ascii/types';
import type { FileNode } from '../reader/types';
import { FileTreeError } from '../reader/errors';
import { parseImportedTreeText } from './imported';
import { extractImportedTreeComment } from './comments';
import {
  buildImportedTreeFromEntries,
  type ImportedTreeEntry,
} from './entries';
import type { ParsedImportedTree } from './types';

/**
 * Date: 2026-11-14
 * Desc: Parses edited rendered tree text using its original display baseline
 */

export interface EditedAsciiTreeParseOptions {
  lines?: readonly AsciiTreeLine[];
  syntax?: Pick<
    AsciiTreeOptions,
    'indentationStyle' | 'connectorParts' | 'connectorStyle'
  >;
  commentTemplate?: string;
}

export interface ParsedEditedAsciiTree extends ParsedImportedTree {
  /** Baseline paths whose displayed name and hierarchy matched exactly */
  matchedPaths: Set<string>;
}

interface RenderedLabel {
  line: AsciiTreeLine;
  paths: string[];
  ambiguous: boolean;
}

/**
 * Removes only display decorations evidenced by the original rendered lines
 * @param text Edited text, including comments and structural changes
 * @param root Original rendered root name and path, independent of host project state
 * @param options Original rendered lines, syntax, and comment template
 * @returns Parsed tree, annotations and paths that still match the baseline
 * @throws FileTreeError with a line number when an opaque custom label cannot be reversed
 */
export function parseEditedAsciiTree(
  text: string,
  root: Pick<FileNode, 'name' | 'path'>,
  options: EditedAsciiTreeParseOptions = {}
): ParsedEditedAsciiTree {
  if (!options.lines) {
    return {
      ...parseImportedTreeText(text, root.name, {
        format: 'ascii',
        ...(options.commentTemplate === undefined
          ? {}
          : { commentTemplate: options.commentTemplate }),
      }),
      matchedPaths: new Set(),
    };
  }
  // Strip generated line numbers only when the baseline provides evidence for them
  const numbered =
    options.lines?.some(
      line =>
        /^\s*\d+\s\|\s/u.test(line.text) &&
        normalizeDraftPrefix(line.text, options.syntax, true).includes(
          line.node.name
        )
    ) ?? false;
  const byLabel = new Map<string, RenderedLabel>();
  // Index literal decorations independently of depth; moved rows keep their display metadata
  const decorations = new Map<string, Set<string>>();
  let hasOpaqueLabels = false;
  for (const line of options.lines) {
    const { label } = splitNormalizedLine(
      normalizeDraftPrefix(line.text, options.syntax, numbered)
    );
    const matching = byLabel.get(label) ?? {
      line,
      paths: [],
      ambiguous: false,
    };
    matching.paths.push(line.path);
    matching.ambiguous ||= matching.line.node.name !== line.node.name;
    byLabel.set(label, matching);
    if (line.isSynthetic) continue;
    const nameAt = label.lastIndexOf(line.node.name);
    if (nameAt < 0) {
      hasOpaqueLabels = true;
      continue;
    }
    const before = label.slice(0, nameAt);
    const after = label.slice(nameAt + line.node.name.length);
    if (!before && (!after || after === '/')) continue;
    const suffixes = decorations.get(before) ?? new Set<string>();
    suffixes.add(after);
    decorations.set(before, suffixes);
  }
  const syntheticRoot = options.lines.some(
    line => line.isSynthetic && line.isRoot
  );
  const matchedPaths = new Set<string>();
  const matchedLabels = new Set<string>();
  const entries: ImportedTreeEntry[] = [];
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const { label, level } = splitNormalizedLine(
      normalizeDraftPrefix(raw, options.syntax, numbered)
    );
    if (!label.trim()) continue;
    let matched: RenderedLabel | undefined;
    let recognizedLabel = '';
    let comment: string | null = null;
    // Match the longest label followed only by whitespace or a recognizable annotation
    for (let end = label.length; end > 0; end--) {
      if (end < label.length && !/\s/u.test(label[end]!)) continue;
      const prefix = label.slice(0, end);
      const found = byLabel.get(prefix);
      if (!found) continue;
      const suffix = extractImportedTreeComment(
        'node' + label.slice(end),
        options.commentTemplate
      );
      if (suffix.text.trim() !== 'node') continue;
      matched = found;
      recognizedLabel = prefix;
      comment = suffix.comment;
      break;
    }
    const candidate = matched?.line;
    if (candidate?.isSynthetic) continue;
    let nodeLabel: string;
    let name: string;
    if (candidate) {
      if (matched!.ambiguous) {
        throw new FileTreeError(
          'invalid_tree',
          'Rendered label identifies more than one node name',
          { line: index + 1 }
        );
      }
      if (!matchedLabels.has(recognizedLabel)) {
        for (const path of matched!.paths) matchedPaths.add(path);
        matchedLabels.add(recognizedLabel);
      }
      name = candidate.node.name;
      nodeLabel = name + (candidate.node.kind === 'directory' ? '/' : '');
    } else {
      if (/^(?:```[\w-]*|[\s│|]+)$/u.test(label.trim())) continue;
      if (hasOpaqueLabels) {
        throw new FileTreeError(
          'invalid_tree',
          'Cannot reverse an edited custom node label without a recognizable filename',
          { line: index + 1 }
        );
      }
      const extracted = extractImportedTreeComment(
        label,
        options.commentTemplate
      );
      nodeLabel = removeRenderedDecoration(
        extracted.text.trimEnd(),
        decorations
      );
      name = nodeLabel.replace(/\/+$/u, '').trim();
      comment = extracted.comment;
    }
    entries.push({
      name,
      label: nodeLabel,
      comment,
      level: level - (syntheticRoot ? 1 : 0),
      line: index + 1,
    });
  }
  if (!options.lines.some(line => line.path === root.path)) {
    entries.unshift({
      name: root.name,
      label: root.name + '/',
      comment: null,
      level: 0,
    });
  }
  const parsed = buildImportedTreeFromEntries(entries, root.name);
  const originals = new Map(
    (options.lines ?? []).map(line => [line.path, line.node])
  );
  const parent = root.path.includes('/')
    ? root.path.slice(0, root.path.lastIndexOf('/') + 1)
    : '';
  const retainedPaths = new Set<string>();
  // Preserve exact baseline kinds, including extensionless files and empty directories
  function retainKnownKind(node: FileNode): FileNode {
    const original = originals.get(parent + node.path);
    if (matchedPaths.has(parent + node.path))
      retainedPaths.add(parent + node.path);
    const kind =
      matchedPaths.has(parent + node.path) && original && !node.children?.length
        ? original.kind
        : node.kind;
    const result: FileNode = { ...node, kind };
    if (kind === 'directory')
      result.children = (node.children ?? []).map(retainKnownKind);
    else delete result.children;
    return result;
  }
  const tree = retainKnownKind(parsed.tree);
  return { ...parsed, tree, matchedPaths: retainedPaths };
}

/** Splits only the canonical leading connector, never connector-like text inside a name */
function splitNormalizedLine(text: string): { label: string; level: number } {
  const prefix = text.match(/^(?: {4})*(?:├── )?/u)![0];
  return { label: text.slice(prefix.length), level: prefix.length / 4 };
}

/** Finds evidenced literal decorations by label length rather than scanning every baseline node */
function removeRenderedDecoration(
  label: string,
  decorations: Map<string, Set<string>>
): string {
  for (let start = label.length - 1; start >= 0; start--) {
    const suffixes = decorations.get(label.slice(0, start));
    if (!suffixes) continue;
    for (let end = start + 1; end <= label.length; end++) {
      const suffix = label.slice(end);
      if (suffixes.has(suffix))
        return label.slice(start, end) + (suffix.startsWith('/') ? '/' : '');
    }
  }
  return label;
}

/** Normalizes rendered connectors and indentation without reading current UI settings */
function normalizeDraftPrefix(
  raw: string,
  syntax: EditedAsciiTreeParseOptions['syntax'],
  numbered: boolean
): string {
  let text = numbered ? raw.replace(/^\s*\d+\s\|\s/u, '') : raw;
  const parts = {
    ...ASCII_TREE_CONNECTOR_PRESETS[syntax?.connectorStyle ?? 'unicode'],
    ...syntax?.connectorParts,
  };
  const indentation = syntax?.indentationStyle ?? 'spaces-4';
  const narrow = indentation === 'spaces-2';
  const indent = narrow
    ? '  '
    : indentation === 'tab-1'
      ? '\t'
      : indentation === 'tab-2'
        ? '\t\t'
        : '    ';
  const vertical =
    (parts.vertical?.[0] ?? '│') +
    (narrow ? ' ' : indentation === 'spaces-4' ? '   ' : indent);
  let depth = 0;
  while (text.startsWith(vertical) || text.startsWith(indent)) {
    text = text.slice(
      text.startsWith(vertical) ? vertical.length : indent.length
    );
    depth++;
  }
  const horizontal = (parts.horizontal?.[0] ?? '─').repeat(narrow ? 1 : 2);
  const branch = [parts.branch, parts.lastBranch, parts.vertical]
    .map(part => (part?.[0] ?? '') + horizontal + ' ')
    .find(prefix => text.startsWith(prefix));
  return branch
    ? '    '.repeat(depth) + '├── ' + text.slice(branch.length)
    : numbered
      ? raw.replace(/^\s*\d+\s\|\s/u, '')
      : raw;
}
