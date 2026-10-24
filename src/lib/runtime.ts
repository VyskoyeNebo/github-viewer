import { App } from '@capacitor/app';
import { GitHubApi } from './github';
import { GitHubDeviceFlow } from './device-flow';
import { credentialStore, isAndroid } from './secure-storage';
import { SessionController } from './session';

export const session = new SessionController(credentialStore, new GitHubDeviceFlow(), new GitHubApi());
let initialized = false;

export async function initializeNative() {
  if (initialized || !isAndroid()) return;
  initialized = true;
  await App.addListener('appStateChange', ({ isActive }) => { if (isActive) session.resume(); });
  await session.start();
}
