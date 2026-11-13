import type { AsciiTreeLine, AsciiTreeOptions } from '../ascii/types';
import { ASCII_TREE_CONNECTOR_PRESETS } from '../ascii/types';
import type { FileNode } from '../reader/types';
import { FileTreeError } from '../reader/errors';
import { parseImportedTreeText } from './imported';
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
  // Strip generated line numbers only when the baseline provides evidence for them
  const numbered =
    options.lines?.some(
      line =>
        /^\s*\d+\s\|\s/u.test(line.text) &&
        !line.text.startsWith(line.node.name)
    ) ?? false;
  const normalize = (text: string, knownPaths: Set<string>): string => {
    const lines = (options.lines ?? [])
      .map(line => ({
        line,
        prefix: normalizeDraftPrefix(line.text, options.syntax, numbered),
      }))
      .sort((a, b) => b.prefix.length - a.prefix.length);
    const byPrefix = new Map<string, (typeof lines)[number]>();
    const pathsByPrefix = new Map<string, string[]>();
    for (const entry of lines) {
      const { line, prefix } = entry;
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, entry);
      const paths = pathsByPrefix.get(prefix) ?? [];
      paths.push(line.path);
      pathsByPrefix.set(prefix, paths);
    }
    const decorations = lines.flatMap(({ line, prefix }) => {
      if (line.isSynthetic) return [];
      const nameAt = prefix.lastIndexOf(line.node.name);
      if (nameAt < 0) return [];
      const treePrefix = prefix.match(/^(?: {4})*(?:├── )?/u)?.[0] ?? '';
      const before = prefix.slice(treePrefix.length, nameAt);
      const after = prefix.slice(nameAt + line.node.name.length);
      if (!before && (!after || after === '/')) return [];
      const escape = (value: string) =>
        value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return [
        {
          pattern: new RegExp(
            `^${escape(treePrefix + before)}(.+?)${escape(after)}(?=\\s|$)(.*)$`,
            'u'
          ),
          treePrefix,
          slash: after.startsWith('/') ? '/' : '',
        },
      ];
    });
    const hasOpaqueLabels = lines.some(
      ({ line, prefix }) =>
        !line.isSynthetic && !prefix.includes(line.node.name)
    );
    const syntheticRoot = options.lines?.some(
      line => line.isSynthetic && line.isRoot
    );
    const matchedPrefixes = new Set<string>();
    const scopeDepth = root.path.split('/').length;
    const normalizedLines = text.split(/\r?\n/u).map((raw, index) => {
      const normalized = normalizeDraftPrefix(raw, options.syntax, numbered);
      let candidate = byPrefix.get(normalized);
      // Match the longest baseline prefix without scanning every node for every line
      for (let end = normalized.length - 1; !candidate && end >= 0; end--) {
        if (/\s/u.test(normalized[end]!))
          candidate = byPrefix.get(normalized.slice(0, end));
      }
      if (!candidate) {
        if (normalized.trim() && hasOpaqueLabels) {
          throw new FileTreeError(
            'invalid_tree',
            'Cannot reverse an edited custom node label without a recognizable filename',
            { line: index + 1 }
          );
        }
        const decoration = decorations.find(item =>
          item.pattern.test(normalized)
        );
        const match = decoration?.pattern.exec(normalized);
        const undecorated =
          decoration && match
            ? decoration.treePrefix + match[1] + decoration.slash + match[2]
            : normalized;
        if (syntheticRoot) {
          if (undecorated.startsWith('    ')) return undecorated.slice(4);
          if (undecorated.startsWith('├── ')) return undecorated.slice(4);
        }
        return undecorated;
      }
      const { line: match } = candidate;
      if (match.isSynthetic) return '';
      // Identical labels in separate folders share a prefix but not a node identity
      if (!matchedPrefixes.has(candidate.prefix)) {
        for (const path of pathsByPrefix.get(candidate.prefix)!)
          knownPaths.add(path);
        matchedPrefixes.add(candidate.prefix);
      }
      const depth = match.path.split('/').length - scopeDepth;
      const prefix =
        depth === 0 ? '' : '    '.repeat(Math.max(0, depth - 1)) + '├── ';
      return (
        prefix +
        match.node.name +
        (match.node.kind === 'directory' ? '/' : '') +
        normalized.slice(candidate.prefix.length)
      );
    });
    if (options.lines && !options.lines.some(line => line.path === root.path))
      normalizedLines.unshift(root.name + '/');
    return normalizedLines.join('\n');
  };
  const matchedPaths = new Set<string>();
  const parsed = parseImportedTreeText(
    normalize(text, matchedPaths),
    root.name,
    options.commentTemplate === undefined
      ? {}
      : { commentTemplate: options.commentTemplate }
  );
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
