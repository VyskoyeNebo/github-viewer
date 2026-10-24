import type { DashboardData } from '../types';
import { RepositoryList } from './RepositoryList';
import { Icon } from './Icon';

export function Dashboard({ data, busy, error, onRefresh, onLogout }: { data: DashboardData; busy: boolean; error: string | null; onRefresh(): void; onLogout(): void }) {
  const { user, repositories } = data;
  const avatar = /^https:\/\/avatars\.githubusercontent\.com\//.test(user.avatar_url) ? user.avatar_url : undefined;
  return <main className="dashboard">
    <section className="profile-card">
      <div className="profile-top"><div className="avatar-wrap">{avatar ? <img className="avatar" src={avatar} alt={`${user.login} 的头像`} referrerPolicy="no-referrer" /> : <div className="avatar fallback-avatar"><Icon name="github" size={35} /></div>}<span className="avatar-status" /></div><span className="connected"><span className="status-dot" />已连接 GitHub</span></div>
      <h1>{user.name || user.login}</h1><p className="username">@{user.login}</p>
      {user.bio && <p className="bio">{user.bio}</p>}
      <div className="profile-stats"><div><strong>{repositories.length}</strong><span>仓库</span></div><div><strong>{user.followers}</strong><span>关注者</span></div><div><strong>{user.following}</strong><span>正在关注</span></div></div>
      <div className="profile-bottom"><span><Icon name="shield" size={15} />凭据已加密保存</span><button className="text-button" disabled={busy} onClick={onLogout}><Icon name="logout" size={15} />退出登录</button></div>
    </section>
    <div className="repo-column">{error && <div className="notice error" role="alert">{error}<button disabled={busy} onClick={onRefresh}>重试</button></div>}<RepositoryList repositories={repositories} busy={busy} onRefresh={onRefresh} /></div>
  </main>;
}
