import { describe, expect, it, vi } from 'vitest';
import { GitHubApi } from '../src/lib/github';
import { UnauthorizedError } from '../src/lib/errors';
import type { JsonResponse, RequestOptions } from '../src/lib/http';

describe('GitHub API', () => {
  it('paginates repositories and never follows a foreign URL with the credential', async () => {
    const transport = vi.fn(async ({ url, headers }: RequestOptions): Promise<JsonResponse> => {
      expect(url.startsWith('https://api.github.com/')).toBe(true);
      expect(headers.Accept).toBe('application/json');
      if (url.endsWith('/user')) return { status: 200, data: { login: 'fixture' }, headers: {} };
      if (url.includes('&page=2')) return { status: 200, data: [{ id: 2 }], headers: {} };
      return { status: 200, data: [{ id: 1 }], headers: { Link: '<https://attacker.invalid/steal>; rel="next"' } };
    });
    const result = await new GitHubApi(transport).dashboard('fixture-token');
    expect(result.repositories.map(repo => repo.id)).toEqual([1, 2]);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[2][0].url).toBe('https://api.github.com/user/repos?per_page=100&sort=updated&page=2');
  });
  it('prioritizes either endpoint returning 401 over a network error', async () => {
    for (const failUser of [true, false]) {
      const transport = async ({ url }: RequestOptions) => {
        if (url.endsWith('/user') === failUser) throw new Error('offline');
        return { status: 401, data: {}, headers: {} };
      };
      await expect(new GitHubApi(transport).dashboard('fixture-token')).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });
  it.each([403, 429, 500])('does not classify HTTP %s as an invalid credential', async status => {
    await expect(new GitHubApi(async () => ({ status, data: {}, headers: {} })).dashboard('fixture-token')).rejects.not.toBeInstanceOf(UnauthorizedError);
  });
});
