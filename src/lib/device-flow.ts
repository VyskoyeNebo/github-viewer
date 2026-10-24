import { Browser } from '@capacitor/browser';
import type { StoredCredential } from '../types';
import { CLIENT_ID, VERIFICATION_URI, validateConfig } from './config';
import { SafeError } from './errors';
import { nativeTransport, type Transport } from './http';
import { isAndroid } from './secure-storage';

export interface DeviceCodeView { userCode: string; verificationUri: string; expiresAt: number }
export interface DeviceFlowHandlers {
  onCode(code: DeviceCodeView): void;
  onStatus(message: string): void;
  onAuthorized(credential: StoredCredential): Promise<void>;
  onError(error: unknown): void;
}
export interface DeviceFlow {
  begin(handlers: DeviceFlowHandlers): Promise<void>;
  cancel(): void;
  resume(): void;
  openVerification(): Promise<void>;
}
interface Run {
  deviceCode: string;
  view: DeviceCodeView;
  intervalMs: number;
  backoffMs: number;
  nextPollAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  polling: boolean;
  handlers: DeviceFlowHandlers;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SafeError('GitHub 返回了无效的授权数据，请重新获取用户码。');
  return value as Record<string, unknown>;
}

function protocolError(code: unknown): SafeError {
  switch (code) {
    case 'device_flow_disabled': return new SafeError('请在 GitHub OAuth App 设置中勾选 Enable Device Flow 后重试。');
    case 'incorrect_client_credentials': return new SafeError('Client ID 不正确，请检查 GitHub OAuth App 配置。');
    case 'access_denied': return new SafeError('你拒绝了本次授权，可在需要时重新获取用户码。');
    case 'expired_token': case 'token_expired': case 'incorrect_device_code': return new SafeError('本次用户码已过期或失效，请重新获取。');
    default: return new SafeError('GitHub 未完成设备授权，请重新获取用户码。');
  }
}

export class GitHubDeviceFlow implements DeviceFlow {
  private active: Run | null = null;
  private generation = 0;
  constructor(private readonly transport: Transport = nativeTransport) {}

  cancel() {
    this.generation++;
    if (this.active?.timer) clearTimeout(this.active.timer);
    this.active = null;
  }

  private post(url: string, data: URLSearchParams) {
    return this.transport({ url, method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, data: data.toString() });
  }

  async begin(handlers: DeviceFlowHandlers) {
    if (!isAndroid()) throw new SafeError('请在 Android APK 内使用设备授权。');
    validateConfig();
    this.cancel();
    const generation = this.generation;
    const response = await this.post('https://github.com/login/device/code', new URLSearchParams({ client_id: CLIENT_ID, scope: 'read:user repo' }));
    if (generation !== this.generation) return;
    const data = record(response.data);
    if (data.error) throw protocolError(data.error);
    if (response.status !== 200 || typeof data.device_code !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(data.device_code) ||
        typeof data.user_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.user_code) ||
        data.verification_uri !== VERIFICATION_URI || !Number.isSafeInteger(data.expires_in) || (data.expires_in as number) <= 0 ||
        (data.expires_in as number) > 86400 || !Number.isSafeInteger(data.interval) || (data.interval as number) <= 0 || (data.interval as number) > 3600) {
      throw new SafeError('GitHub 没有返回有效的用户码，请重试。');
    }
    const view = { userCode: data.user_code, verificationUri: VERIFICATION_URI, expiresAt: Date.now() + (data.expires_in as number) * 1000 };
    const run: Run = { deviceCode: data.device_code, view, intervalMs: (data.interval as number) * 1000, backoffMs: 0, nextPollAt: 0, timer: null, polling: false, handlers };
    this.active = run;
    handlers.onCode(view);
    handlers.onStatus('等待你在 GitHub 输入用户码并确认授权…');
    this.schedule(run, run.intervalMs);
  }

  private schedule(run: Run, delay: number) {
    if (this.active !== run) return;
    if (run.timer) clearTimeout(run.timer);
    run.nextPollAt = Date.now() + delay;
    run.timer = setTimeout(() => { run.timer = null; void this.poll(run); }, Math.max(0, Math.min(delay, run.view.expiresAt - Date.now())));
  }

  private fail(run: Run, error: unknown) {
    if (this.active !== run) return;
    this.cancel();
    run.handlers.onError(error);
  }

  private async poll(run: Run) {
    if (this.active !== run || run.polling) return;
    if (Date.now() >= run.view.expiresAt) { this.fail(run, protocolError('expired_token')); return; }
    run.polling = true;
    try {
      const response = await this.post('https://github.com/login/oauth/access_token', new URLSearchParams({
        client_id: CLIENT_ID, device_code: run.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }));
      if (this.active !== run) return;
      if (response.status === 429 || response.status >= 500) throw new SafeError('GitHub 暂时繁忙，稍后自动继续检查。');
      let data: Record<string, unknown>;
      try { data = record(response.data); }
      catch (error) { this.fail(run, error); return; }
      if (data.error === 'authorization_pending') {
        run.backoffMs = 0;
        run.handlers.onStatus('等待 GitHub 授权，完成后会自动载入账户…');
        this.schedule(run, run.intervalMs);
        return;
      }
      if (data.error === 'slow_down') {
        const requested = Number.isSafeInteger(data.interval) && (data.interval as number) > 0 ? Math.min(data.interval as number, 3600) * 1000 : 0;
        run.intervalMs = Math.max(run.intervalMs + 5000, requested);
        run.handlers.onStatus('GitHub 要求降低检查频率，正在等待授权…');
        this.schedule(run, run.intervalMs);
        return;
      }
      if (data.error) { this.fail(run, protocolError(data.error)); return; }
      if (response.status !== 200 || typeof data.access_token !== 'string' || !data.access_token ||
          typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer') {
        this.fail(run, new SafeError('GitHub 没有返回有效的登录凭据，请重新获取用户码。'));
        return;
      }
      const credential: StoredCredential = { accessToken: data.access_token };
      if (Number.isSafeInteger(data.expires_in) && (data.expires_in as number) > 0) credential.expiresAt = Date.now() + (data.expires_in as number) * 1000;
      this.cancel();
      // v8 Android Browser supports closing its Custom Tab; other browser windows may require returning manually.
      void Browser.close().catch(() => {});
      await run.handlers.onAuthorized(credential);
    } catch (error) {
      if (this.active !== run) return;
      run.backoffMs = Math.min(Math.max(run.intervalMs, run.backoffMs * 2), 60000);
      run.handlers.onStatus('网络暂时不可用，用户码仍保留；稍后自动重试。');
      this.schedule(run, Math.max(run.intervalMs, run.backoffMs));
    } finally { run.polling = false; }
  }

  resume() {
    const run = this.active;
    if (!run || run.polling) return;
    if (Date.now() >= Math.min(run.nextPollAt, run.view.expiresAt)) {
      if (run.timer) clearTimeout(run.timer);
      run.timer = null;
      void this.poll(run);
    }
  }

  async openVerification() {
    if (!this.active || Date.now() >= this.active.view.expiresAt) throw protocolError('expired_token');
    try { await Browser.open({ url: VERIFICATION_URI, toolbarColor: '#101319' }); }
    catch { throw new SafeError('无法打开系统浏览器，请自行访问 github.com/login/device 输入用户码。'); }
  }
}
