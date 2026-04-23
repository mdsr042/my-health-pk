import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { getDesktopEnv, getMissingDesktopEnv } from './desktop-env.mjs';

const require = createRequire(import.meta.url);
const expectRunning = process.argv.includes('--expect-running');

function checkPort(host, port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const onDone = ok => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.once('timeout', () => onDone(false));
  });
}

function runElectronNativeCheck() {
  return new Promise(resolve => {
    const electronBinary = require('electron');
    const probePath = path.join(os.tmpdir(), `myhealth-electron-native-check-${Date.now()}.cjs`);
    fs.writeFileSync(
      probePath,
      "require(require.resolve('better-sqlite3', { paths: [process.cwd()] })); console.log('desktop_native_ok'); process.exit(0);\n",
      'utf8'
    );
    const child = spawn(
      electronBinary,
      [probePath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env },
      }
    );

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
        finish({
          ok: true,
          detail: output.trim(),
        });
      }
    });
    child.stderr.on('data', chunk => {
      output += String(chunk);
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        ok: output.includes('desktop_native_ok'),
        detail: output.trim(),
      });
    }, 5000);

    child.on('exit', code => {
      finish({
        ok: code === 0 && output.includes('desktop_native_ok'),
        detail: output.trim(),
      });
    });
  });
}

async function main() {
  const env = getDesktopEnv(process.cwd());
  const missing = getMissingDesktopEnv(env);
  const results = [];

  results.push({
    check: 'env',
    ok: missing.length === 0,
    message: missing.length === 0 ? 'Required desktop env vars are present.' : `Missing: ${missing.join(', ')}`,
  });

  const dbClient = new Client({ connectionString: env.DATABASE_URL });
  try {
    await dbClient.connect();
    await dbClient.query('select 1');
    results.push({ check: 'postgres', ok: true, message: 'PostgreSQL connection is working.' });
  } catch (error) {
    results.push({ check: 'postgres', ok: false, message: error instanceof Error ? error.message : 'PostgreSQL connection failed.' });
  } finally {
    await dbClient.end().catch(() => undefined);
  }

  const native = await runElectronNativeCheck();
  results.push({
    check: 'electron-native',
    ok: native.ok,
    message: native.ok ? 'Electron can load better-sqlite3.' : `Electron native module check failed. ${native.detail || ''}`.trim(),
  });

  const apiPort = Number(env.API_PORT || 4001);
  const vitePort = Number(env.VITE_PORT || 8080);
  const host = env.VITE_HOST || '127.0.0.1';

  const apiReachable = await checkPort(host, apiPort);
  const rendererReachable = await checkPort(host, vitePort);
  results.push({
    check: 'api-port',
    ok: expectRunning ? apiReachable : true,
    message: apiReachable ? `API is reachable on ${host}:${apiPort}.` : expectRunning ? `API is not reachable on ${host}:${apiPort}.` : `API is not running yet on ${host}:${apiPort}; start desktop dev to bring it up.`,
  });
  results.push({
    check: 'renderer-port',
    ok: expectRunning ? rendererReachable : true,
    message: rendererReachable ? `Renderer is reachable on ${host}:${vitePort}.` : expectRunning ? `Renderer is not reachable on ${host}:${vitePort}.` : `Renderer is not running yet on ${host}:${vitePort}; start desktop dev to bring it up.`,
  });

  const failed = results.filter(item => !item.ok);
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.check}: ${result.message}`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
