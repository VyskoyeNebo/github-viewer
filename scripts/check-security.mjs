import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(name));
    else if (/\.(ts|tsx|js|java|html|xml)$/.test(name)) result.push(name);
  }
  return result;
}
for (const file of [...await files(path.join(root, 'src')), ...await files(path.join(root, 'android/app/src/main/java')), ...await files(path.join(root, 'dist'))]) {
  const source = await readFile(file, 'utf8');
  assert(!source.includes(['client', 'secret'].join('_')), `Forbidden OAuth parameter: ${file}`);
  assert(!/localStorage\s*\./.test(source), `Plain local storage: ${file}`);
  // Bundled React reports framework errors; application code must never log credentials or native errors.
  if (!file.startsWith(path.join(root, 'dist'))) assert(!/console\.(log|debug|info|warn|error)\(/.test(source), `Application runtime logging: ${file}`);
  assert(!/(?:gh[opusr]_|github_pat_)[A-Za-z0-9_]{20,}/.test(source), `Possible embedded credential: ${file}`);
}
const manifest = await readFile(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
assert(manifest.includes('android:allowBackup="false"'));
assert(!manifest.includes('android.intent.action.VIEW'));
assert(manifest.includes('android:launchMode="singleTask"'));
const config = await readFile(path.join(root, 'capacitor.config.ts'), 'utf8');
assert(config.includes("loggingBehavior: 'none'"));
assert(config.includes('webContentsDebuggingEnabled: false'));
console.log('Security source checks passed. Native disk encryption still requires device verification.');
