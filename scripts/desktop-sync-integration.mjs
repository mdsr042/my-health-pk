import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { getDesktopEnv, getMissingDesktopEnv } from './desktop-env.mjs';

const env = getDesktopEnv(process.cwd());
const missing = getMissingDesktopEnv(env);
const apiBase = `http://127.0.0.1:${env.API_PORT || 4001}/api`;

function logResult(label, ok, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${details ? `: ${details}` : ''}`);
}

let failedChecks = 0;

function assertResult(label, ok, details = '') {
  if (!ok) failedChecks += 1;
  logResult(label, ok, details);
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

async function request(path, init = {}, token = '') {
  const response = await fetch(`${apiBase}${path}`, {
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

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureAdmin() {
  const { response, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Admin login failed: ${body.error || response.status}`);
  }
  return body.token;
}

async function main() {
  if (missing.length > 0) {
    console.error(`Missing desktop environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

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

  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();

  try {
    const apiReady = await waitForApi();
    if (!apiReady) {
      throw new Error('API did not become ready for integration checks.');
    }
    assertResult('api-ready', true, apiBase);

    const doctorEmail = `${uniqueId('dr.sync')}@myhealth.pk`;
    const doctorPassword = 'Doctor123';
    const signupPayload = {
      fullName: 'Dr Sync',
      email: doctorEmail,
      phone: '03001234567',
      password: doctorPassword,
      pmcNumber: uniqueId('PMC'),
      specialization: 'Internal Medicine',
      qualifications: 'MBBS',
      clinicName: 'Sync Test Clinic',
      city: 'Lahore',
      notes: 'desktop integration test',
    };

    const signup = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(signupPayload),
    });
    assertResult('signup-doctor', signup.response.ok, signup.body.message || signup.body.error || '');
    if (!signup.response.ok) throw new Error(signup.body.error || 'Doctor signup failed');

    const adminToken = await ensureAdmin();
    const approvals = await request('/admin/approval-requests', {}, adminToken);
    const pending = (approvals.body.data || []).find(item => item.user?.email === doctorEmail);
    if (!pending) throw new Error('Pending approval not found for integration doctor');

    const approval = await request(`/admin/approval-requests/${pending.id}/approve`, { method: 'POST' }, adminToken);
    assertResult('approve-doctor', approval.response.ok);
    if (!approval.response.ok) throw new Error(approval.body.error || 'Doctor approval failed');

    const doctorLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: doctorEmail, password: doctorPassword }),
    });
    assertResult('doctor-login', doctorLogin.response.ok);
    if (!doctorLogin.response.ok) throw new Error(doctorLogin.body.error || 'Doctor login failed');
    const doctorToken = doctorLogin.body.token;
    const clinicId = doctorLogin.body.session.clinics[0].id;

    const register = await request('/desktop/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: uniqueId('device'),
        deviceName: 'Integration Test Device',
        platform: 'integration',
        appVersion: '0.0.0-test',
      }),
    }, doctorToken);
    assertResult('device-register', register.response.ok);

    const bootstrap = await request('/desktop/bootstrap', {}, doctorToken);
    assertResult('desktop-bootstrap', bootstrap.response.ok, `patients=${bootstrap.body.data?.patients?.length ?? 0}`);

    const entitlement = await request('/desktop/entitlement', {}, doctorToken);
    assertResult('desktop-entitlement', entitlement.response.ok, entitlement.body.data?.status || '');

    const patientId = uniqueId('patient');
    const patientMutationId = uniqueId('mut-patient');
    const patientBundleId = uniqueId('bundle-patient');
    const pushAccepted = await request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        bundles: [
          {
            bundleId: patientBundleId,
            bundleType: 'patient_master',
            rootEntityId: patientId,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'patient',
            entityId: patientId,
            mutations: [
              {
                mutationId: patientMutationId,
                bundleId: patientBundleId,
                bundleType: 'patient_master',
                rootEntityId: patientId,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'patient',
                entityId: patientId,
                operationType: 'create',
                payload: {
                  id: patientId,
                  mrn: `MRN-${Date.now().toString().slice(-8)}`,
                  name: 'Desktop Sync Patient',
                  phone: '03110000000',
                  age: 35,
                  gender: 'Male',
                  cnic: '',
                  address: '',
                  bloodGroup: '',
                  emergencyContact: '',
                },
              },
            ],
          },
        ],
      }),
    }, doctorToken);
    const acceptedResult = pushAccepted.body.data.results[0];
    assertResult('sync-push-accepted', acceptedResult?.status === 'accepted', acceptedResult?.status || '');

    const pushAlreadyProcessed = await request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        bundles: [
          {
            bundleId: patientBundleId,
            bundleType: 'patient_master',
            rootEntityId: patientId,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'patient',
            entityId: patientId,
            mutations: [
              {
                mutationId: patientMutationId,
                bundleId: patientBundleId,
                bundleType: 'patient_master',
                rootEntityId: patientId,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'patient',
                entityId: patientId,
                operationType: 'create',
                payload: {},
              },
            ],
          },
        ],
      }),
    }, doctorToken);
    assertResult('sync-push-idempotent', pushAlreadyProcessed.body.data.results[0]?.status === 'accepted_already_processed', pushAlreadyProcessed.body.data.results[0]?.status || '');

    const secondPatient = await request('/patients', {
      method: 'POST',
      body: JSON.stringify({
        id: uniqueId('patient'),
        mrn: `MRN-${Date.now().toString().slice(-8)}-2`,
        name: 'Another Patient',
        phone: '03220000000',
        age: 28,
        gender: 'Female',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
      }),
    }, doctorToken);
    const firstAppointment = await request('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        id: uniqueId('appt'),
        patientId,
        clinicId,
        date: '2026-04-23',
        time: '09:00',
        status: 'waiting',
        type: 'new',
        chiefComplaint: 'Review',
        tokenNumber: 0,
      }),
    }, doctorToken);
    const secondAppointment = await request('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        id: uniqueId('appt'),
        patientId: secondPatient.body.data.id,
        clinicId,
        date: '2026-04-23',
        time: '09:15',
        status: 'waiting',
        type: 'new',
        chiefComplaint: 'Review 2',
        tokenNumber: 0,
      }),
    }, doctorToken);
    await request(`/appointments/${firstAppointment.body.data.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in-consultation' }),
    }, doctorToken);

    const mixedBundleOk = uniqueId('bundle-mixed-ok');
    const mixedBundleConflict = uniqueId('bundle-mixed-conflict');
    const mixedBundleValidation = uniqueId('bundle-mixed-validation');
    const pushMixed = await request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        bundles: [
          {
            bundleId: mixedBundleOk,
            bundleType: 'patient_master',
            rootEntityId: secondPatient.body.data.id,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'patient',
            entityId: secondPatient.body.data.id,
            mutations: [
              {
                mutationId: uniqueId('mut-ok'),
                bundleId: mixedBundleOk,
                bundleType: 'patient_master',
                rootEntityId: secondPatient.body.data.id,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'patient',
                entityId: secondPatient.body.data.id,
                operationType: 'update',
                payload: {
                  ...secondPatient.body.data,
                  phone: '03220000001',
                },
              },
            ],
          },
          {
            bundleId: mixedBundleConflict,
            bundleType: 'encounter',
            rootEntityId: secondAppointment.body.data.id,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'appointment',
            entityId: secondAppointment.body.data.id,
            mutations: [
              {
                mutationId: uniqueId('mut-conflict'),
                bundleId: mixedBundleConflict,
                bundleType: 'encounter',
                rootEntityId: secondAppointment.body.data.id,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'appointment',
                entityId: secondAppointment.body.data.id,
                operationType: 'status_update',
                payload: { status: 'in-consultation' },
              },
            ],
          },
          {
            bundleId: mixedBundleValidation,
            bundleType: 'encounter',
            rootEntityId: 'missing-appointment',
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'appointment',
            entityId: 'missing-appointment',
            mutations: [
              {
                mutationId: uniqueId('mut-validation'),
                bundleId: mixedBundleValidation,
                bundleType: 'encounter',
                rootEntityId: 'missing-appointment',
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'appointment',
                entityId: 'missing-appointment',
                operationType: 'status_update',
                payload: { status: 'completed' },
              },
            ],
          },
        ],
      }),
    }, doctorToken);

    const statuses = pushMixed.body.data.results.map(item => item.status);
    assertResult('sync-push-partial-mixed', statuses.includes('accepted') && statuses.includes('conflict') && statuses.includes('validation_rejected'), statuses.join(', '));

    const draftPayload = {
      appointmentId: secondAppointment.body.data.id,
      patientId: secondPatient.body.data.id,
      clinicId,
      chiefComplaint: 'Draft test',
      hpi: '',
      pastHistory: '',
      allergies: '',
      examination: '',
      assessment: '',
      plan: '',
      instructions: '',
      followUp: '',
      vitals: {},
      diagnoses: [],
      medications: [],
      labOrders: [],
      procedures: [],
      careActions: [],
      savedAt: new Date().toISOString(),
    };
    await request(`/consultation-drafts/${secondAppointment.body.data.id}`, {
      method: 'PUT',
      body: JSON.stringify(draftPayload),
    }, doctorToken);

    const draftConflictBundleId = uniqueId('bundle-draft-conflict');
    const draftConflict = await request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        bundles: [
          {
            bundleId: draftConflictBundleId,
            bundleType: 'encounter',
            rootEntityId: secondAppointment.body.data.id,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'consultation_draft',
            entityId: secondAppointment.body.data.id,
            mutations: [
              {
                mutationId: uniqueId('mut-draft-conflict'),
                bundleId: draftConflictBundleId,
                bundleType: 'encounter',
                rootEntityId: secondAppointment.body.data.id,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'consultation_draft',
                entityId: secondAppointment.body.data.id,
                operationType: 'upsert',
                baseVersion: 'stale-base-version',
                payload: { ...draftPayload, chiefComplaint: 'Conflicting draft change' },
              },
            ],
          },
        ],
      }),
    }, doctorToken);
    assertResult('sync-push-draft-conflict', draftConflict.body.data.results[0]?.status === 'conflict', draftConflict.body.data.results[0]?.status || '');
    assertResult(
      'sync-push-draft-conflict-payload',
      draftConflict.body.data.results[0]?.conflictType === 'draft_conflict'
        && Boolean(draftConflict.body.data.results[0]?.serverSnapshot)
        && Boolean(draftConflict.body.data.results[0]?.serverBaseVersion),
      JSON.stringify(draftConflict.body.data.results[0] || {})
    );

    const patientConflictBundleId = uniqueId('bundle-patient-conflict');
    const patientConflict = await request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        bundles: [
          {
            bundleId: patientConflictBundleId,
            bundleType: 'patient_master',
            rootEntityId: secondPatient.body.data.id,
            deviceId: register.body.data.deviceId,
            workspaceId: doctorLogin.body.session.workspace.id,
            entityType: 'patient',
            entityId: secondPatient.body.data.id,
            mutations: [
              {
                mutationId: uniqueId('mut-patient-conflict'),
                bundleId: patientConflictBundleId,
                bundleType: 'patient_master',
                rootEntityId: secondPatient.body.data.id,
                deviceId: register.body.data.deviceId,
                workspaceId: doctorLogin.body.session.workspace.id,
                entityType: 'patient',
                entityId: secondPatient.body.data.id,
                operationType: 'update',
                baseVersion: 'stale-patient-base-version',
                payload: {
                  ...secondPatient.body.data,
                  address: 'Conflicting local address',
                },
              },
            ],
          },
        ],
      }),
    }, doctorToken);
    assertResult(
      'sync-push-patient-conflict',
      patientConflict.body.data.results[0]?.status === 'conflict'
        && patientConflict.body.data.results[0]?.conflictType === 'patient_conflict',
      JSON.stringify(patientConflict.body.data.results[0] || {})
    );

    const pull = await request('/sync/pull', {}, doctorToken);
    const pullChanges = pull.body.data?.changes || {};
    assertResult(
      'sync-pull-grouped-deltas',
      pull.response.ok
        && pull.body.data?.checkpointStatus === 'ok'
        && Array.isArray(pullChanges.patients)
        && Array.isArray(pullChanges.appointments),
      `checkpoint=${pull.body.data?.checkpoint || ''}`
    );

    const invalidCheckpointPull = await request('/sync/pull?checkpoint=not-a-real-checkpoint', {}, doctorToken);
    assertResult(
      'sync-pull-invalid-checkpoint',
      invalidCheckpointPull.response.ok
        && invalidCheckpointPull.body.data?.rebuildRequired === true
        && invalidCheckpointPull.body.data?.checkpointStatus === 'unknown_checkpoint',
      JSON.stringify(invalidCheckpointPull.body.data || {})
    );

    const futureCheckpoint = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const futureCheckpointPull = await request(`/sync/pull?checkpoint=${encodeURIComponent(futureCheckpoint)}`, {}, doctorToken);
    assertResult(
      'sync-pull-future-checkpoint',
      futureCheckpointPull.response.ok
        && futureCheckpointPull.body.data?.rebuildRequired === true
        && futureCheckpointPull.body.data?.checkpointStatus === 'unknown_checkpoint',
      JSON.stringify(futureCheckpointPull.body.data || {})
    );

    const processed = await pg.query(`SELECT mutation_id, bundle_id, result_status FROM processed_mutations WHERE mutation_id = ANY($1::text[]) ORDER BY mutation_id ASC`, [[patientMutationId]]);
    assertResult('trace-server-processed-mutation', processed.rows.length === 1 && processed.rows[0].result_status === 'accepted', JSON.stringify(processed.rows));
    const processedBundle = await pg.query(`SELECT bundle_id, result_status FROM processed_bundles WHERE bundle_id = $1`, [patientBundleId]);
    assertResult('trace-server-processed-bundle', processedBundle.rows.length === 1 && processedBundle.rows[0].result_status === 'accepted', JSON.stringify(processedBundle.rows));

    if (failedChecks > 0) {
      throw new Error(`Desktop sync integration finished with ${failedChecks} failed checks.`);
    }
  } finally {
    await pg.end().catch(() => undefined);
    server.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
