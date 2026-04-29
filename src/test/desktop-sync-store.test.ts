import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createDesktopDatabase } = require('../../electron/services/local-db.cjs');

const secrets = {
  encryptText: (value: string) => value,
  decryptText: (value: string) => value,
  encryptBuffer: (value: Buffer) => value,
  decryptBuffer: (value: Buffer) => value,
  hashPin: (pin: string, salt: string) => `${salt}:${pin}`,
  checksumBuffer: (buffer: Buffer) => buffer.toString('hex'),
};

const tempDirs: string[] = [];

function createStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myhealth-desktop-store-'));
  tempDirs.push(dir);
  return createDesktopDatabase({ userDataPath: dir, secrets });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('desktop sync store', () => {
  it('records mixed sync results in a trackable way', () => {
    const store = createStore();
    store.enqueueMutation({
      mutationId: 'mut-ok',
      bundleId: 'bundle-patient',
      bundleType: 'patient_master',
      rootEntityId: 'pt-1',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'patient',
      entityId: 'pt-1',
      operationType: 'create',
      payload: { id: 'pt-1' },
    });
    store.enqueueMutation({
      mutationId: 'mut-conflict',
      bundleId: 'bundle-encounter-conflict',
      bundleType: 'encounter',
      rootEntityId: 'appt-1',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'appointment',
      entityId: 'appt-1',
      operationType: 'status_update',
      payload: { status: 'in-consultation' },
    });
    store.enqueueMutation({
      mutationId: 'mut-invalid',
      bundleId: 'bundle-encounter-invalid',
      bundleType: 'encounter',
      rootEntityId: 'appt-missing',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'appointment',
      entityId: 'appt-missing',
      operationType: 'status_update',
      payload: { status: 'completed' },
    });
    store.enqueueMutation({
      mutationId: 'mut-retry',
      bundleId: 'bundle-encounter-retry',
      bundleType: 'encounter',
      rootEntityId: 'appt-2',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'consultation',
      entityId: 'appt-2',
      operationType: 'complete',
      payload: { appointmentId: 'appt-2' },
    });

    store.recordSyncResults([
      {
        mutationId: 'mut-ok',
        entityType: 'patient',
        entityId: 'pt-1',
        status: 'accepted',
        canonicalEntity: { patient: { id: 'pt-1', name: 'Patient One' } },
      },
      {
        mutationId: 'mut-conflict',
        entityType: 'appointment',
        entityId: 'appt-1',
        status: 'conflict',
        conflictType: 'appointment_conflict',
        errorCode: 'SYNC_CONFLICT',
        errorMessage: 'Appointment changed elsewhere',
      },
      {
        mutationId: 'mut-invalid',
        entityType: 'appointment',
        entityId: 'appt-missing',
        status: 'validation_rejected',
        errorCode: 'VALIDATION_REJECTED',
        errorMessage: 'Appointment not found',
      },
      {
        mutationId: 'mut-retry',
        entityType: 'consultation',
        entityId: 'appt-2',
        status: 'retryable_failure',
        errorCode: 'RETRYABLE_FAILURE',
        errorMessage: 'Temporary failure',
      },
    ]);

    const issues = store.listSyncIssues();
    expect(issues.conflicts).toHaveLength(1);
    expect(issues.conflicts[0].conflict_type).toBe('appointment_conflict');
    expect(issues.deadLetters.map(item => item.mutation_id).sort()).toEqual(['mut-conflict', 'mut-invalid']);
    expect(issues.pending).toHaveLength(1);
    expect(issues.pending[0].mutation_id).toBe('mut-retry');
    expect(issues.pending[0].status).toBe('retryable');

    const retryableIssue = issues.pending.find(item => item.mutation_id === 'mut-retry');
    expect(retryableIssue?.status).toBe('retryable');
    expect(retryableIssue?.last_error_code).toBe('RETRYABLE_FAILURE');

    const runtime = store.getRuntimeInfo();
    expect(runtime.pendingBundles).toBe(1);
    expect(runtime.failedBundles).toBe(2);
    expect(runtime.completedBundles).toBe(1);

    const diagnostics = store.exportDiagnosticsSnapshot();
    expect(diagnostics.syncSummary.bundlesByStatus).toEqual([
      { status: 'completed', count: 1 },
      { status: 'conflict', count: 1 },
      { status: 'dead_letter', count: 1 },
      { status: 'retryable', count: 1 },
    ]);
  });

  it('applies pulled changes, stores checkpoint, and exports sync diagnostics', () => {
    const store = createStore();

    store.applyPulledChanges(
      {
        patients: [{ id: 'pt-1', mrn: 'MRN-1', name: 'Patient One', phone: '', age: 30, gender: 'Male', cnic: '', address: '', bloodGroup: '', emergencyContact: '' }],
        appointments: [{ id: 'appt-1', patientId: 'pt-1', clinicId: 'cl-1', doctorId: 'usr-1', date: '2026-04-23', time: '09:00', status: 'waiting', type: 'new', chiefComplaint: 'Check', tokenNumber: 1 }],
        drafts: {
          'appt-1': {
            appointmentId: 'appt-1',
            patientId: 'pt-1',
            clinicId: 'cl-1',
            chiefComplaint: 'Check',
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
            savedAt: '2026-04-23T10:00:00.000Z',
          },
        },
        notes: [],
        attachments: [],
      },
      '2026-04-23T10:01:00.000Z'
    );

    const runId = store.startSyncRun('push_pull');
    store.finishSyncRun(runId, 'completed', { pushed: 1, changesApplied: true });
    const diagnostics = store.exportDiagnosticsSnapshot();

    expect(diagnostics.checkpoint).toBe('2026-04-23T10:01:00.000Z');
    expect(diagnostics.counts.patients).toBe(1);
    expect(diagnostics.counts.appointments).toBe(1);
    expect(diagnostics.counts.drafts).toBe(1);
    expect(diagnostics.syncSummary.recentRuns[0].id).toBe(runId);
    expect(diagnostics.syncSummary.byStatus).toEqual([]);
  });

  it('resolves conflicts with explicit local or server actions and tracks rebuild state', () => {
    const store = createStore();

    store.overwriteBootstrapSnapshot({
      generatedAt: '2026-04-23T09:00:00.000Z',
      patients: [{ id: 'pt-2', mrn: 'MRN-2', name: 'Old Name', phone: '', age: 31, gender: 'Male', cnic: '', address: '', bloodGroup: '', emergencyContact: '' }],
      appointments: [],
      drafts: {},
      notes: [],
      attachments: [],
    });

    store.enqueueMutation({
      mutationId: 'mut-patient-conflict',
      bundleId: 'bundle-patient-conflict',
      bundleType: 'patient_master',
      rootEntityId: 'pt-2',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'patient',
      entityId: 'pt-2',
      operationType: 'update',
      payload: { id: 'pt-2', mrn: 'MRN-2', name: 'Local Name', phone: '', age: 31, gender: 'Male', cnic: '', address: '', bloodGroup: '', emergencyContact: '' },
      baseVersion: 'base-old',
    });

    store.recordSyncResults([
      {
        mutationId: 'mut-patient-conflict',
        bundleId: 'bundle-patient-conflict',
        entityType: 'patient',
        entityId: 'pt-2',
        status: 'conflict',
        conflictType: 'patient_conflict',
        errorCode: 'SYNC_CONFLICT',
        errorMessage: 'Patient changed elsewhere',
        serverSnapshot: { id: 'pt-2', mrn: 'MRN-2', name: 'Server Name', phone: '', age: 31, gender: 'Male', cnic: '', address: '', bloodGroup: '', emergencyContact: '' },
        serverBaseVersion: 'base-server',
      },
    ]);

    const initialIssues = store.listSyncIssues();
    expect(initialIssues.conflicts).toHaveLength(1);
    expect(initialIssues.conflicts[0].local_summary).toContain('Local Name');
    expect(initialIssues.conflicts[0].server_summary).toContain('Server Name');

    expect(store.resolveConflict({ conflictId: initialIssues.conflicts[0].id, action: 'use_server' })).toEqual({
      ok: true,
      action: 'use_server',
      message: '',
    });

    const postServerIssues = store.listSyncIssues();
    expect(postServerIssues.conflicts).toHaveLength(0);
    expect(postServerIssues.pending).toHaveLength(0);
    expect(store.getCachedBootstrap().bootstrap.patients[0].name).toBe('Server Name');

    store.enqueueMutation({
      mutationId: 'mut-draft-conflict',
      bundleId: 'bundle-draft-conflict',
      bundleType: 'encounter',
      rootEntityId: 'appt-2',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'consultation_draft',
      entityId: 'appt-2',
      operationType: 'upsert',
      payload: { appointmentId: 'appt-2', patientId: 'pt-2', clinicId: 'cl-1', chiefComplaint: 'Local draft', hpi: '', pastHistory: '', allergies: '', examination: '', assessment: '', plan: '', instructions: '', followUp: '', vitals: {}, diagnoses: [], medications: [], labOrders: [], procedures: [], careActions: [], savedAt: '2026-04-23T10:00:00.000Z' },
      baseVersion: 'draft-old',
    });
    store.recordSyncResults([
      {
        mutationId: 'mut-draft-conflict',
        bundleId: 'bundle-draft-conflict',
        entityType: 'consultation_draft',
        entityId: 'appt-2',
        status: 'conflict',
        conflictType: 'draft_conflict',
        errorCode: 'SYNC_CONFLICT',
        errorMessage: 'Draft changed elsewhere',
        serverSnapshot: { appointmentId: 'appt-2', patientId: 'pt-2', clinicId: 'cl-1', chiefComplaint: 'Server draft', hpi: '', pastHistory: '', allergies: '', examination: '', assessment: '', plan: '', instructions: '', followUp: '', vitals: {}, diagnoses: [], medications: [], labOrders: [], procedures: [], careActions: [], savedAt: '2026-04-23T10:05:00.000Z' },
        serverBaseVersion: 'draft-new',
      },
    ]);

    const draftConflict = store.listSyncIssues().conflicts[0];
    expect(store.resolveConflict({ conflictId: draftConflict.id, action: 'keep_local_as_new_draft' })).toEqual({
      ok: true,
      action: 'keep_local_as_new_draft',
      message: '',
    });
    const retriedDraft = store.listSyncIssues().pending.find(item => item.mutation_id === 'mut-draft-conflict');
    expect(retriedDraft?.status).toBe('pending');

    store.setRebuildRequired(true, 'Checkpoint expired');
    const runtime = store.getRuntimeInfo();
    const diagnostics = store.exportDiagnosticsSnapshot();
    expect(runtime.rebuildRequired).toBe(true);
    expect(runtime.rebuildReason).toContain('Checkpoint expired');
    expect(diagnostics.rebuildRequired).toBe(true);
  });

  it('can resolve conflicts with the conservative system-decision policy', () => {
    const store = createStore();

    store.enqueueMutation({
      mutationId: 'mut-auto-patient',
      bundleId: 'bundle-auto-patient',
      bundleType: 'patient_master',
      rootEntityId: 'pt-auto',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'patient',
      entityId: 'pt-auto',
      operationType: 'update',
      payload: {
        id: 'pt-auto',
        mrn: 'MRN-AUTO',
        name: 'Patient Auto',
        phone: '',
        age: 34,
        gender: 'Male',
        cnic: '',
        address: 'Local Street',
        bloodGroup: '',
        emergencyContact: '',
      },
      baseVersion: 'base-old',
    });

    store.recordSyncResults([
      {
        mutationId: 'mut-auto-patient',
        bundleId: 'bundle-auto-patient',
        entityType: 'patient',
        entityId: 'pt-auto',
        status: 'conflict',
        conflictType: 'patient_conflict',
        errorCode: 'SYNC_CONFLICT',
        errorMessage: 'Patient changed elsewhere',
        serverSnapshot: {
          id: 'pt-auto',
          mrn: 'MRN-AUTO',
          name: 'Patient Auto',
          phone: '03001234567',
          age: 34,
          gender: 'Male',
          cnic: '',
          address: '',
          bloodGroup: '',
          emergencyContact: '',
        },
        serverBaseVersion: 'base-new',
      },
    ]);

    const conflict = store.listSyncIssues().conflicts[0];
    const result = store.resolveConflict({ conflictId: conflict.id, action: 'system_decide' });
    expect(result.ok).toBe(true);
    expect(result.action).toBe('use_local');
    expect(result.message).toContain('system keeps the local update');

    const pending = store.listSyncIssues().pending.find(item => item.mutation_id === 'mut-auto-patient');
    expect(pending?.status).toBe('pending');
  });

  it('exports redacted diagnostics, verifies integrity, and creates a local backup snapshot', () => {
    const store = createStore();

    store.enqueueMutation({
      mutationId: 'mut-redacted',
      bundleId: 'bundle-redacted',
      bundleType: 'patient_master',
      rootEntityId: 'pt-redacted',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'patient',
      entityId: 'pt-redacted',
      operationType: 'update',
      payload: {
        id: 'pt-redacted',
        name: 'Sensitive Patient',
        phone: '03001234567',
      },
      baseVersion: 'base-old',
    });

    store.recordSyncResults([
      {
        mutationId: 'mut-redacted',
        bundleId: 'bundle-redacted',
        entityType: 'patient',
        entityId: 'pt-redacted',
        status: 'conflict',
        conflictType: 'patient_conflict',
        errorCode: 'SYNC_CONFLICT',
        errorMessage: 'Patient changed elsewhere',
        serverSnapshot: {
          id: 'pt-redacted',
          name: 'Server Patient',
          phone: '03110000000',
        },
        serverBaseVersion: 'base-new',
      },
    ]);

    const diagnostics = store.exportDiagnosticsSnapshot();
    expect(diagnostics.issues.conflicts[0].local_snapshot).toBeUndefined();
    expect(diagnostics.issues.conflicts[0].server_snapshot).toBeUndefined();
    expect(diagnostics.issues.conflicts[0].mutation_id).toBe('mut-redacted');

    const integrity = store.verifyIntegrity({ persist: true, source: 'test' });
    expect(integrity.ok).toBe(true);
    expect(integrity.integrity.toLowerCase()).toBe('ok');

    const backupPath = path.join(tempDirs[tempDirs.length - 1], 'backup.sqlite');
    const backup = store.exportLocalBackup(backupPath, { reason: 'test_backup' });
    expect(backup.ok).toBe(true);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.existsSync(`${backupPath}.manifest.json`)).toBe(true);
  });

  it('moves repeated retryable failures into a dead letter after retry exhaustion', () => {
    const store = createStore();

    store.enqueueMutation({
      mutationId: 'mut-retry-exhaust',
      bundleId: 'bundle-retry-exhaust',
      bundleType: 'encounter',
      rootEntityId: 'appt-retry',
      deviceId: 'device-1',
      workspaceId: 'ws-1',
      entityType: 'consultation',
      entityId: 'appt-retry',
      operationType: 'complete',
      payload: { appointmentId: 'appt-retry' },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      store.recordSyncResults([
        {
          mutationId: 'mut-retry-exhaust',
          entityType: 'consultation',
          entityId: 'appt-retry',
          status: 'retryable_failure',
          errorCode: 'RETRYABLE_FAILURE',
          errorMessage: `temporary failure ${attempt + 1}`,
        },
      ]);
    }

    const issues = store.listSyncIssues();
    expect(issues.pending.find(item => item.mutation_id === 'mut-retry-exhaust')).toBeUndefined();
    expect(issues.deadLetters.find(item => item.mutation_id === 'mut-retry-exhaust')?.reason_code).toBe('RETRY_EXHAUSTED');
    expect(store.getRuntimeInfo().failedBundles).toBeGreaterThan(0);
  });
});
