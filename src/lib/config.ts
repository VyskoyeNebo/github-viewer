import { SafeError } from './errors';

export const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'YOUR_GITHUB_CLIENT_ID';
export const VERIFICATION_URI = 'https://github.com/login/device';

export function validateConfig() {
  if (CLIENT_ID === 'YOUR_GITHUB_CLIENT_ID' || !/^[A-Za-z0-9._-]{1,128}$/.test(CLIENT_ID)) {
    throw new SafeError('请先创建 GitHub OAuth App、启用 Device Flow，并在 .env.local 填写 Client ID 后重新构建 APK。');
  }
}
