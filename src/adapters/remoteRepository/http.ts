import type { RemoteRepositoryProvider } from './types';
import { RemoteRepositoryError } from './errors';

/**
 * Date: 2026-11-07
 * Desc: Handles repository requests, pagination, and response errors
 */

interface RemoteRepositoryJsonPage<T> {
  data: T;
  response: Response;
}

/**
 * Requests a JSON resource and throws a typed error on failed responses
 * @param provider Repository provider used for error context
 * @param url Fully qualified request URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Parsed JSON response body
 */
export async function requestRemoteRepositoryJson<T>(
  provider: RemoteRepositoryProvider,
  url: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<T> {
  const page = await requestRemoteRepositoryJsonPage<T>(
    provider,
    url,
    token,
    signal
  );

  return page.data;
}

/**
 * Requests every page from a paginated repository API collection
 * @param provider Repository provider used for headers and errors
 * @param initialUrl First collection page URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Concatenated collection items from every page
 */
export async function requestAllRemoteRepositoryJsonPages(
  provider: RemoteRepositoryProvider,
  initialUrl: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<unknown[]> {
  const initialOrigin = new URL(initialUrl).origin;
  const visitedUrls = new Set<string>();
  const items: unknown[] = [];
  let nextUrl: string | null = initialUrl;

  while (nextUrl) {
    const currentUrl = new URL(nextUrl).toString();

    if (visitedUrls.has(currentUrl)) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'Repository API pagination returned a repeated page URL',
        provider,
      });
    }

    visitedUrls.add(currentUrl);

    const page = await requestRemoteRepositoryJsonPage<unknown[]>(
      provider,
      currentUrl,
      token,
      signal
    );

    if (!Array.isArray(page.data)) {
      throw new RemoteRepositoryError({
        code: 'unknown',
        message: 'Repository API collection response was not an array',
        provider,
      });
    }

    items.push(...page.data);
    nextUrl = resolveRemoteRepositoryNextPageUrl(
      provider,
      currentUrl,
      initialOrigin,
      page.response
    );
  }

  return items;
}

/**
 * Requests one JSON page and preserves response headers for pagination
 * @param provider Repository provider used for headers and errors
 * @param url Fully qualified request URL
 * @param token Optional access token used for authenticated requests
 * @param signal Optional abort signal for cancellation
 * @returns Parsed JSON body and original response
 */
async function requestRemoteRepositoryJsonPage<T>(
  provider: RemoteRepositoryProvider,
  url: string,
  token: string | undefined,
  signal: AbortSignal | undefined
): Promise<RemoteRepositoryJsonPage<T>> {
  throwIfRemoteRepositoryRequestAborted(signal);

  const requestInit: RequestInit = {
    headers: createRemoteRepositoryHeaders(provider, token),
  };

  if (signal) {
    requestInit.signal = signal;
  }

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    throw await createRemoteRepositoryResponseError(provider, response);
  }

  return {
    data: (await response.json()) as T,
    response,
  };
}

/**
 * Resolves the provider URL for the next collection page
 * @param provider Repository provider used for fallback headers and errors
 * @param currentUrl Current page URL
 * @param initialOrigin Origin that every page must preserve
 * @param response Current page response with pagination headers
 * @returns Validated next page URL, or null at the end of the collection
 */
function resolveRemoteRepositoryNextPageUrl(
  provider: RemoteRepositoryProvider,
  currentUrl: string,
  initialOrigin: string,
  response: Response
): string | null {
  const linkUrl = readRemoteRepositoryNextLink(response.headers.get('link'));
  let candidateUrl = linkUrl;

  if (!candidateUrl && provider === 'gitlab') {
    const nextPage = response.headers.get('x-next-page')?.trim();

    if (nextPage) {
      const url = new URL(currentUrl);

      url.searchParams.set('page', nextPage);
      candidateUrl = url.toString();
    }
  }

  if (!candidateUrl) {
    return null;
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(candidateUrl, currentUrl);
  } catch {
    throw new RemoteRepositoryError({
      code: 'unknown',
      message: 'Repository API pagination returned an invalid next page URL',
      provider,
    });
  }

  if (nextUrl.origin !== initialOrigin) {
    throw new RemoteRepositoryError({
      code: 'unknown',
      message: 'Repository API pagination changed request origin',
      provider,
    });
  }

  return nextUrl.toString();
}

/**
 * Extracts the next relation from an HTTP Link header
 * @param linkHeader Raw Link response header
 * @returns Next page URL, or null when no next relation exists
 */
function readRemoteRepositoryNextLink(
  linkHeader: string | null
): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const linkPart of linkHeader.split(',')) {
    const urlMatch = /<([^>]+)>/u.exec(linkPart);
    const relationMatch = /;\s*rel\s*=\s*"?([^";]+)"?/iu.exec(linkPart);
    const relations =
      relationMatch?.[1]
        ?.trim()
        .split(/\s+/u)
        .map(relation => relation.toLowerCase()) ?? [];

    if (urlMatch?.[1] && relations.includes('next')) {
      return urlMatch[1];
    }
  }

  return null;
}

/**
 * Throws the original abort reason before starting another API request
 * @param signal Optional abort signal shared by the repository read
 */
function throwIfRemoteRepositoryRequestAborted(
  signal: AbortSignal | undefined
): void {
  if (!signal?.aborted) {
    return;
  }

  if (signal.reason !== undefined) {
    throw signal.reason;
  }

  throw new DOMException('The operation was aborted', 'AbortError');
}

/**
 * Builds a typed error describing a failed repository API response
 * @param provider Repository provider used for error context
 * @param response Failed fetch response to inspect
 * @returns Error classified as auth, rate-limit, not-found, or unknown
 */
async function createRemoteRepositoryResponseError(
  provider: RemoteRepositoryProvider,
  response: Response
): Promise<RemoteRepositoryError> {
  const apiMessage = await readRemoteRepositoryErrorMessage(response);
  const rateLimitRemaining =
    response.headers.get('x-ratelimit-remaining') ??
    response.headers.get('ratelimit-remaining');
  const rateLimitReset = Number.parseInt(
    response.headers.get('x-ratelimit-reset') ??
      response.headers.get('ratelimit-reset') ??
      '',
    10
  );
  const isRateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      (rateLimitRemaining === '0' ||
        isRemoteRepositoryRateLimitMessage(apiMessage)));

  if (isRateLimited) {
    return new RemoteRepositoryError({
      code: 'rate-limit',
      message: apiMessage || 'Repository API rate limit reached.',
      provider,
      rateLimitRemaining,
      ...(Number.isFinite(rateLimitReset) ? { rateLimitReset } : {}),
      status: response.status,
    });
  }

  if (response.status === 401 || response.status === 403) {
    return new RemoteRepositoryError({
      code: 'auth',
      message: apiMessage || 'Repository access was denied.',
      provider,
      rateLimitRemaining,
      status: response.status,
    });
  }

  if (response.status === 404) {
    return new RemoteRepositoryError({
      code: 'not-found',
      message: apiMessage || 'Repository, ref, or path was not found.',
      provider,
      status: response.status,
    });
  }

  return new RemoteRepositoryError({
    code: 'unknown',
    message:
      apiMessage ||
      `Repository API request failed: ${response.status} ${response.statusText}`,
    provider,
    status: response.status,
  });
}

/**
 * Checks whether an API error message describes rate limiting
 * @param message Provider error message
 * @returns True when the message indicates rate limiting
 */
function isRemoteRepositoryRateLimitMessage(message: string): boolean {
  return /rate limit|too many requests/iu.test(message);
}

/**
 * Attempts to read a provider error message from a failed response
 * @param response Failed fetch response
 * @returns Provider message or an empty string
 */
async function readRemoteRepositoryErrorMessage(
  response: Response
): Promise<string> {
  try {
    const body = (await response.json()) as unknown;

    if (
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    return '';
  }

  return '';
}

/**
 * Creates provider-specific request headers
 * @param provider Repository provider
 * @param token Optional access token
 * @returns Headers accepted by the provider API
 */
function createRemoteRepositoryHeaders(
  provider: RemoteRepositoryProvider,
  token?: string
): HeadersInit {
  const headers = new Headers();

  if (provider === 'github') {
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  headers.set('Accept', 'application/json');

  if (token) {
    headers.set('PRIVATE-TOKEN', token);
  }

  return headers;
}
