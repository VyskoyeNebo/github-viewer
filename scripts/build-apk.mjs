import { spawnSync } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/c', 'gradlew.bat', ':app:assembleDebug', '--no-daemon'] : [':app:assembleDebug', '--no-daemon'], { cwd: path.join(root, 'android'), stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir(path.join(root, 'outputs'), { recursive: true });
await copyFile(path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'), path.join(root, 'outputs/GitHub-Viewer-debug.apk'));
console.log('APK: outputs/GitHub-Viewer-debug.apk');
