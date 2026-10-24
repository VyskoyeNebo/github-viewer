import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.githubviewer',
  appName: 'GitHub Viewer',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  server: { androidScheme: 'https' },
};
export default config;
