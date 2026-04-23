import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getDesktopEnv, getMissingDesktopEnv } from './desktop-env.mjs';

const require = createRequire(import.meta.url);
const concurrentlyBin = path.join(path.dirname(require.resolve('concurrently')), 'dist', 'bin', 'concurrently.js');
const electronBinary = require('electron');

const env = getDesktopEnv(process.cwd());
const missing = getMissingDesktopEnv(env);

if (missing.length > 0) {
  console.error(`Missing desktop environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

function spawnAndWait(command, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, args, options);
    child.on('exit', code => resolve(code ?? 0));
  });
}

function runElectronNativeCheck() {
  return new Promise(resolve => {
    const probePath = path.join(os.tmpdir(), `myhealth-electron-native-check-${Date.now()}.cjs`);
    fs.writeFileSync(
      probePath,
      "require(require.resolve('better-sqlite3', { paths: [process.cwd()] })); console.log('desktop_native_ok'); process.exit(0);\n",
      'utf8'
    );

    const child = spawn(electronBinary, [probePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: { ...process.env, ...env },
    });

    let output = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fs.rmSync(probePath, { force: true });
      resolve(result);
    };

    child.stdout.on('data', chunk => {
      output += String(chunk);
      if (output.includes('desktop_native_ok')) {
        child.kill('SIGTERM');
        finish({ ok: true, detail: output.trim() });
      }
    });

    child.stderr.on('data', chunk => {
      output += String(chunk);
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: output.includes('desktop_native_ok'), detail: output.trim() });
    }, 5000);

    child.on('exit', code => {
      finish({ ok: code === 0 && output.includes('desktop_native_ok'), detail: output.trim() });
    });
  });
}

async function ensureElectronNativeModuleReady() {
  const nativeCheck = await runElectronNativeCheck();
  if (nativeCheck.ok) return true;

  console.warn('Electron native module check failed. Rebuilding better-sqlite3 for Electron before launch...');
  if (nativeCheck.detail) {
    console.warn(nativeCheck.detail);
  }

  const rebuildCode = await spawnAndWait('npm', ['run', 'desktop:rebuild-native'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
  });

  if (rebuildCode !== 0) {
    console.error('Unable to rebuild Electron native modules automatically.');
    process.exit(rebuildCode);
  }

  const retryCheck = await runElectronNativeCheck();
  if (!retryCheck.ok) {
    console.error('Electron native module check still failed after rebuild.');
    if (retryCheck.detail) {
      console.error(retryCheck.detail);
    }
    process.exit(1);
  }

  console.log('Electron native modules rebuilt successfully.');
  return true;
}

const apiPort = Number(env.API_PORT || 4001);
const vitePort = Number(env.VITE_PORT || 8080);
const viteHost = env.VITE_HOST || '127.0.0.1';
const rendererUrl = `http://${viteHost}:${vitePort}`;

await ensureElectronNativeModuleReady();

const child = spawn(
  process.execPath,
  [
    concurrentlyBin,
    'npm run api',
    `npm run dev -- --host ${viteHost} --port ${vitePort} --strictPort`,
    `wait-on tcp:${apiPort} tcp:${vitePort} && cross-env ELECTRON_RENDERER_URL=${rendererUrl} electron electron/main.cjs`,
  ],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
  }
);

child.on('exit', code => {
  process.exit(code ?? 0);
});
