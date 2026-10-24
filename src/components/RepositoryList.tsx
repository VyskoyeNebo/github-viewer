import { useMemo, useState } from 'react';
import type { Repository } from '../types';
import { Icon } from './Icon';

const languageColors: Record<string, string> = { TypeScript: '#3178c6', JavaScript: '#d1ac34', Python: '#3572a5', Java: '#b07219', Kotlin: '#a97bff', Rust: '#b65b31', Go: '#00add8', HTML: '#e34c26', CSS: '#8253bd', Swift: '#f05138', C: '#555555', 'C++': '#f34b7d', Shell: '#6a9756', Dart: '#00b4ab' };

function updatedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知日期' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function RepositoryList({ repositories, busy, onRefresh }: { repositories: Repository[]; busy: boolean; onRefresh(): void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');
  const visible = useMemo(() => repositories.filter(repo =>
    (filter === 'all' || repo.private === (filter === 'private')) &&
    `${repo.full_name} ${repo.description ?? ''} ${repo.language ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  ), [repositories, filter, query]);

  return <section className="repositories" aria-label="仓库列表">
    <div className="section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>我的仓库 <span className="count">{repositories.length}</span></h2></div>
      <button className="button secondary refresh-button" disabled={busy} onClick={onRefresh}><Icon name="refresh" size={16} className={busy ? 'spin' : undefined} />{busy ? '刷新中' : '刷新'}</button>
    </div>
    <label className="search-field"><Icon name="search" size={19} /><input aria-label="搜索仓库" placeholder="搜索仓库、语言或描述…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>/</kbd></label>
    <div className="list-toolbar"><div className="filter-tabs" role="group" aria-label="仓库可见性">
      {(['all', 'public', 'private'] as const).map((key, index) => <button key={key} aria-pressed={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{['全部', '公开', '私有'][index]}</button>)}
    </div><span className="sort-label">最近更新 ↓</span></div>
    <div className="repo-list" aria-busy={busy}>
      {visible.map(repo => <article className="repo-card" key={repo.id}>
        <div className="repo-icon"><Icon name="repo" size={21} /></div>
        <div className="repo-content"><div className="repo-title"><h3>{repo.name}</h3><span className={`visibility ${repo.private ? 'private' : ''}`}>{repo.private && <Icon name="lock" size={11} />}{repo.private ? '私有' : '公开'}</span></div>
          <p className="repo-owner">{repo.full_name}</p>
          {repo.description && <p className="repo-description">{repo.description}</p>}
          <div className="repo-meta"><span><i style={{ background: languageColors[repo.language ?? ''] ?? '#8a9390' }} />{repo.language ?? '未标注语言'}</span><span><Icon name="star" size={13} />{repo.stargazers_count}</span><time dateTime={repo.updated_at}>更新于 {updatedDate(repo.updated_at)}</time></div>
        </div>
      </article>)}
      {visible.length === 0 && <div className="empty-state"><Icon name="repo" size={32} /><h3>{repositories.length ? '没有匹配的仓库' : '还没有仓库'}</h3><p>{repositories.length ? '试试其他关键词或可见性筛选。' : '你的 GitHub 仓库将在这里显示。'}</p></div>}
    </div>
    <p className="list-footer">{visible.length} 个仓库 · 已包含可访问的私有仓库</p>
  </section>;
}
