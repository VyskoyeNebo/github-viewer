import { Capacitor, registerPlugin } from '@capacitor/core';
import type { StoredCredential } from '../types';
import { StorageError, SafeError } from './errors';

interface SecureVaultPlugin {
  get(): Promise<{ value: string | null }>;
  set(options: { value: string }): Promise<void>;
  remove(): Promise<void>;
}
const SecureVault = registerPlugin<SecureVaultPlugin>('SecureVault');

export interface CredentialStore {
  read(): Promise<StoredCredential | null>;
  write(credential: StoredCredential): Promise<void>;
  clear(): Promise<void>;
}

export function isAndroid(): boolean { return Capacitor.getPlatform() === 'android'; }

function requireAndroid() {
  if (!isAndroid()) throw new SafeError('请安装 Android APK 使用登录。网页预览不保存或接收登录凭据。');
}

export const credentialStore: CredentialStore = {
  async read() {
    requireAndroid();
    try {
      const { value } = await SecureVault.get();
      if (value === null) return null;
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || !('accessToken' in parsed) || typeof parsed.accessToken !== 'string' || !parsed.accessToken ||
          ('expiresAt' in parsed && (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)))) throw new StorageError();
      return parsed as StoredCredential;
    } catch { throw new StorageError(); }
  },
  async write(credential) {
    requireAndroid();
    try { await SecureVault.set({ value: JSON.stringify(credential) }); }
    catch { throw new StorageError(); }
  },
  async clear() {
    requireAndroid();
    try { await SecureVault.remove(); }
    catch { throw new StorageError(); }
  },
};
