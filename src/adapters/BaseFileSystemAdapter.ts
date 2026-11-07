import type { ReaderAdapter } from './IFileSystemAdapter';
import type {
  FileNode,
  GitignoreRule,
  ReadOptions,
  ReadWarning,
} from '../reader/types';
import { FileTreeError, hasErrorName } from '../reader/errors';
import { createReadIoScheduler, type RunReadIo } from '../reader/concurrency';
import { getParentPath } from '../tree/path';
import { isPathExcluded, parseGitignore } from '../reader/filters';
import { runConcurrent } from '../reader/concurrency';

/**
 * Date: 2026-06-07
 * Desc: Provides shared read option handling for file system adapters
 */

type OptionalReadOptions = Pick<ReadOptions, 'sort' | 'onWarning' | 'onTiming'>;
type EffectiveReadOptions = Required<
  Omit<ReadOptions, keyof OptionalReadOptions>
> &
  OptionalReadOptions;

export interface ReadContext {
  options: EffectiveReadOptions;
  gitignoreRules: Map<string, GitignoreRule[]>;
  concurrencyLimit: number;
  runIo: RunReadIo;
  timing?: { startedAt: number; treeStartedAt?: number };
}

// Default when the caller opts in without supplying an explicit bound
const DEFAULT_READ_CONCURRENCY = 20;

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
  const onTiming = overrides.onTiming ?? defaults.onTiming;

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
    ...(onTiming === undefined ? {} : { onTiming }),
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
   * @param options Overrides for this read; omitted fields use constructor defaults
   * @returns Directory tree produced by the adapter
   */
  abstract read(options?: Partial<ReadOptions>): Promise<FileNode>;

  /**
   * Creates options and rule storage owned by a single read
   * @param options Overrides applied only to this read
   * @returns A context to pass to traversal and filtering helpers
   */
  protected createReadContext(options: Partial<ReadOptions> = {}): ReadContext {
    const effectiveOptions = resolveReadOptions(options, this.defaultOptions);
    const concurrencyLimit = this.parseConcurrency(
      effectiveOptions.concurrency
    );

    return {
      options: effectiveOptions,
      gitignoreRules: new Map(),
      concurrencyLimit,
      runIo: createReadIoScheduler(concurrencyLimit),
      ...(effectiveOptions.onTiming === undefined
        ? {}
        : { timing: { startedAt: performance.now() } }),
    };
  }

  /** Marks the end of source acquisition when a read actually waits for a picker or remote data */
  protected markSourceReady(context: ReadContext): void {
    if (context.timing) {
      context.timing.treeStartedAt = performance.now();
    }
  }

  /**
   * Reports completed adapter work before returning the tree
   * @param context Context owned by this read
   */
  protected reportReadTiming(context: ReadContext): void {
    if (!context.timing) {
      return;
    }

    const endedAt = performance.now();
    const { startedAt, treeStartedAt = startedAt } = context.timing;
    try {
      context.options.onTiming?.({
        prepareMs: treeStartedAt - startedAt,
        treeMs: endedAt - treeStartedAt,
        totalMs: endedAt - startedAt,
      });
    } catch {
      // Timing observers must not turn a successful tree read into a failure
    }
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
    return await runConcurrent(tasks, context.concurrencyLimit);
  }

  /**
   * Converts public concurrency options into an internal numeric limit
   * @param concurrency Public concurrency option
   * @returns One for sequential execution or a positive worker limit
   * @throws FileTreeError when an explicit limit is not a positive integer
   */
  private parseConcurrency(concurrency: ReadOptions['concurrency']): number {
    if (!concurrency) {
      return 1;
    }

    if (concurrency === true) {
      return DEFAULT_READ_CONCURRENCY;
    }

    const limit = concurrency.limit ?? DEFAULT_READ_CONCURRENCY;

    if (!Number.isInteger(limit) || limit < 1) {
      throw new FileTreeError(
        'invalid_read_option',
        'Read concurrency limit must be a positive integer'
      );
    }

    return limit;
  }
}
