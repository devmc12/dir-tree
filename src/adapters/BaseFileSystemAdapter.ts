import type { ReaderAdapter } from './IFileSystemAdapter';
import type {
  FileNode,
  GitignoreRule,
  ReadOptions,
  SortOptions,
} from '../reader/types';
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

export abstract class BaseFileSystemAdapter implements ReaderAdapter {
  protected depth: number;
  protected excludePatterns: string[];
  protected gitignoreRules: Map<string, GitignoreRule[]>;
  protected mode: 'read' | 'readwrite';
  protected readFileMeta: boolean;
  protected showHidden: boolean;
  protected useGitignore: boolean;
  protected concurrencyLimit: number;
  protected sort: SortOptions | undefined;

  /**
   * Creates a base adapter with normalized read options
   * @param options Initial read options shared by adapter implementations
   */
  protected constructor(options: ReadOptions = {}) {
    this.depth = options.depth ?? Infinity;
    this.excludePatterns = options.exclude ?? [];
    this.gitignoreRules = new Map();
    this.mode = options.mode ?? 'read';
    this.readFileMeta = options.readFileMeta ?? false;
    this.showHidden = options.showHidden ?? false;
    this.useGitignore = options.useGitignore ?? true;
    this.concurrencyLimit = this.parseConcurrency(options.concurrency);
    this.sort = options.sort;
  }

  /**
   * Reads the adapter source into a FileNode tree
   * @param options Optional read option overrides applied before reading
   * @returns Directory tree produced by the adapter
   */
  abstract read(options?: Partial<ReadOptions>): Promise<FileNode>;

  /**
   * Applies partial read option overrides to the adapter state
   * @param options Option overrides supplied for a single read
   */
  protected updateOptions(options?: Partial<ReadOptions>): void {
    if (!options) {
      return;
    }

    if (options.depth !== undefined) {
      this.depth = options.depth;
    }

    if (options.exclude !== undefined) {
      this.excludePatterns = options.exclude;
    }

    if (options.showHidden !== undefined) {
      this.showHidden = options.showHidden;
    }

    if (options.useGitignore !== undefined) {
      this.useGitignore = options.useGitignore;
    }

    if (options.readFileMeta !== undefined) {
      this.readFileMeta = options.readFileMeta;
    }

    if (options.mode !== undefined) {
      this.mode = options.mode;
    }

    if (options.sort !== undefined) {
      this.sort = options.sort;
    }

    if (options.concurrency !== undefined) {
      this.concurrencyLimit = this.parseConcurrency(options.concurrency);
    }
  }

  /**
   * Returns the current adapter read options
   * @returns Read options represented by the adapter state
   */
  protected getOptions(): ReadOptions {
    const options: ReadOptions = {
      depth: this.depth,
      exclude: this.excludePatterns,
      showHidden: this.showHidden,
      useGitignore: this.useGitignore,
      readFileMeta: this.readFileMeta,
      concurrency:
        this.concurrencyLimit === 0
          ? false
          : {
              limit: this.concurrencyLimit,
            },
      mode: this.mode,
    };

    if (this.sort !== undefined) {
      options.sort = this.sort;
    }

    return options;
  }

  /**
   * Prepares a new read by applying overrides and clearing gitignore rules
   * @param options Optional read option overrides applied before reading
   */
  protected resetReadSession(options?: Partial<ReadOptions>): void {
    this.updateOptions(options);
    this.gitignoreRules = new Map();
  }

  /**
   * Tests a tree path against configured exclude patterns
   * @param fullPath Tree path to test
   * @returns True when the path is excluded
   */
  protected isPathExcludedByPatterns(fullPath: string): boolean {
    return isPathExcluded(fullPath, this.excludePatterns);
  }

  /**
   * Parses and stores gitignore rules for a tree-relative directory
   * @param dirRelPath Directory path the rules are anchored to
   * @param content Raw gitignore file content
   */
  protected registerGitignoreRules(dirRelPath: string, content: string): void {
    const rules = parseGitignore(content, dirRelPath);

    if (rules.length > 0) {
      this.gitignoreRules.set(dirRelPath, rules);
    }
  }

  /**
   * Tests a path against loaded gitignore rules from root to parent directory
   * @param filePath Tree path to test
   * @param parentDirPath Parent directory path used to collect scoped rules
   * @returns True when the path is ignored
   */
  protected isGitIgnored(
    filePath: string,
    parentDirPath = getParentPath(filePath)
  ): boolean {
    const allRules: GitignoreRule[] = [];
    const rootRules = this.gitignoreRules.get('');

    if (rootRules) {
      allRules.push(...rootRules);
    }

    const parts = parentDirPath.split('/').filter(Boolean);
    let accumulatedPath = '';

    parts.forEach(part => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const rules = this.gitignoreRules.get(accumulatedPath);

      if (rules) {
        allRules.push(...rules);
      }
    });

    let ignored = false;

    allRules.forEach(rule => {
      if (rule.regex.test(filePath)) {
        ignored = !rule.negate;
      }
    });

    return ignored;
  }

  /**
   * Runs read tasks sequentially or with the configured concurrency limit
   * @param tasks Task factories to execute
   * @returns Task results in input order
   */
  protected async executeTasks<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    if (this.concurrencyLimit > 0) {
      return await runConcurrent(tasks, this.concurrencyLimit);
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
