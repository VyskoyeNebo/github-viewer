import { useSyncExternalStore } from 'react';
import { Dashboard } from './components/Dashboard';
import { Icon } from './components/Icon';
import { LoginPage } from './components/LoginPage';
import { session } from './lib/runtime';
import { isAndroid } from './lib/secure-storage';

export default function App() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const web = !isAndroid();
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-icon"><Icon name="github" size={22} /></span><span>GitHub <b>Viewer</b></span></div><span className="header-caption">YOUR PERSONAL CODE COMPANION</span><span className="header-version">v1.1</span></header>
    {web || state.phase === 'guest' || state.phase === 'authorizing' ? <LoginPage web={web} waiting={state.phase === 'authorizing'} busy={!web && state.busy} error={state.error} device={state.device} status={state.authStatus} onLogin={() => void session.login()} onCancel={() => session.cancelLogin()} onOpen={() => void session.openVerification()} /> :
      state.data && state.phase === 'authenticated' ? <Dashboard data={state.data} busy={state.busy} error={state.error} onRefresh={() => void session.refresh()} onLogout={() => void session.logout()} /> :
      <main className="status-page"><Icon name={state.busy ? 'github' : 'shield'} size={42} /><h1>{state.busy ? '正在打开你的工作空间' : state.phase === 'storage-error' ? '无法访问加密凭据' : '暂时无法连接 GitHub'}</h1>
        <p role={state.error ? 'alert' : 'status'}>{state.error ?? '正在安全读取登录状态并获取最新资料…'}</p>
        {state.busy ? <span className="spinner" /> : <div className="status-actions"><button className="button primary" onClick={() => void session.retry()}>重试</button>{state.hasCredential && <button className="button secondary" onClick={() => void session.logout()}>退出登录</button>}</div>}
      </main>}
    <footer className="app-footer"><span>GitHub Viewer</span><span>Made for your everyday commits.</span><span><span className="status-dot" />{state.hasCredential ? '安全连接' : 'ON YOUR DEVICE'}</span></footer>
  </div>;
}
