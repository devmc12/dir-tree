import type { ReaderAdapter } from './IFileSystemAdapter';
import type {
  FileNode,
  GitignoreRule,
  ReadOptions,
  ReadWarning,
} from '../reader/types';
import { hasErrorName } from '../reader/errors';
import {
  getParentPath,
  isPathExcluded,
  parseGitignore,
  runConcurrent,
} from '../reader/utils';

/**
 * Date: 2026-06-07
 * Desc: Provides shared read option handling for file system adapters
 */

type OptionalReadOptions = Pick<ReadOptions, 'sort' | 'onWarning'>;
type EffectiveReadOptions = Required<
  Omit<ReadOptions, keyof OptionalReadOptions>
> &
  OptionalReadOptions;

export interface ReadContext {
  options: EffectiveReadOptions;
  gitignoreRules: Map<string, GitignoreRule[]>;
}

/**
 * Resolves options without retaining mutable configuration supplied by the caller
 * @param overrides Options supplied for this read or adapter construction
 * @param defaults Defaults to use for fields absent from the overrides
 * @returns Independent effective options for the operation
 */
function resolveReadOptions(
  overrides: ReadOptions,
  defaults: ReadOptions = {}
): EffectiveReadOptions {
  const sort = overrides.sort ?? defaults.sort;
  const concurrency = overrides.concurrency ?? defaults.concurrency ?? false;
  const onWarning = overrides.onWarning ?? defaults.onWarning;

  return {
    depth: overrides.depth ?? defaults.depth ?? Infinity,
    exclude: [...(overrides.exclude ?? defaults.exclude ?? [])],
    showHidden: overrides.showHidden ?? defaults.showHidden ?? false,
    useGitignore: overrides.useGitignore ?? defaults.useGitignore ?? true,
    readFileMeta: overrides.readFileMeta ?? defaults.readFileMeta ?? false,
    mode: overrides.mode ?? defaults.mode ?? 'read',
    concurrency:
      typeof concurrency === 'object' ? { ...concurrency } : concurrency,
    ...(sort === undefined ? {} : { sort: { ...sort } }),
    ...(onWarning === undefined ? {} : { onWarning }),
  };
}

export abstract class BaseFileSystemAdapter implements ReaderAdapter {
  private readonly defaultOptions: EffectiveReadOptions;

  /**
   * Creates a base adapter with normalized read options
   * @param options Initial read options shared by adapter implementations
   */
  protected constructor(options: ReadOptions = {}) {
    this.defaultOptions = resolveReadOptions(options);
  }

  /**
   * Reads the adapter source into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree produced by the adapter
   */
  abstract read(options?: Partial<ReadOptions>): Promise<FileNode>;

  /**
   * Creates options and rule storage owned by a single read
   * @param options Overrides applied only to this read
   * @returns A context to pass to traversal and filtering helpers
   */
  protected createReadContext(options: Partial<ReadOptions> = {}): ReadContext {
    return {
      options: resolveReadOptions(options, this.defaultOptions),
      gitignoreRules: new Map(),
    };
  }

  /**
   * Reports an optional metadata failure without exposing the underlying error
   * @throws The original cancellation error, or an error thrown by the callback
   */
  protected reportMetadataFailure(
    context: ReadContext,
    source: ReadWarning['source'],
    path: string,
    error: unknown
  ): void {
    if (hasErrorName(error, 'AbortError')) {
      throw error;
    }

    context.options.onWarning?.({
      code: 'metadata_unavailable',
      operation: 'read_metadata',
      source,
      path,
    });
  }

  /**
   * Tests a tree path against configured exclude patterns
   * @param context Context of the current read
   * @param fullPath Tree path to test
   * @returns True when the path is excluded
   */
  protected isPathExcludedByPatterns(
    context: ReadContext,
    fullPath: string
  ): boolean {
    return isPathExcluded(fullPath, context.options.exclude);
  }

  /**
   * Parses and stores gitignore rules for a tree-relative directory
   * @param context Context of the current read
   * @param dirRelPath Directory path the rules are anchored to
   * @param content Raw gitignore file content
   */
  protected registerGitignoreRules(
    context: ReadContext,
    dirRelPath: string,
    content: string
  ): void {
    const rules = parseGitignore(content, dirRelPath);

    if (rules.length > 0) {
      context.gitignoreRules.set(dirRelPath, rules);
    }
  }

  /**
   * Tests a path against loaded gitignore rules from root to parent directory
   * @param context Context of the current read
   * @param filePath Tree path to test
   * @param parentDirPath Parent directory path used to collect scoped rules
   * @param kind Kind of the node being tested
   * @returns True when the path is ignored
   */
  protected isGitIgnored(
    context: ReadContext,
    filePath: string,
    parentDirPath = getParentPath(filePath),
    kind: FileNode['kind'] = 'file'
  ): boolean {
    const allRules: GitignoreRule[] = [];
    const rootRules = context.gitignoreRules.get('');

    if (rootRules) {
      allRules.push(...rootRules);
    }

    const parts = parentDirPath.split('/').filter(Boolean);
    let accumulatedPath = '';

    for (const part of parts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

      if (this.matchesGitignoreRules(accumulatedPath, 'directory', allRules)) {
        return true;
      }

      const rules = context.gitignoreRules.get(accumulatedPath);

      if (rules) {
        allRules.push(...rules);
      }
    }

    return this.matchesGitignoreRules(filePath, kind, allRules);
  }

  /**
   * Applies ordered ignore rules to one node without traversing its descendants
   * @param path Tree path to test
   * @param kind Node kind used for directory-only patterns
   * @param rules Applicable rules ordered from outer scopes to inner scopes
   * @returns True when the last matching rule excludes the node
   */
  private matchesGitignoreRules(
    path: string,
    kind: FileNode['kind'],
    rules: GitignoreRule[]
  ): boolean {
    let ignored = false;

    rules.forEach(rule => {
      if (
        (!rule.directoryOnly || kind === 'directory') &&
        rule.regex.test(path)
      ) {
        ignored = !rule.negate;
      }
    });

    return ignored;
  }

  /**
   * Runs read tasks sequentially or with the configured concurrency limit
   * @param context Context of the current read
   * @param tasks Task factories to execute
   * @returns Task results in input order
   */
  protected async executeTasks<T>(
    context: ReadContext,
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    const limit = this.parseConcurrency(context.options.concurrency);

    if (limit > 0) {
      return await runConcurrent(tasks, limit);
    }

    const results: T[] = [];

    for (const task of tasks) {
      results.push(await task());
    }

    return results;
  }

  /**
   * Converts public concurrency options into an internal numeric limit
   * @param concurrency Public concurrency option
   * @returns Zero for sequential execution or a positive worker limit
   */
  private parseConcurrency(concurrency: ReadOptions['concurrency']): number {
    if (!concurrency) {
      return 0;
    }

    if (concurrency === true) {
      return 20;
    }

    return concurrency.limit ?? 20;
  }
}
