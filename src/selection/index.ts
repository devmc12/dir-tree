/**
 * Date: 2026-06-07
 * Desc: Provides a pure cascading tree selection model
 */

export type TreeSelectionState = 'checked' | 'indeterminate' | 'unchecked';

export interface TreeSelectionItem {
  id: string;
  children?: string[];
}

export interface TreeSelectionData {
  rootId: string;
  items: Record<string, TreeSelectionItem>;
  selectableIds?: Set<string>;
}

export interface TreeSelectionModel {
  selectedIds: string[];
  selectedIdSet: Set<string>;
  selectionStateById: Record<string, TreeSelectionState>;
}

/**
 * Builds a normalized cascading selection model from selected ids
 * @param data Tree selection data with root, items, and selectable ids
 * @param selectedIds Requested selected item ids
 * @returns Normalized selected ids, selected id set, and state by id
 */
export function createTreeSelectionModel(
  data: TreeSelectionData,
  selectedIds: string[]
): TreeSelectionModel {
  const normalizedSelectedIds = normalizeTreeSelectedIds(data, selectedIds);
  const selectedIdSet = new Set(normalizedSelectedIds);

  return {
    selectedIds: normalizedSelectedIds,
    selectedIdSet,
    selectionStateById: createSelectionStateById(data, selectedIdSet),
  };
}

/**
 * Toggles an item and its selectable descendants in a cascading model
 * @param data Tree selection data with root, items, and selectable ids
 * @param selectedIds Current selected item ids
 * @param itemId Item id to toggle
 * @returns Normalized selected ids after the toggle
 */
export function toggleTreeSelection(
  data: TreeSelectionData,
  selectedIds: string[],
  itemId: string
): string[] {
  if (!isSelectableTreeItem(data, itemId)) {
    return selectedIds;
  }

  const currentModel = createTreeSelectionModel(data, selectedIds);
  const nextSelectedIdSet = new Set(currentModel.selectedIds);
  const targetIds = getTreeItemIdsWithDescendants(data, [itemId]);
  const shouldUncheck = currentModel.selectionStateById[itemId] === 'checked';

  targetIds.forEach(targetId => {
    if (shouldUncheck) {
      nextSelectedIdSet.delete(targetId);
      return;
    }

    nextSelectedIdSet.add(targetId);
  });

  if (shouldUncheck) {
    getTreeAncestorIds(data, itemId).forEach(ancestorId => {
      nextSelectedIdSet.delete(ancestorId);
    });
  }

  return normalizeTreeSelectedIds(data, Array.from(nextSelectedIdSet));
}

/**
 * Expands and filters selected ids into canonical tree order
 * @param data Tree selection data with root, items, and selectable ids
 * @param selectedIds Selected ids that may include parent nodes
 * @returns Canonical checked ids in tree order
 */
export function normalizeTreeSelectedIds(
  data: TreeSelectionData,
  selectedIds: string[]
): string[] {
  const expandedSelectedIdSet = new Set(
    getTreeItemIdsWithDescendants(
      data,
      selectedIds.filter(id => isSelectableTreeItem(data, id))
    )
  );
  const selectionStateById = createSelectionStateById(
    data,
    expandedSelectedIdSet
  );

  return collectTreeItemIds(data).filter(
    id => selectionStateById[id] === 'checked'
  );
}

/**
 * Collects selectable item ids plus all selectable descendants
 * @param data Tree selection data with root, items, and selectable ids
 * @param itemIds Root item ids to expand
 * @returns Unique selectable ids in traversal order
 */
export function getTreeItemIdsWithDescendants(
  data: TreeSelectionData,
  itemIds: string[]
): string[] {
  const collectedIds: string[] = [];
  const stack = [...itemIds].reverse();

  while (stack.length > 0) {
    const itemId = stack.pop();

    if (!itemId || !isSelectableTreeItem(data, itemId)) {
      continue;
    }

    collectedIds.push(itemId);

    const children = data.items[itemId]?.children ?? [];

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return Array.from(new Set(collectedIds));
}

/**
 * Computes checked, unchecked, and indeterminate state for every item
 * @param data Tree selection data with root, items, and selectable ids
 * @param selectedIdSet Set of ids considered selected
 * @returns Selection state keyed by item id
 */
function createSelectionStateById(
  data: TreeSelectionData,
  selectedIdSet: Set<string>
): Record<string, TreeSelectionState> {
  const selectionStateById: Record<string, TreeSelectionState> = {};

  /**
   * Resolves one item state after recursively resolving child states
   * @param itemId Item id to resolve
   * @returns Computed selection state for the item
   */
  function resolveSelectionState(itemId: string): TreeSelectionState {
    const item = data.items[itemId];

    if (!item) {
      return 'unchecked';
    }

    const childStates = (item.children ?? []).map(resolveSelectionState);

    if (itemId === data.rootId) {
      return childStates.every(childState => childState === 'checked')
        ? 'checked'
        : childStates.some(childState => childState !== 'unchecked')
          ? 'indeterminate'
          : 'unchecked';
    }

    if (childStates.length === 0) {
      const leafState = selectedIdSet.has(itemId) ? 'checked' : 'unchecked';

      selectionStateById[itemId] = leafState;
      return leafState;
    }

    const areAllChildrenChecked = childStates.every(
      childState => childState === 'checked'
    );
    const hasCheckedChild = childStates.some(
      childState => childState !== 'unchecked'
    );
    const selectionState = areAllChildrenChecked
      ? 'checked'
      : selectedIdSet.has(itemId) || hasCheckedChild
        ? 'indeterminate'
        : 'unchecked';

    selectionStateById[itemId] = selectionState;
    return selectionState;
  }

  resolveSelectionState(data.rootId);

  return selectionStateById;
}

/**
 * Collects all selectable item ids in tree order
 * @param data Tree selection data with root, items, and selectable ids
 * @returns Selectable ids in depth-first order
 */
function collectTreeItemIds(data: TreeSelectionData): string[] {
  const itemIds: string[] = [];
  const stack = [data.rootId];

  while (stack.length > 0) {
    const itemId = stack.pop();

    if (!itemId) {
      continue;
    }

    const item = data.items[itemId];

    if (!item) {
      continue;
    }

    if (isSelectableTreeItem(data, itemId)) {
      itemIds.push(itemId);
    }

    const children = item.children ?? [];

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!);
    }
  }

  return itemIds;
}

/**
 * Finds ancestor ids from the root to the target item
 * @param data Tree selection data with root and items
 * @param targetId Target item id
 * @returns Ancestor ids excluding the root and target
 */
function getTreeAncestorIds(
  data: TreeSelectionData,
  targetId: string
): string[] {
  const stack: Array<{ ancestorIds: string[]; itemId: string }> = [
    { itemId: data.rootId, ancestorIds: [] },
  ];

  while (stack.length > 0) {
    const { ancestorIds, itemId } = stack.pop()!;
    const item = data.items[itemId];

    if (!item) {
      continue;
    }

    if (itemId === targetId) {
      return ancestorIds;
    }

    const nextAncestorIds =
      itemId === data.rootId ? ancestorIds : [...ancestorIds, itemId];

    (item.children ?? []).forEach(childId => {
      stack.push({ itemId: childId, ancestorIds: nextAncestorIds });
    });
  }

  return [];
}

/**
 * Checks whether an item can participate in selection
 * @param data Tree selection data with optional selectable id set
 * @param itemId Item id to test
 * @returns True when the item exists, is not the root, and is selectable
 */
function isSelectableTreeItem(
  data: TreeSelectionData,
  itemId: string
): boolean {
  if (itemId === data.rootId) {
    return false;
  }

  if (!data.items[itemId]) {
    return false;
  }

  return data.selectableIds ? data.selectableIds.has(itemId) : true;
}
