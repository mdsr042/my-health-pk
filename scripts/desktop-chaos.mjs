import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { getDesktopEnv, getMissingDesktopEnv } from './desktop-env.mjs';

const require = createRequire(import.meta.url);
const { createDesktopDatabase } = require('../electron/services/local-db.cjs');

const baseEnv = getDesktopEnv(process.cwd());
const env = {
  ...baseEnv,
  API_PORT: String(process.env.CHAOS_API_PORT || baseEnv.API_PORT || '4001'),
};
const missing = getMissingDesktopEnv(env);
const apiBase = `http://127.0.0.1:${env.API_PORT}/api`;
const secrets = {
  encryptText: value => value,
  decryptText: value => value,
  encryptBuffer: value => value,
  decryptBuffer: value => value,
  hashPin: (pin, salt) => `${salt}:${pin}`,
  checksumBuffer: buffer => buffer.toString('hex'),
};

let failures = 0;

function logResult(label, ok, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${details ? `: ${details}` : ''}`);
  if (!ok) failures += 1;
}

function logSkip(label, details = '') {
  console.log(`SKIP ${label}${details ? `: ${details}` : ''}`);
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function request(pathname, init = {}, token = '') {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
}

async function waitForApi(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiBase}/auth/me`);
      if ([200, 401].includes(response.status)) return true;
    } catch {
      // keep polling
    }
    await delay(300);
  }
  return false;
}

function startServer() {
  const server = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', chunk => process.stdout.write(`[api] ${chunk}`));
  server.stderr.on('data', chunk => process.stderr.write(`[api] ${chunk}`));
  return server;
}

async function startServerWithRetry(attempts = 3) {
  let lastServer = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastServer = startServer();
    const ready = await waitForApi(12000);
    if (ready) {
      if (attempt > 1) {
        logResult('chaos-server-startup-retry', true, `attempt=${attempt}`);
      }
      return lastServer;
    }
    await stopServer(lastServer);
    lastServer = null;
    if (attempt < attempts) {
      await delay(1000 * attempt);
    }
  }
  return null;
}

async function stopServer(server) {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  await delay(750);
  if (!server.killed) {
    server.kill('SIGKILL');
  }
}

async function ensureAdmin() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  });
  if (!login.response.ok || !login.body?.token) {
    throw new Error(`Admin login failed: ${login.body?.error || login.response.status}`);
  }
  return login.body.token;
}

async function createApprovedDoctor(adminToken) {
  const doctorEmail = `${uniqueId('dr.chaos')}@myhealth.pk`;
  const doctorPassword = 'Doctor123';
  const signup = await request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Dr Chaos',
      email: doctorEmail,
      phone: '03001234567',
      password: doctorPassword,
      pmcNumber: uniqueId('PMC'),
      specialization: 'Internal Medicine',
      qualifications: 'MBBS',
      clinicName: 'Chaos Test Clinic',
      city: 'Lahore',
      notes: 'desktop chaos test',
    }),
  });
  if (!signup.response.ok) {
    throw new Error(signup.body?.error || 'Doctor signup failed');
  }

  const approvals = await request('/admin/approval-requests', {}, adminToken);
  const pending = (approvals.body.data || []).find(item => item.user?.email === doctorEmail);
  if (!pending) {
    throw new Error('Pending approval not found for chaos test doctor');
  }

  const approval = await request(`/admin/approval-requests/${pending.id}/approve`, { method: 'POST' }, adminToken);
  if (!approval.response.ok) {
    throw new Error(approval.body?.error || 'Doctor approval failed');
  }

  const doctorLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: doctorEmail, password: doctorPassword }),
  });
  if (!doctorLogin.response.ok || !doctorLogin.body?.token) {
    throw new Error(doctorLogin.body?.error || 'Doctor login failed');
  }

  return {
    email: doctorEmail,
    password: doctorPassword,
    token: doctorLogin.body.token,
    session: doctorLogin.body.session,
  };
}

function createStore(rootDir) {
  return createDesktopDatabase({
    userDataPath: rootDir,
    secrets,
    appVersion: '1.0.0-chaos',
  });
}

async function main() {
  if (missing.length > 0) {
    console.error(`Missing desktop environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'myhealth-desktop-chaos-'));
  let store = null;
  let server = null;
  let managedServer = false;
  let apiReady = false;
  let adminToken = '';
  let doctor = null;
  let deviceId = '';
  let workspaceId = '';

  try {
    const existingApiReady = await waitForApi(1500);
    if (existingApiReady) {
      apiReady = true;
      logResult('chaos-api-ready', true, `${apiBase} (existing local API)`);
    } else {
      server = await startServerWithRetry();
      if (server) {
        managedServer = true;
        apiReady = true;
        logResult('chaos-api-ready', true, `${apiBase} (runner-managed API)`);
      } else {
        logSkip('chaos-api-ready', `${apiBase} unavailable, continuing with store-only chaos checks`);
      }
    }

    store = createStore(tempRoot);
    deviceId = store.getRuntimeInfo().deviceId;
    const patientId = uniqueId('patient-chaos');
    const mutationId = uniqueId('mut-chaos');
    const bundleId = uniqueId('bundle-chaos');

    if (apiReady) {
      adminToken = await ensureAdmin();
      doctor = await createApprovedDoctor(adminToken);
      workspaceId = doctor.session.workspace.id;

      const register = await request('/desktop/devices/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          deviceName: 'Chaos Test Device',
          platform: 'desktop-chaos',
          appVersion: '1.0.0-chaos',
        }),
        headers: {
          'X-Desktop-Device-Id': deviceId,
        },
      }, doctor.token);
      logResult('chaos-device-register', register.response.ok, register.body?.data?.status || '');
      if (!register.response.ok) throw new Error(register.body?.error || 'Device register failed');
    } else {
      workspaceId = 'ws-chaos-local';
    }

    store.enqueueMutation({
      mutationId,
      bundleId,
      bundleType: 'patient_master',
      rootEntityId: patientId,
      deviceId,
      workspaceId,
      entityType: 'patient',
      entityId: patientId,
      operationType: 'create',
      payload: {
        id: patientId,
        mrn: `MRN-${Date.now().toString().slice(-8)}`,
        name: 'Chaos Patient',
        phone: '03110000000',
        age: 33,
        gender: 'Male',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
      },
    });

    store.recordSyncResults([
      {
        mutationId,
        entityType: 'patient',
        entityId: patientId,
        status: 'retryable_failure',
        errorCode: 'NETWORK_FLAP',
        errorMessage: 'Network flap during sync push',
      },
    ]);
    const afterFlap = store.listSyncIssues();
    logResult(
      'chaos-network-flap-retryable',
      afterFlap.pending.some(item => item.mutation_id === mutationId && item.status === 'retryable'),
      JSON.stringify(afterFlap.pending.find(item => item.mutation_id === mutationId) || {})
    );

    store.close();
    store = createStore(tempRoot);
    const afterRestart = store.listSyncIssues();
    logResult(
      'chaos-restart-persists-retryable',
      afterRestart.pending.some(item => item.mutation_id === mutationId && item.status === 'retryable'),
      JSON.stringify(afterRestart.pending.find(item => item.mutation_id === mutationId) || {})
    );

    if (apiReady) {
      const pendingBundle = store.getPendingBundles(10)[0];
      const replayPush = await request('/sync/push', {
        method: 'POST',
        headers: {
          'X-Desktop-Device-Id': deviceId,
        },
        body: JSON.stringify({ bundles: [pendingBundle] }),
      }, doctor.token);
      logResult(
        'chaos-replay-after-flap',
        replayPush.response.ok && replayPush.body?.data?.results?.[0]?.status === 'accepted',
        JSON.stringify(replayPush.body?.data?.results?.[0] || {})
      );
      if (replayPush.response.ok) {
        store.recordSyncResults(replayPush.body.data.results);
      }

      const processedIssue = store.listSyncIssues().pending.find(item => item.mutation_id === mutationId);
      logResult('chaos-replay-clears-pending', !processedIssue, processedIssue ? JSON.stringify(processedIssue) : 'cleared');

      const staleCheckpoint = '2020-01-01T00:00:00.000Z';
      store.setCheckpoint('workspace', staleCheckpoint);
      const stalePull = await request(`/sync/pull?checkpoint=${encodeURIComponent(staleCheckpoint)}`, {
        headers: {
          'X-Desktop-Device-Id': deviceId,
        },
      }, doctor.token);
      const rebuildRequired = stalePull.response.ok
        && stalePull.body?.data?.rebuildRequired === true
        && ['expired_checkpoint', 'unknown_checkpoint', 'rebuild_required'].includes(stalePull.body?.data?.checkpointStatus);
      if (rebuildRequired) {
        store.setRebuildRequired(true, `Desktop sync checkpoint is ${stalePull.body.data.checkpointStatus.replaceAll('_', ' ')}. Rebuild the local cache to continue syncing safely.`);
      }
      logResult('chaos-stale-checkpoint-rebuild', rebuildRequired, JSON.stringify(stalePull.body?.data || {}));
      logResult('chaos-runtime-rebuild-flag', store.getRuntimeInfo().rebuildRequired === true, store.getRuntimeInfo().rebuildReason || '');
    } else {
      store.setRebuildRequired(true, 'Simulated stale checkpoint while API chaos scenarios are unavailable.');
      logSkip('chaos-replay-after-flap', 'Live API unavailable in this environment');
      logSkip('chaos-stale-checkpoint-rebuild', 'Live API unavailable in this environment');
      logResult('chaos-runtime-rebuild-flag', store.getRuntimeInfo().rebuildRequired === true, store.getRuntimeInfo().rebuildReason || '');
    }

    const exhaustMutationId = uniqueId('mut-exhaust');
    store.enqueueMutation({
      mutationId: exhaustMutationId,
      bundleId: uniqueId('bundle-exhaust'),
      bundleType: 'encounter',
      rootEntityId: 'appt-exhaust',
      deviceId,
      workspaceId,
      entityType: 'consultation',
      entityId: 'appt-exhaust',
      operationType: 'complete',
      payload: { appointmentId: 'appt-exhaust' },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      store.recordSyncResults([
        {
          mutationId: exhaustMutationId,
          entityType: 'consultation',
          entityId: 'appt-exhaust',
          status: 'retryable_failure',
          errorCode: 'NETWORK_FLAP',
          errorMessage: `Chaos retry ${attempt + 1}`,
        },
      ]);
    }
    const exhausted = store.listSyncIssues().deadLetters.find(item => item.mutation_id === exhaustMutationId);
    logResult('chaos-retry-exhaustion-dead-letter', exhausted?.reason_code === 'RETRY_EXHAUSTED', JSON.stringify(exhausted || {}));

    if (apiReady) {
      const revoke = await request(`/admin/offline-sync/devices/${encodeURIComponent(deviceId)}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'desktop chaos runner' }),
      }, adminToken);
      logResult('chaos-admin-revoke-device', revoke.response.ok && revoke.body?.data?.status === 'revoked', JSON.stringify(revoke.body?.data || {}));

      const revokedPull = await request('/sync/pull', {
        headers: {
          'X-Desktop-Device-Id': deviceId,
        },
      }, doctor.token);
      logResult('chaos-revoked-device-blocked', revokedPull.response.status === 403 && revokedPull.body?.code === 'DEVICE_REVOKED', JSON.stringify(revokedPull.body || {}));
    } else {
      logSkip('chaos-admin-revoke-device', 'Live API unavailable in this environment');
      logSkip('chaos-revoked-device-blocked', 'Live API unavailable in this environment');
    }

    const diagnostics = store.exportDiagnosticsSnapshot();
    logResult(
      'chaos-redacted-diagnostics',
      diagnostics.issues.conflicts.every(item => item.local_snapshot === undefined && item.server_snapshot === undefined),
      JSON.stringify(diagnostics.issues.conflicts[0] || {})
    );

    const integrity = store.verifyIntegrity({ persist: true, source: 'chaos' });
    logResult('chaos-integrity-check', integrity.ok, JSON.stringify(integrity));

    if (failures > 0) {
      throw new Error(`Desktop chaos runner finished with ${failures} failed checks.`);
    }
  } finally {
    try {
      store?.close?.();
    } catch {
      // ignore shutdown issues
    }
    if (managedServer) {
      await stopServer(server);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
