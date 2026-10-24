import { describe, expect, it, vi } from 'vitest';
import { SessionController } from '../src/lib/session';
import { StorageError, UnauthorizedError } from '../src/lib/errors';
import type { DeviceFlowHandlers } from '../src/lib/device-flow';
import type { StoredCredential, DashboardData } from '../src/types';

const data: DashboardData = { user: { id: 1, login: 'fixture', name: 'Fixture', avatar_url: '', bio: null, public_repos: 0, followers: 0, following: 0 }, repositories: [] };
function setup(initial: StoredCredential | null = { accessToken: 'fixture-token' }) {
  const store = { read: vi.fn(async () => initial), write: vi.fn(async (_value: StoredCredential) => {}), clear: vi.fn(async () => {}) };
  let handlers!: DeviceFlowHandlers;
  const flow = {
    begin: vi.fn(async (callbacks: DeviceFlowHandlers) => {
      handlers = callbacks;
      callbacks.onCode({ userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 900000 });
    }), cancel: vi.fn(), resume: vi.fn(), openVerification: vi.fn(async () => {}),
  };
  const api = { dashboard: vi.fn(async (_token: string) => data) };
  return { store, flow, api, session: new SessionController(store, flow, api), authorized: () => handlers.onAuthorized({ accessToken: 'fixture-token' }), getHandlers: () => handlers };
}

describe('Session lifecycle', () => {
  it('restores a credential without requesting a device code or opening the browser', async () => {
    const { session, flow, api } = setup();
    await session.start();
    expect(session.getSnapshot().phase).toBe('authenticated');
    expect(api.dashboard).toHaveBeenCalledWith('fixture-token');
    expect(flow.begin).not.toHaveBeenCalled();
    expect(flow.openVerification).not.toHaveBeenCalled();
  });
  it('automatically requests a device code on first launch but waits for a user gesture to open the browser', async () => {
    const { session, flow, api } = setup(null);
    await session.start();
    expect(session.getSnapshot()).toMatchObject({ phase: 'authorizing', device: { userCode: 'WDJB-MJHT' }, busy: false });
    expect(flow.begin).toHaveBeenCalledTimes(1);
    expect(api.dashboard).not.toHaveBeenCalled();
    expect(flow.openVerification).not.toHaveBeenCalled();
    await session.openVerification();
    expect(flow.openVerification).toHaveBeenCalledTimes(1);
  });
  it('clears a 401 credential and requests a new device code', async () => {
    const { session, api, store, flow } = setup();
    api.dashboard.mockRejectedValueOnce(new UnauthorizedError());
    await session.start();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ phase: 'authorizing', hasCredential: false, data: null });
    expect(flow.begin).toHaveBeenCalledTimes(1);
  });
  it('retains a credential on network error and retries directly', async () => {
    const { session, api, store, flow } = setup();
    api.dashboard.mockRejectedValueOnce(new Error('network'));
    await session.start();
    expect(session.getSnapshot()).toMatchObject({ phase: 'offline', hasCredential: true });
    expect(store.clear).not.toHaveBeenCalled();
    await session.retry();
    expect(session.getSnapshot().phase).toBe('authenticated');
    expect(flow.begin).not.toHaveBeenCalled();
  });
  it('keeps visible data on refresh failure', async () => {
    const { session, api, store } = setup();
    await session.start();
    api.dashboard.mockRejectedValueOnce(new Error('offline'));
    await session.refresh();
    expect(session.getSnapshot()).toMatchObject({ phase: 'authenticated', data, hasCredential: true });
    expect(store.clear).not.toHaveBeenCalled();
  });
  it('removes an expired credential before any API request', async () => {
    const { session, store, api, flow } = setup({ accessToken: 'fixture-token', expiresAt: Date.now() - 1000 });
    await session.start();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(api.dashboard).not.toHaveBeenCalled();
    expect(flow.begin).toHaveBeenCalledTimes(1);
  });
  it('preserves unreadable encrypted data and allows storage retry', async () => {
    const { session, store, flow } = setup();
    store.read.mockRejectedValueOnce(new StorageError());
    await session.start();
    expect(session.getSnapshot().phase).toBe('storage-error');
    expect(store.clear).not.toHaveBeenCalled();
    await session.login();
    expect(flow.begin).not.toHaveBeenCalled();
    await session.retry();
    expect(session.getSnapshot().phase).toBe('authenticated');
  });
  it('persists the returned credential before loading APIs', async () => {
    const { session, store, api, authorized } = setup(null);
    await session.start();
    await authorized();
    expect(store.write.mock.invocationCallOrder[0]).toBeLessThan(api.dashboard.mock.invocationCallOrder[0]);
    expect(session.getSnapshot()).toMatchObject({ phase: 'authenticated', device: null });
  });
  it('does not show an authenticated screen when secure persistence fails', async () => {
    const { session, store, api, authorized } = setup(null);
    store.write.mockRejectedValueOnce(new StorageError());
    await session.start();
    await authorized();
    expect(session.getSnapshot()).toMatchObject({ phase: 'guest', hasCredential: false });
    expect(api.dashboard).not.toHaveBeenCalled();
  });
  it('discards stale device authorization after cancellation', async () => {
    const { session, store, authorized } = setup(null);
    await session.start();
    session.cancelLogin();
    await authorized();
    expect(store.write).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ phase: 'guest', device: null });
  });
  it('cancels polling on logout and ignores an old refresh result', async () => {
    const { session, store, api, flow } = setup();
    await session.start();
    let finish!: (value: DashboardData) => void;
    api.dashboard.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const refresh = session.refresh();
    await session.logout();
    finish(data);
    await refresh;
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(flow.cancel).toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ phase: 'guest', hasCredential: false, data: null });
  });
  it('does not claim logout succeeded if encrypted deletion fails', async () => {
    const { session, store } = setup();
    await session.start();
    store.clear.mockRejectedValueOnce(new StorageError());
    await session.logout();
    expect(session.getSnapshot()).toMatchObject({ phase: 'storage-error', hasCredential: true });
    await session.logout();
    expect(session.getSnapshot().phase).toBe('guest');
  });
  it('keeps the credential when authorization succeeded but loading APIs is offline', async () => {
    const { session, api, authorized, store } = setup(null);
    api.dashboard.mockRejectedValueOnce(new Error('offline'));
    await session.start();
    await authorized();
    expect(session.getSnapshot()).toMatchObject({ phase: 'offline', hasCredential: true });
    expect(store.clear).not.toHaveBeenCalled();
  });
});
