import type { ReadOptions, SortBy, SortOrder } from './types';

/**
 * Date: 2026-06-07
 * Desc: Normalizes reader option configuration into public read options
 */

export interface ReadOptionsConfig {
  concurrency?: ReadOptions['concurrency'];
  concurrencyEnabled?: boolean;
  concurrencyLimit?: number;
  depth?: number;
  exclude?: string[];
  excludePatterns?: string;
  foldersFirst?: boolean;
  mode?: ReadOptions['mode'];
  readFileMeta?: boolean;
  showHidden?: boolean;
  sort?: ReadOptions['sort'];
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  useGitignore?: boolean;
}

/**
 * Converts UI, CLI, or persisted reader configuration into ReadOptions
 * @param config Reader configuration values from a host application
 * @returns Normalized read options without host-specific state
 */
export function createReadOptionsFromConfig(
  config: ReadOptionsConfig
): ReadOptions {
  const options: ReadOptions = {};

  if (config.depth !== undefined) {
    options.depth = config.depth;
  }

  if (config.showHidden !== undefined) {
    options.showHidden = config.showHidden;
  }

  if (config.useGitignore !== undefined) {
    options.useGitignore = config.useGitignore;
  }

  if (config.readFileMeta !== undefined) {
    options.readFileMeta = config.readFileMeta;
  }

  if (config.mode !== undefined) {
    options.mode = config.mode;
  }

  const exclude = normalizeExcludePatterns(config);

  if (exclude.length > 0) {
    options.exclude = exclude;
  }

  const concurrency = normalizeConcurrency(config);

  if (concurrency !== undefined) {
    options.concurrency = concurrency;
  }

  const sort = normalizeSortOptions(config);

  if (sort !== undefined) {
    options.sort = sort;
  }

  return options;
}

/**
 * Normalizes exclude patterns from array or multiline text
 * @param config Reader config that may contain exclude fields
 * @returns Trimmed non-empty exclude patterns
 */
function normalizeExcludePatterns(config: ReadOptionsConfig): string[] {
  if (config.exclude) {
    return config.exclude.map(pattern => pattern.trim()).filter(Boolean);
  }

  if (config.excludePatterns === undefined) {
    return [];
  }

  return config.excludePatterns
    .split('\n')
    .map(pattern => pattern.trim())
    .filter(Boolean);
}

/**
 * Resolves concurrency options from explicit or legacy config fields
 * @param config Reader config with concurrency settings
 * @returns ReadOptions concurrency value or undefined
 */
function normalizeConcurrency(
  config: ReadOptionsConfig
): ReadOptions['concurrency'] | undefined {
  if (config.concurrency !== undefined) {
    return config.concurrency;
  }

  if (config.concurrencyEnabled === undefined) {
    return undefined;
  }

  if (!config.concurrencyEnabled) {
    return false;
  }

  if (config.concurrencyLimit === undefined) {
    return true;
  }

  return { limit: config.concurrencyLimit };
}

/**
 * Resolves sort options from explicit or split config fields
 * @param config Reader config with sort settings
 * @returns Sort options or undefined when sorting was not configured
 */
function normalizeSortOptions(
  config: ReadOptionsConfig
): ReadOptions['sort'] | undefined {
  if (config.sort) {
    return config.sort;
  }

  if (
    config.sortBy === undefined &&
    config.sortOrder === undefined &&
    config.foldersFirst === undefined
  ) {
    return undefined;
  }

  return {
    sortBy: config.sortBy ?? 'name',
    order: config.sortOrder ?? 'asc',
    foldersFirst: config.foldersFirst ?? true,
  };
}
