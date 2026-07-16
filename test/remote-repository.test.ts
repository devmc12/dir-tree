import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRemoteRepositoryApiClient,
  parseRemoteRepositoryUrl,
  resolveRemoteRepositoryBranches,
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
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
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
          truncated: false,
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
        expect(url.searchParams.get('pagination')).toBe('keyset');
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

  it('paginates GitHub branches before resolving slash refs', async () => {
    const calls = stubRemoteRepositoryFetch(url => {
      if (url.pathname === '/repos/acme/project') {
        return createJsonResponse({ default_branch: 'main' });
      }

      if (url.pathname === '/repos/acme/project/branches') {
        if (url.searchParams.get('page') === '2') {
          return createJsonResponse([{ name: 'feature/docs' }]);
        }

        return createJsonResponse([{ name: 'main' }], {
          headers: {
            Link: '<https://api.github.com/repos/acme/project/branches?per_page=100&page=2>; rel="next"',
          },
        });
      }

      return createJsonResponse({ message: 'not found' }, { status: 404 });
    });

    await expect(
      resolveRemoteRepositoryBranches({
        input:
          'https://github.com/acme/project/tree/feature/docs/src/components',
        token: 'gh-token',
      })
    ).resolves.toMatchObject({
      branches: [
        { default: true, name: 'main' },
        { default: false, name: 'feature/docs' },
      ],
      defaultBranch: 'main',
      path: 'src/components',
      ref: 'feature/docs',
    });

    const branchCalls = calls.filter(call => {
      return new URL(call.url).pathname === '/repos/acme/project/branches';
    });

    expect(branchCalls).toHaveLength(2);
    branchCalls.forEach(call => {
      expect(getRequestHeaders(call).get('Authorization')).toBe(
        'Bearer gh-token'
      );
    });
  });

  it('paginates GitLab branches with the next-page header fallback', async () => {
    const calls = stubRemoteRepositoryFetch(url => {
      expect(url.searchParams.get('per_page')).toBe('100');

      if (url.searchParams.get('page') === '2') {
        return createJsonResponse([{ name: 'release/v2' }]);
      }

      return createJsonResponse([{ name: 'main', default: true }], {
        headers: { 'x-next-page': '2' },
      });
    });
    const client = createRemoteRepositoryApiClient('gitlab', 'gl-token');
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://gitlab.com/group/project'
    );

    await expect(client.listBranches(parsedUrl)).resolves.toEqual([
      { name: 'main', default: true },
      { name: 'release/v2' },
    ]);
    expect(calls).toHaveLength(2);
  });

  it('follows GitLab keyset pagination for scoped tree entries', async () => {
    const abortController = new AbortController();
    const calls = stubRemoteRepositoryFetch((url, init) => {
      expect(init?.signal).toBe(abortController.signal);
      expect(url.searchParams.get('pagination')).toBe('keyset');
      expect(url.searchParams.get('path')).toBe('src/features');

      if (url.searchParams.get('page_token') === 'next-tree-id') {
        return createJsonResponse([
          { path: 'src/features/second.ts', size: 22, type: 'blob' },
        ]);
      }

      return createJsonResponse(
        [
          { path: 'src/features', type: 'tree' },
          { path: 'src/features/first.ts', size: 11, type: 'blob' },
        ],
        {
          headers: {
            Link: '<https://gitlab.com/api/v4/projects/group%2Fproject/repository/tree?ref=main&recursive=true&pagination=keyset&per_page=100&path=src%2Ffeatures&page_token=next-tree-id>; rel="next"',
          },
        }
      );
    });
    const client = createRemoteRepositoryApiClient('gitlab', 'gl-token');
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://gitlab.com/group/project'
    );

    await expect(
      client.listTreeEntries(parsedUrl, 'main', {
        readFileMeta: true,
        signal: abortController.signal,
        subPath: 'src/features',
      })
    ).resolves.toEqual([
      { kind: 'directory', path: 'src/features' },
      { kind: 'file', path: 'src/features/first.ts', size: 11 },
      { kind: 'file', path: 'src/features/second.ts', size: 22 },
    ]);
    expect(calls).toHaveLength(2);
    calls.forEach(call => {
      expect(getRequestHeaders(call).get('PRIVATE-TOKEN')).toBe('gl-token');
    });
  });

  it('recovers a truncated GitHub tree and reuses duplicate subtree responses', async () => {
    const calls = stubRemoteRepositoryFetch(url => {
      const treeish = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const recursive = url.searchParams.get('recursive') === '1';

      if (treeish === 'main' && recursive) {
        return createJsonResponse({
          truncated: true,
          tree: [{ path: 'partial.txt', size: 1, type: 'blob' }],
        });
      }

      if (treeish === 'main') {
        return createJsonResponse({
          truncated: false,
          tree: [
            { path: 'README.md', size: 5, type: 'blob' },
            { path: 'src', sha: 'shared-sha', type: 'tree' },
            { path: 'mirror', sha: 'shared-sha', type: 'tree' },
            { path: 'vendor', type: 'commit' },
          ],
        });
      }

      if (treeish === 'shared-sha' && recursive) {
        return createJsonResponse({
          truncated: false,
          tree: [{ path: 'index.ts', size: 42, type: 'blob' }],
        });
      }

      return createJsonResponse({ message: 'not found' }, { status: 404 });
    });
    const client = createRemoteRepositoryApiClient('github');
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );

    await expect(
      client.listTreeEntries(parsedUrl, 'main', { readFileMeta: true })
    ).resolves.toEqual([
      { kind: 'file', path: 'README.md', size: 5 },
      { kind: 'directory', path: 'src' },
      { kind: 'file', path: 'src/index.ts', size: 42 },
      { kind: 'directory', path: 'mirror' },
      { kind: 'file', path: 'mirror/index.ts', size: 42 },
      { kind: 'directory', path: 'vendor' },
    ]);
    expect(calls).toHaveLength(3);
  });

  it('recovers only the requested GitHub subpath through nested truncation', async () => {
    const calls = stubRemoteRepositoryFetch(url => {
      const treeish = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const recursive = url.searchParams.get('recursive') === '1';

      if (treeish === 'main' && recursive) {
        return createJsonResponse({ truncated: true, tree: [] });
      }

      if (treeish === 'main') {
        return createJsonResponse({
          truncated: false,
          tree: [
            { path: 'src', sha: 'src-sha', type: 'tree' },
            { path: 'docs', sha: 'docs-sha', type: 'tree' },
          ],
        });
      }

      if (treeish === 'src-sha' && !recursive) {
        return createJsonResponse({
          truncated: false,
          tree: [
            { path: 'features', sha: 'features-sha', type: 'tree' },
            { path: 'ignored', sha: 'ignored-sha', type: 'tree' },
          ],
        });
      }

      if (treeish === 'features-sha' && recursive) {
        return createJsonResponse({
          truncated: true,
          tree: [{ path: 'partial.ts', size: 1, type: 'blob' }],
        });
      }

      if (treeish === 'features-sha') {
        return createJsonResponse({
          truncated: false,
          tree: [
            { path: 'index.ts', size: 11, type: 'blob' },
            { path: 'nested', sha: 'nested-sha', type: 'tree' },
          ],
        });
      }

      if (treeish === 'nested-sha' && recursive) {
        return createJsonResponse({
          truncated: false,
          tree: [{ path: 'deep.ts', size: 22, type: 'blob' }],
        });
      }

      return createJsonResponse(
        { message: 'unexpected tree' },
        { status: 500 }
      );
    });
    const client = createRemoteRepositoryApiClient('github');
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );

    await expect(
      client.listTreeEntries(parsedUrl, 'main', {
        readFileMeta: true,
        subPath: 'src/features',
      })
    ).resolves.toEqual([
      { kind: 'directory', path: 'src/features' },
      { kind: 'file', path: 'src/features/index.ts', size: 11 },
      { kind: 'directory', path: 'src/features/nested' },
      { kind: 'file', path: 'src/features/nested/deep.ts', size: 22 },
    ]);
    expect(calls).toHaveLength(6);
    expect(calls.some(call => call.url.includes('docs-sha'))).toBe(false);
    expect(calls.some(call => call.url.includes('ignored-sha'))).toBe(false);
  });

  it('rejects incomplete shallow GitHub trees and missing subpaths', async () => {
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );

    stubRemoteRepositoryFetch(() => {
      return createJsonResponse({ truncated: true, tree: [] });
    });

    await expect(
      createRemoteRepositoryApiClient('github').listTreeEntries(
        parsedUrl,
        'main'
      )
    ).rejects.toMatchObject({
      code: 'too-large',
      provider: 'github',
    } satisfies Partial<RemoteRepositoryError>);

    stubRemoteRepositoryFetch(url => {
      if (url.searchParams.get('recursive') === '1') {
        return createJsonResponse({ truncated: true, tree: [] });
      }

      return createJsonResponse({
        truncated: false,
        tree: [{ path: 'src', sha: 'src-sha', type: 'tree' }],
      });
    });

    await expect(
      createRemoteRepositoryApiClient('github').listTreeEntries(
        parsedUrl,
        'main',
        { subPath: 'docs' }
      )
    ).rejects.toMatchObject({
      code: 'not-found',
      provider: 'github',
    } satisfies Partial<RemoteRepositoryError>);
  });

  it('rejects unsafe, failed, and aborted pagination without partial data', async () => {
    const parsedUrl = parseRemoteRepositoryUrl(
      'https://github.com/acme/project'
    );

    stubRemoteRepositoryFetch(() => {
      return createJsonResponse([{ name: 'main' }], {
        headers: {
          Link: '<https://example.com/stolen?page=2>; rel="next"',
        },
      });
    });

    await expect(
      createRemoteRepositoryApiClient('github', 'secret').listBranches(
        parsedUrl
      )
    ).rejects.toMatchObject({
      code: 'unknown',
      provider: 'github',
    } satisfies Partial<RemoteRepositoryError>);

    stubRemoteRepositoryFetch(url => {
      if (url.searchParams.get('page') === '2') {
        return createJsonResponse(
          { message: 'API rate limit exceeded' },
          {
            headers: { 'x-ratelimit-remaining': '0' },
            status: 403,
          }
        );
      }

      return createJsonResponse([{ name: 'main' }], {
        headers: {
          Link: '<https://api.github.com/repos/acme/project/branches?per_page=100&page=2>; rel="next"',
        },
      });
    });

    await expect(
      createRemoteRepositoryApiClient('github').listBranches(parsedUrl)
    ).rejects.toMatchObject({
      code: 'rate-limit',
      provider: 'github',
    } satisfies Partial<RemoteRepositoryError>);

    const abortController = new AbortController();
    const abortCalls = stubRemoteRepositoryFetch(() => {
      abortController.abort();
      return createJsonResponse([{ name: 'main' }], {
        headers: {
          Link: '<https://api.github.com/repos/acme/project/branches?per_page=100&page=2>; rel="next"',
        },
      });
    });

    await expect(
      createRemoteRepositoryApiClient('github').listBranches(
        parsedUrl,
        abortController.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortCalls).toHaveLength(1);
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
