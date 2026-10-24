import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Browser } from '@capacitor/browser';
import { GitHubDeviceFlow, type DeviceFlowHandlers } from '../src/lib/device-flow';
import type { JsonResponse, RequestOptions } from '../src/lib/http';

vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(async () => {}), close: vi.fn(async () => {}) } }));
vi.mock('../src/lib/secure-storage', () => ({ isAndroid: () => true }));
vi.mock('../src/lib/config', () => ({ CLIENT_ID: 'fixture-client', VERIFICATION_URI: 'https://github.com/login/device', validateConfig: vi.fn() }));

const codeResponse = { status: 200, headers: {}, data: { device_code: 'a'.repeat(40), user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } };
const pending = { status: 200, headers: {}, data: { error: 'authorization_pending' } };
const token = { status: 200, headers: {}, data: { access_token: 'fixture-token', token_type: 'bearer' } };
function handlers(): DeviceFlowHandlers {
  return { onCode: vi.fn(), onStatus: vi.fn(), onAuthorized: vi.fn(async () => {}), onError: vi.fn() };
}
let flow: GitHubDeviceFlow;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00Z')); });
afterEach(() => { flow?.cancel(); vi.useRealTimers(); });

describe('GitHub Device Flow', () => {
  it('requests a code without opening a browser and polls only after the supplied interval', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse);
    flow = new GitHubDeviceFlow(transport);
    const callbacks = handlers();
    await flow.begin(callbacks);
    expect(transport.mock.calls).toHaveLength(1);
    const first = transport.mock.calls[0] as unknown as [RequestOptions];
    expect(first[0].url).toBe('https://github.com/login/device/code');
    expect(first[0].headers.Accept).toBe('application/json');
    expect(Object.fromEntries(new URLSearchParams(first[0].data))).toEqual({ client_id: 'fixture-client', scope: 'read:user repo' });
    expect(callbacks.onCode).toHaveBeenCalledWith({ userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 900000 });
    expect(Browser.open).not.toHaveBeenCalled();
    transport.mockResolvedValue(pending);
    await vi.advanceTimersByTimeAsync(4999);
    expect(transport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const second = transport.mock.calls[1] as unknown as [RequestOptions];
    expect(second[0].url).toBe('https://github.com/login/oauth/access_token');
    expect(Object.fromEntries(new URLSearchParams(second[0].data))).toEqual({ client_id: 'fixture-client', device_code: 'a'.repeat(40), grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
  });
  it('keeps polling pending authorization, then consumes a successful credential once', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockResolvedValueOnce(pending).mockResolvedValue(token);
    const callbacks = handlers();
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(callbacks);
    await vi.advanceTimersByTimeAsync(10000);
    expect(callbacks.onAuthorized).toHaveBeenCalledExactlyOnceWith({ accessToken: 'fixture-token' });
    expect(Browser.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100000);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('increases the interval by at least five seconds on slow_down', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockResolvedValueOnce({ ...pending, data: { error: 'slow_down', interval: 7 } }).mockResolvedValue(pending);
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(handlers());
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(9999);
    expect(transport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('expires locally without another token request', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => ({ ...codeResponse, data: { ...codeResponse.data, expires_in: 3 } }));
    const callbacks = handlers();
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(callbacks);
    await vi.advanceTimersByTimeAsync(3000);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });
  it.each(['access_denied', 'expired_token', 'token_expired', 'device_flow_disabled', 'incorrect_client_credentials'])('stops on %s without exposing arbitrary response text', async error => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockResolvedValue({ status: 200, headers: {}, data: { error, error_description: 'do-not-display-fixture' } });
    const callbacks = handlers();
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(callbacks);
    await vi.advanceTimersByTimeAsync(20000);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(callbacks.onError).mock.calls[0][0])).not.toContain('do-not-display-fixture');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('retains the code and backs off on a temporary network error', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(token);
    const callbacks = handlers();
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(callbacks);
    await vi.advanceTimersByTimeAsync(5000);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onCode).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(callbacks.onAuthorized).toHaveBeenCalledTimes(1);
  });
  it('discards an in-flight result after cancellation', async () => {
    let finish!: (result: JsonResponse) => void;
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const callbacks = handlers();
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(callbacks);
    await vi.advanceTimersByTimeAsync(5000);
    flow.cancel();
    finish(token);
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.onAuthorized).not.toHaveBeenCalled();
  });
  it('rejects an unexpected verification host', async () => {
    flow = new GitHubDeviceFlow(async () => ({ ...codeResponse, data: { ...codeResponse.data, verification_uri: 'https://attacker.invalid/login' } }));
    await expect(flow.begin(handlers())).rejects.toThrow('有效的用户码');
  });
  it('opens only the fixed official verification URL when the user requests it', async () => {
    flow = new GitHubDeviceFlow(async () => codeResponse);
    await flow.begin(handlers());
    await flow.openVerification();
    expect(Browser.open).toHaveBeenCalledWith({ url: 'https://github.com/login/device', toolbarColor: '#101319' });
  });
  it('resumes an overdue poll without creating an extra poll loop', async () => {
    const transport = vi.fn(async (): Promise<JsonResponse> => codeResponse).mockResolvedValueOnce(codeResponse).mockResolvedValue(pending);
    flow = new GitHubDeviceFlow(transport);
    await flow.begin(handlers());
    vi.setSystemTime(Date.now() + 6000);
    flow.resume(); flow.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
