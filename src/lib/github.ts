import type { DashboardData, GitHubUser, Repository } from '../types';
import { SafeError, UnauthorizedError } from './errors';
import { nativeTransport, type Transport } from './http';

export class GitHubApi {
  constructor(private readonly transport: Transport = nativeTransport) {}

  private async get(path: string, token: string) {
    const response = await this.transport({
      url: `https://api.github.com${path}`, method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (response.status === 401) throw new UnauthorizedError();
    if (response.status === 403 || response.status === 429) throw new SafeError('GitHub 暂时限制访问，或此资源需要额外授权。请稍后重试；登录凭据仍保留。');
    if (response.status !== 200) throw new SafeError('GitHub 暂时无法返回数据，请稍后重试。登录凭据仍保留。');
    return response;
  }

  private async user(token: string): Promise<GitHubUser> {
    const { data } = await this.get('/user', token);
    if (!data || typeof data !== 'object' || !('login' in data) || typeof data.login !== 'string') throw new SafeError('GitHub 用户数据格式异常，请重试。');
    return data as GitHubUser;
  }

  private async repos(token: string): Promise<Repository[]> {
    const repositories: Repository[] = [];
    let page = 1;
    while (true) {
      const response = await this.get(`/user/repos?per_page=100&sort=updated${page === 1 ? '' : `&page=${page}`}`, token);
      if (!Array.isArray(response.data)) throw new SafeError('GitHub 仓库数据格式异常，请重试。');
      repositories.push(...response.data as Repository[]);
      const link = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'link')?.[1] ?? '';
      // Never follow a server-supplied URL with the bearer credential; construct fixed-origin page URLs.
      if (!/rel="next"/.test(link)) break;
      if (++page > 1000) throw new SafeError('仓库分页数量超出限制，请重试。');
    }
    return [...new Map(repositories.map(repo => [repo.id, repo])).values()];
  }

  async dashboard(token: string): Promise<DashboardData> {
    const results = await Promise.allSettled([this.user(token), this.repos(token)] as const);
    // A 401 from either API must win over a concurrent network failure.
    for (const result of results) if (result.status === 'rejected' && result.reason instanceof UnauthorizedError) throw result.reason;
    const [user, repositories] = results;
    if (user.status === 'rejected') throw user.reason;
    if (repositories.status === 'rejected') throw repositories.reason;
    return { user: user.value, repositories: repositories.value };
  }
}
