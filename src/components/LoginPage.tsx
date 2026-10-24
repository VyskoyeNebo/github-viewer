import { useEffect, useState } from 'react';
import type { DeviceCodeView } from '../lib/device-flow';
import { Icon } from './Icon';

export function LoginPage({ waiting, busy, error, onLogin, onCancel, onOpen, device, status, web }: {
  waiting: boolean; busy: boolean; error: string | null; onLogin(): void; onCancel(): void; onOpen(): void;
  device: DeviceCodeView | null; status: string; web: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!device) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [device]);
  const remaining = Math.max(0, Math.ceil(((device?.expiresAt ?? now) - now) / 1000));
  return <main className="login-layout">
    <section className="login-art" aria-hidden="true">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="hero-mark"><Icon name="github" size={70} /></div>
      <span className="floating-chip chip-one"><span className="status-dot" /> Your code, connected.</span>
      <span className="floating-chip chip-two"><Icon name="repo" size={16} /> Everything in one place</span>
    </section>
    <section className="login-content">
      <span className="eyebrow">GITHUB DEVICE FLOW</span>
      <h1>你的 GitHub，<br /><span>随时在手边。</span></h1>
      <p className="login-description">在 GitHub 输入下方用户码完成授权。<br />登录一次，下一次打开就能继续。</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {device ? <div className="device-panel">
        <span className="device-label">你的登录用户码</span>
        <code className="device-user-code" aria-label={`登录用户码 ${device.userCode}`}>{device.userCode}</code>
        <p className="device-expiry">{Math.floor(remaining / 60)} 分 {remaining % 60} 秒后过期 · 长按可复制</p>
        <p className="device-instructions">打开 <strong>github.com/login/device</strong><br />输入上述 8 位用户码并确认授权。</p>
        <button className="button primary full" disabled={busy || web} onClick={onOpen}><Icon name="github" />打开 GitHub 验证<Icon name="arrow" size={18} /></button>
        <p className="waiting device-waiting" role="status"><span className="spinner" />{status}</p>
        <button className="text-button device-cancel" disabled={busy} onClick={onCancel}>取消本次登录</button>
      </div> : waiting ? <>
        <p className="waiting" role="status"><span className="spinner" />{status || '正在获取登录用户码…'}</p>
        <button className="button secondary full" disabled={busy} onClick={onCancel}>取消登录</button>
      </> : <button className="button primary full" disabled={busy || web} onClick={onLogin}><Icon name="github" />获取登录用户码<Icon name="arrow" size={18} /></button>}
      {web && <p className="preview-note">网页为界面预览，请安装 Android APK 使用设备授权。</p>}
      <div className="privacy-note"><Icon name="shield" size={18} /><span>通过 GitHub 官方设备流授权<br /><small>不收集密码 · 凭据在设备上加密保存</small></span></div>
    </section>
  </main>;
}
