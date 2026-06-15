import type {
  RemoteRepositoryErrorCode,
  RemoteRepositoryProvider,
} from './types';

/**
 * Date: 2026-06-07
 * Desc: Defines remote repository adapter error types
 */

export class RemoteRepositoryError extends Error {
  code: RemoteRepositoryErrorCode;
  provider?: RemoteRepositoryProvider;
  rateLimitRemaining?: string | null;
  rateLimitReset?: number;
  status?: number;

  /**
   * Creates a remote repository error with provider and rate limit context
   * @param options Error code, message, and optional provider metadata
   */
  constructor(options: {
    code: RemoteRepositoryErrorCode;
    message: string;
    provider?: RemoteRepositoryProvider;
    rateLimitRemaining?: string | null;
    rateLimitReset?: number;
    status?: number;
  }) {
    super(options.message);
    this.name = 'RemoteRepositoryError';
    this.code = options.code;

    if (options.provider !== undefined) {
      this.provider = options.provider;
    }

    if (options.rateLimitRemaining !== undefined) {
      this.rateLimitRemaining = options.rateLimitRemaining;
    }

    if (options.rateLimitReset !== undefined) {
      this.rateLimitReset = options.rateLimitReset;
    }

    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}
