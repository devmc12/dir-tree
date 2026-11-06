/**
 * Date: 2026-11-07
 * Desc: Defines stable errors for tree imports and source reads
 */

export type FileTreeErrorCode =
  | 'duplicate_tree_path'
  | 'gitignore_read_failed'
  | 'invalid_read_option'
  | 'invalid_tree'
  | 'invalid_zip'
  | 'read_failed';

export class FileTreeError extends Error {
  readonly code: FileTreeErrorCode;
  readonly path?: string;
  readonly line?: number;

  /**
   * Creates a tree error with a stable code and optional tree-relative path
   * @param code Category callers can check without parsing the message
   * @param message Description of the failure
   * @param options Optional path, one-based source line, and underlying cause
   */
  constructor(
    code: FileTreeErrorCode,
    message: string,
    options?: { cause?: unknown; path?: string; line?: number }
  ) {
    super(message, options);
    this.name = 'FileTreeError';
    this.code = code;

    if (options?.path !== undefined) {
      this.path = options.path;
    }

    if (options?.line !== undefined) {
      this.line = options.line;
    }
  }
}

/**
 * Recognizes named errors across browser realms without relying on instanceof
 */
export function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
  );
}

/**
 * Reports a source failure while preserving the original cancellation error
 * @throws The original AbortError or a FileTreeError with the source failure
 */
export function throwReadFailure(
  code: Extract<
    FileTreeErrorCode,
    'gitignore_read_failed' | 'invalid_zip' | 'read_failed'
  >,
  message: string,
  path: string | undefined,
  cause: unknown
): never {
  if (hasErrorName(cause, 'AbortError')) {
    throw cause;
  }

  throw new FileTreeError(code, message, {
    cause,
    ...(path === undefined ? {} : { path }),
  });
}
