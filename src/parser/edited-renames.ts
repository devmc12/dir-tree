import type { AsciiTreeLine } from '../ascii/types';
import type { FileNode } from '../reader/types';

/**
 * Date: 2026-11-15
 * Desc: Recognizes conservative same-parent renames against a rendered baseline
 */

export interface EditedAsciiTreeRename {
  /** Original full baseline path */
  fromPath: string;
  /** Edited full path in the same baseline scope */
  toPath: string;
}

interface BaselineNode {
  node: Pick<FileNode, 'name' | 'path' | 'kind'>;
  children: BaselineNode[];
}

/**
 * Pairs unchanged nodes and unambiguous renames without guessing moves or host state
 * @param knownKinds Explicit slash or baseline evidence; null means a shared label of differing kinds
 * @returns Rename roots and baseline kinds for the parsed tree
 */
export function detectEditedRenames(
  tree: FileNode,
  root: Pick<FileNode, 'name' | 'path'>,
  lines: readonly AsciiTreeLine[],
  knownKinds: ReadonlyMap<string, FileNode['kind'] | null>,
  allowRootRename: boolean
): { renames: EditedAsciiTreeRename[]; kinds: Map<string, FileNode['kind']> } {
  const nodes = new Map<string, BaselineNode>();
  nodes.set(root.path, { node: { ...root, kind: 'directory' }, children: [] });
  for (const line of lines) {
    if (!line.isSynthetic)
      nodes.set(line.path, { node: line.node, children: [] });
  }
  for (const [path, node] of nodes) {
    if (path === root.path) continue;
    nodes.get(path.slice(0, path.lastIndexOf('/')))?.children.push(node);
  }
  const base = nodes.get(root.path)!;
  const parent = root.path.slice(0, root.path.length - root.name.length);
  const renames: EditedAsciiTreeRename[] = [];
  const kinds = new Map<string, FileNode['kind']>();
  const kindOf = (node: FileNode): FileNode['kind'] | undefined =>
    node.children?.length
      ? 'directory'
      : knownKinds.has(node.path)
        ? (knownKinds.get(node.path) ?? undefined)
        : node.kind === 'file'
          ? node.kind
          : undefined;
  const compatible = (old: BaselineNode, next: FileNode): boolean =>
    kindOf(next) === undefined || kindOf(next) === old.node.kind;

  // Folder renames require the same visible descendants; comments are deliberately ignored
  const sameChildren = (old: BaselineNode, next: FileNode): boolean => {
    const children = next.children ?? [];
    return (
      old.children.length === children.length &&
      old.children.every((child, index) => {
        const candidate = children[index]!;
        return (
          child.node.name === candidate.name &&
          compatible(child, candidate) &&
          sameChildren(child, candidate)
        );
      })
    );
  };
  const visit = (old: BaselineNode, next: FileNode): void => {
    kinds.set(next.path, old.node.kind);
    if (old.node.name !== next.name)
      renames.push({ fromPath: old.node.path, toPath: parent + next.path });
    const children = next.children ?? [];
    const byName = new Map(old.children.map(child => [child.node.name, child]));
    const matched = new Set<BaselineNode>();
    const unmatched: FileNode[] = [];
    for (const child of children) {
      const previous = byName.get(child.name);
      if (previous && compatible(previous, child)) {
        matched.add(previous);
        visit(previous, child);
      } else unmatched.push(child);
    }
    const missing = old.children.filter(child => !matched.has(child));
    if (missing.length !== 1 || unmatched.length !== 1) return;
    const before = missing[0]!;
    const after = unmatched[0]!;
    if (before.node.name === after.name || !compatible(before, after)) return;
    // Every retained sibling must still occupy the same position around the candidate
    if (
      old.children.length !== children.length ||
      !old.children.every((child, index) =>
        child === before
          ? children[index] === after
          : child.node.name === children[index]!.name
      )
    )
      return;
    if (!sameChildren(before, after)) return;
    visit(before, after);
  };
  if (
    (base.node.name === tree.name || allowRootRename) &&
    compatible(base, tree)
  )
    visit(base, tree);
  return { renames, kinds };
}
