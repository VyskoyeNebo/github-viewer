import type { DashboardData, StoredCredential } from '../types';
import { SafeError, UnauthorizedError, userMessage } from './errors';
import type { DeviceCodeView, DeviceFlow } from './device-flow';
import type { CredentialStore } from './secure-storage';

export interface SessionSnapshot {
  phase: 'booting' | 'guest' | 'authorizing' | 'authenticated' | 'offline' | 'storage-error';
  data: DashboardData | null;
  device: DeviceCodeView | null;
  authStatus: string;
  error: string | null;
  busy: boolean;
  hasCredential: boolean;
}

export class SessionController {
  private snapshot: SessionSnapshot = { phase: 'booting', data: null, device: null, authStatus: '', error: null, busy: true, hasCredential: false };
  private listeners = new Set<() => void>();
  private credential: StoredCredential | null = null;
  private epoch = 0;
  private loadingEpoch: number | null = null;
  private finalizing = false;
  private storageReady = false;
  private started: Promise<void> | null = null;

  constructor(private readonly store: CredentialStore, private readonly flow: DeviceFlow, private readonly api: { dashboard(token: string): Promise<DashboardData> }) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  start() { return this.started ??= this.restore(); }

  private async restore() {
    this.update({ phase: 'booting', busy: true, error: null });
    try {
      this.credential = await this.store.read();
      this.storageReady = true;
      this.update({ hasCredential: Boolean(this.credential), busy: false });
      if (this.credential) await this.refresh();
      else await this.login();
    } catch (error) { this.update({ phase: 'storage-error', busy: false, error: userMessage(error) }); }
  }

  async login() {
    if (this.snapshot.busy || this.credential || !this.storageReady || this.finalizing) return;
    const epoch = ++this.epoch;
    this.flow.cancel();
    this.update({ phase: 'authorizing', device: null, busy: true, error: null, authStatus: '正在获取登录用户码…' });
    try {
      await this.flow.begin({
        onCode: device => { if (epoch === this.epoch) this.update({ device, busy: false }); },
        onStatus: authStatus => { if (epoch === this.epoch) this.update({ authStatus }); },
        onError: error => { if (epoch === this.epoch) this.update({ phase: 'guest', device: null, busy: false, error: userMessage(error) }); },
        onAuthorized: credential => this.accept(credential, epoch),
      });
    } catch (error) { if (epoch === this.epoch) this.update({ phase: 'guest', device: null, busy: false, error: userMessage(error) }); }
  }

  private async accept(credential: StoredCredential, epoch: number) {
    if (epoch !== this.epoch) return;
    this.finalizing = true;
    this.update({ busy: true, device: null, authStatus: '授权成功，正在安全保存登录凭据…', error: null });
    try {
      await this.store.write(credential);
      this.credential = credential;
      this.update({ hasCredential: true });
      await this.refresh();
    } catch (error) { this.update({ phase: 'guest', busy: false, error: userMessage(error) }); }
    finally { this.finalizing = false; }
  }

  cancelLogin() {
    if (this.finalizing) return;
    this.epoch++;
    this.flow.cancel();
    this.update({ phase: 'guest', device: null, busy: false, error: null, authStatus: '' });
  }

  async openVerification() {
    try { await this.flow.openVerification(); }
    catch (error) { this.update({ error: userMessage(error) }); }
  }
  resume() { this.flow.resume(); }

  async refresh() {
    if (!this.credential || this.loadingEpoch === this.epoch) return;
    const epoch = this.epoch;
    const credential = this.credential;
    this.loadingEpoch = epoch;
    this.update({ busy: true, error: null });
    try {
      if (credential.expiresAt !== undefined && credential.expiresAt <= Date.now()) throw new UnauthorizedError();
      const data = await this.api.dashboard(credential.accessToken);
      if (epoch === this.epoch) this.update({ phase: 'authenticated', data, busy: false });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error instanceof UnauthorizedError) {
        try {
          await this.store.clear();
          this.credential = null;
          this.update({ phase: 'guest', data: null, busy: false, hasCredential: false, error: userMessage(error) });
          if (!this.finalizing) await this.login();
        } catch (storageError) { this.update({ phase: 'storage-error', data: null, busy: false, error: userMessage(storageError) }); }
      } else this.update({ phase: this.snapshot.data ? 'authenticated' : 'offline', busy: false, error: userMessage(error) });
    } finally { if (this.loadingEpoch === epoch) this.loadingEpoch = null; }
  }

  async retry() {
    if (this.snapshot.busy) return;
    if (this.snapshot.phase === 'storage-error') await this.restore();
    else if (!this.credential) await this.login();
    else await this.refresh();
  }

  async logout() {
    if (this.finalizing) return;
    this.epoch++;
    this.flow.cancel();
    this.update({ busy: true, error: null, device: null });
    try {
      await this.store.clear();
      this.credential = null;
      this.update({ phase: 'guest', data: null, busy: false, hasCredential: false, authStatus: '' });
    } catch { this.update({ phase: 'storage-error', busy: false, error: userMessage(new SafeError('退出未完成：无法删除加密凭据，请重试退出登录。')) }); }
  }
}
