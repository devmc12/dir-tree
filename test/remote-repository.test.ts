import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRemoteRepositoryApiClient,
  parseRemoteRepositoryUrl,
  type RemoteRepositoryError,
  type RemoteRepositoryApiClient,
} from '../src/adapters';

/**
 * Date: 2026-06-08
 * Desc: Verifies fetch-based remote repository API clients
 */

interface FetchCall {
  init: RequestInit | undefined;
  url: string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function createJsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

function stubRemoteRepositoryFetch(
  resolver: (url: URL, init: RequestInit | undefined) => Response
): FetchCall[] {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());

    calls.push({ init, url: url.toString() });

    return Promise.resolve(resolver(url, init));
  });

  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function getRequestHeaders(call: FetchCall): Headers {
  return call.init?.headers instanceof Headers
    ? call.init.headers
    : new Headers(call.init?.headers);
}

describe('remote repository fetch clients', () => {
  it('maps GitHub repository info, branches, and tree entries', async () => {
    const calls = stubRemoteRepositoryFetch(url => {
      if (url.pathname === '/repos/acme/project') {
        return createJsonResponse({ default_branch: 'main' });
      }

      if (url.pathname === '/repos/acme/project/branches') {
        expect(url.searchParams.get('per_page')).toBe('100');
        return createJsonResponse([
          { name: 'main', default: true },
          { name: 'feature/docs' },
          { invalid: true },
        ]);
      }

      if (url.pathname === '/repos/acme/project/git/trees/main') {
        expect(url.searchParams.get('recursive')).toBe('1');
        return createJsonResponse({
          tree: [
            { path: 'src', type: 'tree' },
            { path: 'src/index.ts', size: 42, type: 'blob' },
            { path: 'src/submodule', type: 'commit' },
            { path: 'src/ignored.txt', type: 'unknown' },
            { path: 123, type: 'blob' },
          ],
        });
      }

      return createJsonResponse({ message: 'not found' }, { status: 404 });
    });
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );
    const client = createRemoteRepositoryApiClient('github', 'gh-token');

    await expect(client.getDefaultBranch(parsedUrl)).resolves.toBe('main');
    await expect(client.listBranches(parsedUrl)).resolves.toEqual([
      { name: 'main', default: true },
      { name: 'feature/docs' },
    ]);
    await expect(
      client.listTreeEntries(parsedUrl, 'main', { readFileMeta: true })
    ).resolves.toEqual([
      { kind: 'directory', path: 'src' },
      { kind: 'file', path: 'src/index.ts', size: 42 },
      { kind: 'directory', path: 'src/submodule' },
    ]);

    expect(calls).toHaveLength(3);
    calls.forEach(call => {
      const headers = getRequestHeaders(call);

      expect(headers.get('Accept')).toBe('application/vnd.github+json');
      expect(headers.get('Authorization')).toBe('Bearer gh-token');
      expect(headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    });
  });

  it('maps GitLab branches and scoped tree entries', async () => {
    const abortController = new AbortController();
    const calls = stubRemoteRepositoryFetch((url, init) => {
      expect(init?.signal).toBe(abortController.signal);

      if (url.pathname === '/api/v4/projects/group%2Fsub%2Fproject') {
        return createJsonResponse({ default_branch: 'trunk' });
      }

      if (
        url.pathname ===
        '/api/v4/projects/group%2Fsub%2Fproject/repository/branches'
      ) {
        expect(url.searchParams.get('per_page')).toBe('100');
        return createJsonResponse([
          { name: 'trunk', default: true },
          { name: 'release/v1' },
        ]);
      }

      if (
        url.pathname ===
        '/api/v4/projects/group%2Fsub%2Fproject/repository/tree'
      ) {
        expect(url.searchParams.get('path')).toBe('src/features');
        expect(url.searchParams.get('per_page')).toBe('100');
        expect(url.searchParams.get('recursive')).toBe('true');
        expect(url.searchParams.get('ref')).toBe('release/v1');

        return createJsonResponse([
          { path: 'src/features', type: 'tree' },
          { path: 'src/features/index.ts', size: 31, type: 'blob' },
          { path: 'src/features/ignored', type: 'commit' },
          { path: 'src/features/skip.md', type: 'unknown' },
        ]);
      }

      return createJsonResponse({ message: 'not found' }, { status: 404 });
    });
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://gitlab.com/group/sub/project'
    );
    const client = createRemoteRepositoryApiClient('gitlab', 'gl-token');

    await expect(
      client.getDefaultBranch(parsedUrl, abortController.signal)
    ).resolves.toBe('trunk');
    await expect(
      client.listBranches(parsedUrl, abortController.signal)
    ).resolves.toEqual([
      { name: 'trunk', default: true },
      { name: 'release/v1' },
    ]);
    await expect(
      client.listTreeEntries(parsedUrl, 'release/v1', {
        readFileMeta: true,
        signal: abortController.signal,
        subPath: 'src/features',
      })
    ).resolves.toEqual([
      { kind: 'directory', path: 'src/features' },
      { kind: 'file', path: 'src/features/index.ts', size: 31 },
    ]);

    expect(calls).toHaveLength(3);
    calls.forEach(call => {
      const headers = getRequestHeaders(call);

      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('PRIVATE-TOKEN')).toBe('gl-token');
    });
  });

  it('classifies HTTP and missing subpath errors', async () => {
    const notFoundClient = createClientWithResponse(
      createJsonResponse({ message: 'missing' }, { status: 404 })
    );
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );

    await expect(
      notFoundClient.getDefaultBranch(parsedUrl)
    ).rejects.toMatchObject({
      code: 'not-found',
      name: 'RemoteRepositoryError',
      provider: 'github',
      status: 404,
    } satisfies Partial<RemoteRepositoryError>);

    const unknownErrorClient = createClientWithResponse(
      createJsonResponse({ message: 'server error' }, { status: 500 })
    );

    await expect(
      unknownErrorClient.getDefaultBranch(parsedUrl)
    ).rejects.toMatchObject({
      code: 'unknown',
      provider: 'github',
      status: 500,
    } satisfies Partial<RemoteRepositoryError>);

    const rateLimitClient = createClientWithResponse(
      createJsonResponse(
        { message: 'API rate limit exceeded' },
        {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1710000000',
          },
          status: 403,
        }
      )
    );

    await expect(
      rateLimitClient.getDefaultBranch(parsedUrl)
    ).rejects.toMatchObject({
      code: 'rate-limit',
      provider: 'github',
      rateLimitRemaining: '0',
      rateLimitReset: 1710000000,
      status: 403,
    } satisfies Partial<RemoteRepositoryError>);

    const missingPathClient = createClientWithResponse(
      createJsonResponse({
        tree: [{ path: 'src/index.ts', size: 12, type: 'blob' }],
      })
    );

    await expect(
      missingPathClient.listTreeEntries(parsedUrl, 'main', {
        subPath: 'docs',
      })
    ).rejects.toMatchObject({
      code: 'not-found',
      name: 'RemoteRepositoryError',
    } satisfies Partial<RemoteRepositoryError>);
  });
});

function createClientWithResponse(
  response: Response
): RemoteRepositoryApiClient {
  stubRemoteRepositoryFetch(() => response);
  return createRemoteRepositoryApiClient('github');
}
