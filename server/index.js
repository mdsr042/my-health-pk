import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createId,
  hashPassword,
  issueToken,
  loadAuthContext,
  requireAuth,
  requireRole,
  verifyPassword,
} from './auth.js';
import { initDb, query, withTransaction } from './db.js';
import { cleanupExpiredDemoSessions, createEphemeralDemoSession } from './demoSeed.js';
import { apiAccessLogMiddleware, logError, logInfo, logWarn, requestContextMiddleware } from './logger.js';
import { getMedicationCatalogEntries, getMedicationCatalogEntry, searchMedicationCatalog, warmMedicationCatalog } from './medicationCatalog.js';
import { createRateLimitMiddleware } from './rateLimit.js';
import {
  adviceTemplateSchema,
  adminClinicUpdateSchema,
  adminDoctorProfileUpdateSchema,
  appointmentSchema,
  careActionSchema,
  conditionLibrarySchema,
  diagnosisCatalogSchema,
  diagnosisSetSchema,
  investigationCatalogSchema,
  investigationSetSchema,
  customMedicationSchema,
  parseOrThrow,
  passwordChangeSchema,
  passwordResetSchema,
  patientSchema,
  medicationEnrichmentImportSchema,
  procedureLibrarySchema,
  referralFacilitySchema,
  referralSpecialtySchema,
  signupSchema,
  treatmentTemplateSchema,
  validatePasswordPolicy,
  walkInSchema,
  recentInvestigationSchema,
} from './validation.js';
import {
  completeConsultationEncounter,
  createAppointmentForWorkspace,
  createWalkInEncounter,
  getNextTokenNumber,
  requireOwnedAppointment,
  requireOwnedClinic,
  requireOwnedPatient,
  searchPatientsByPhone,
  saveConsultationDraftForEncounter,
  updateAppointmentForWorkspace,
} from './workflows.js';
import { starterTreatmentTemplates } from './treatmentTemplates.js';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 4001);
const syncApiVersion = 'sync-v1';
const syncMinDesktopVersion = String(process.env.SYNC_MIN_DESKTOP_VERSION || '1.0.0').trim();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';
const enablePublicDemo = process.env.ENABLE_PUBLIC_DEMO === 'true';
const warmMedicationCatalogOnBoot = process.env.WARM_MEDICATION_CATALOG === 'true';

const authRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: 'auth',
  message: 'Too many authentication attempts. Please try again later.',
  code: 'RATE_LIMITED',
});

app.use(cors());
app.use(requestContextMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(apiAccessLogMiddleware);

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function recordAdminAudit(clientOrQuery, { actorUserId = null, targetUserId = null, workspaceId = null, action, details = {} }) {
  const runner = typeof clientOrQuery === 'function' ? clientOrQuery : clientOrQuery.query.bind(clientOrQuery);
  await runner(
    `
      INSERT INTO admin_audit_logs (id, actor_user_id, target_user_id, workspace_id, action, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [createId('admin_audit_log'), actorUserId, targetUserId, workspaceId, action, details]
  );
}

function mapClinic(row) {
  const specialties = Array.isArray(row.specialties)
    ? row.specialties
    : typeof row.specialties === 'string'
      ? row.specialties.split(',').map(item => item.trim()).filter(Boolean)
      : [];

  return {
    id: row.id,
    name: row.name,
    location: row.location,
    city: row.city,
    phone: row.phone,
    timings: row.timings,
    specialties,
    logo: row.logo,
    isActive: row.is_active,
  };
}

function mapPatient(row) {
  return {
    id: row.id,
    mrn: row.mrn,
    name: row.name,
    phone: row.phone,
    age: row.age,
    gender: row.gender,
    cnic: row.cnic,
    address: row.address,
    bloodGroup: row.blood_group,
    emergencyContact: row.emergency_contact,
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    doctorId: row.doctor_user_id,
    date: row.date,
    time: row.time,
    status: row.status,
    type: row.type,
    chiefComplaint: row.chief_complaint,
    tokenNumber: row.token_number,
  };
}

function mapClinicalNote(row, diagnosesByNote, medicationsByNote, labOrdersByNote, proceduresByNote = {}) {
  return {
    id: row.id,
    appointmentId: row.appointment_id ?? '',
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    doctorId: row.doctor_user_id,
    date: row.date,
    chiefComplaint: row.chief_complaint,
    hpi: row.hpi,
    pastHistory: row.past_history,
    allergies: row.allergies,
    examination: row.examination,
    assessment: row.assessment,
    plan: row.plan,
    instructions: row.instructions,
    followUp: row.follow_up,
    vitals: row.vitals ?? {},
    diagnoses: diagnosesByNote[row.id] ?? [],
    medications: medicationsByNote[row.id] ?? [],
    labOrders: labOrdersByNote[row.id] ?? [],
    procedures: proceduresByNote[row.id] ?? [],
    careActions: row.care_actions ?? [],
    status: row.status,
  };
}

function mapDiagnosisCatalogEntry(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  };
}

function mapConditionLibraryEntry(row) {
  return {
    id: row.id,
    code: row.code ?? '',
    name: row.name,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProcedureLibraryEntry(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? 'General',
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvestigationCatalogEntry(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    type: row.type,
    isActive: row.is_active,
    defaultPriority: row.priority ?? undefined,
    defaultNotes: row.notes ?? undefined,
  };
}

function mapReferralSpecialty(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  };
}

function mapReferralFacility(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    phone: row.phone,
    isActive: row.is_active,
  };
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseSemver(version = '') {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function getSyncClientVersion(req) {
  const fromHeader = String(req.headers?.['x-desktop-version'] ?? '').trim();
  if (fromHeader) return fromHeader;
  const fromBody = String(req.body?.clientVersion ?? '').trim();
  if (fromBody) return fromBody;
  const fromQuery = String(req.query?.clientVersion ?? '').trim();
  if (fromQuery) return fromQuery;
  return '';
}

function getDesktopDeviceId(req) {
  const fromHeader = String(req.headers?.['x-desktop-device-id'] ?? '').trim();
  if (fromHeader) return fromHeader;
  const fromBody = String(req.body?.deviceId ?? '').trim();
  if (fromBody) return fromBody;
  const fromBundle = String(req.body?.bundles?.[0]?.deviceId ?? '').trim();
  if (fromBundle) return fromBundle;
  const fromMutation = String(req.body?.mutations?.[0]?.deviceId ?? '').trim();
  if (fromMutation) return fromMutation;
  const fromQuery = String(req.query?.deviceId ?? '').trim();
  if (fromQuery) return fromQuery;
  return '';
}

function getSyncCompatibility(req) {
  const clientVersion = getSyncClientVersion(req);
  const minVersion = syncMinDesktopVersion || '1.0.0';

  if (!clientVersion) {
    return {
      apiVersion: syncApiVersion,
      mode: 'additive',
      requiredMinDesktopVersion: minVersion,
      clientVersion: '',
      compatible: true,
      reason: 'client_version_not_provided',
    };
  }

  const parsedClient = parseSemver(clientVersion);
  const parsedMin = parseSemver(minVersion);
  if (!parsedClient || !parsedMin) {
    return {
      apiVersion: syncApiVersion,
      mode: 'additive',
      requiredMinDesktopVersion: minVersion,
      clientVersion,
      compatible: false,
      reason: 'invalid_client_version',
    };
  }

  if (compareSemver(parsedClient, parsedMin) < 0) {
    return {
      apiVersion: syncApiVersion,
      mode: 'additive',
      requiredMinDesktopVersion: minVersion,
      clientVersion,
      compatible: false,
      reason: 'client_version_unsupported',
    };
  }

  return {
    apiVersion: syncApiVersion,
    mode: 'additive',
    requiredMinDesktopVersion: minVersion,
    clientVersion,
    compatible: true,
    reason: 'ok',
  };
}

async function requireActiveDesktopDevice(req, res, { allowMissing = true } = {}) {
  const deviceId = getDesktopDeviceId(req);
  if (!deviceId) {
    return allowMissing ? null : { blocked: true, reason: 'missing_device_id' };
  }

  const { rows } = await query(
    `
      SELECT id, device_id, status, app_version, last_seen_at
      FROM desktop_devices
      WHERE device_id = $1
        AND workspace_id = $2
        AND doctor_user_id = $3
      LIMIT 1
    `,
    [deviceId, req.auth.workspace.id, req.auth.user.id]
  );

  if (rows.length === 0) {
    return null;
  }

  const device = rows[0];
  if (device.status === 'revoked') {
    res.status(403).json({
      error: 'This desktop device has been revoked. Contact support or register a different approved device.',
      code: 'DEVICE_REVOKED',
      data: {
        deviceId,
        status: 'revoked',
      },
    });
    return { blocked: true, reason: 'device_revoked' };
  }

  await query(
    `
      UPDATE desktop_devices
      SET last_seen_at = NOW(),
          app_version = CASE
            WHEN $2 <> '' THEN $2
            ELSE app_version
          END,
          updated_at = NOW()
      WHERE id = $1
    `,
    [device.id, getSyncClientVersion(req)]
  );

  return { blocked: false, device };
}

function computeOfflineSyncHealth({
  activeDeviceCount,
  conflicts,
  retryableFailures,
  validationRejected,
  permissionRejected,
  entitlementRejected,
  lastSeenAt,
  lastSyncedAt,
}) {
  if (activeDeviceCount <= 0) return 'inactive';

  const nowMs = Date.now();
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const lastSyncedMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
  const staleSeen = !lastSeenMs || nowMs - lastSeenMs > 1000 * 60 * 60 * 24 * 7;
  const staleSync = !lastSyncedMs || nowMs - lastSyncedMs > 1000 * 60 * 60 * 24 * 14;
  const hasFailures = (conflicts + retryableFailures + validationRejected + permissionRejected + entitlementRejected) > 0;

  if (staleSeen && staleSync) return 'offline';
  if (hasFailures || staleSeen || staleSync) return 'attention';
  return 'healthy';
}

function getPilotRolloutThresholds() {
  return {
    conflicts: Number(process.env.COHORT_MAX_CONFLICTS ?? 0),
    retryableFailures: Number(process.env.COHORT_MAX_RETRYABLE_FAILURES ?? 5),
    doctorsWithAttention: Number(process.env.COHORT_MAX_DOCTORS_WITH_ATTENTION ?? 10),
    doctorsOffline: Number(process.env.COHORT_MAX_DOCTORS_OFFLINE ?? 5),
  };
}

function evaluatePilotRollout(summary) {
  const thresholds = getPilotRolloutThresholds();
  const reasons = [];

  if (Number(summary?.conflicts ?? 0) > thresholds.conflicts) {
    reasons.push(`conflicts=${summary.conflicts} exceeds max=${thresholds.conflicts}`);
  }

  if (Number(summary?.retryableFailures ?? 0) > thresholds.retryableFailures) {
    reasons.push(`retryableFailures=${summary.retryableFailures} exceeds max=${thresholds.retryableFailures}`);
  }

  if (Number(summary?.doctorsWithAttention ?? 0) > thresholds.doctorsWithAttention) {
    reasons.push(`doctorsWithAttention=${summary.doctorsWithAttention} exceeds max=${thresholds.doctorsWithAttention}`);
  }

  if (Number(summary?.doctorsOffline ?? 0) > thresholds.doctorsOffline) {
    reasons.push(`doctorsOffline=${summary.doctorsOffline} exceeds max=${thresholds.doctorsOffline}`);
  }

  return {
    decision: reasons.length === 0 ? 'GO' : 'NO_GO',
    reasons,
    thresholds,
  };
}

function mapCareAction(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id ?? '',
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    doctorId: row.doctor_user_id,
    type: row.type,
    targetType: row.target_type,
    targetId: row.target_id,
    title: row.title,
    notes: row.notes,
    urgency: row.urgency,
    actionDate: row.action_date,
    createdAt: row.created_at,
  };
}

function mapPatientDocument(row) {
  return {
    id: row.id,
    attachmentId: row.id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type ?? 'patient',
    entityId: row.entity_id ?? row.patient_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id ?? '',
    fileName: row.file_name ?? '',
    mimeType: row.mime_type ?? '',
    fileSize: Number(row.file_size ?? 0),
    checksum: row.checksum ?? '',
    localPath: '',
    remoteKey: row.remote_key ?? '',
    status: 'uploaded',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getWorkspaceClinics(workspaceId) {
  const { rows } = await query(
    `
      SELECT id, name, location, city, phone, timings, specialties, logo
      , is_active
      FROM clinics
      WHERE workspace_id = $1
      ORDER BY created_at ASC
    `,
    [workspaceId]
  );

  return rows.map(mapClinic);
}

async function getWorkspaceSettings(workspaceId) {
  const { rows } = await query(
    'SELECT data FROM workspace_settings WHERE workspace_id = $1 LIMIT 1',
    [workspaceId]
  );

  return rows[0]?.data ?? null;
}

async function getSessionPayload(userId) {
  const auth = await loadAuthContext(userId);
  if (!auth) return null;

  if (auth.user.role !== 'doctor_owner' || !auth.workspace) {
    return {
      user: auth.user,
      doctor: null,
      workspace: auth.workspace,
      clinics: [],
      settings: null,
    };
  }

  const [clinics, settings, subscriptionResult] = await Promise.all([
    getWorkspaceClinics(auth.workspace.id),
    getWorkspaceSettings(auth.workspace.id),
    query(
      `
        SELECT plan_name, status, trial_ends_at
        FROM subscriptions
        WHERE workspace_id = $1
        LIMIT 1
      `,
      [auth.workspace.id]
    ),
  ]);

  return {
    user: auth.user,
    doctor: {
      ...auth.doctor,
      clinicIds: clinics.map(clinic => clinic.id),
    },
    workspace: {
      ...auth.workspace,
      subscription: subscriptionResult.rows[0]
        ? {
            planName: subscriptionResult.rows[0].plan_name,
            status: subscriptionResult.rows[0].status,
            trialEndsAt: subscriptionResult.rows[0].trial_ends_at,
          }
        : null,
    },
    clinics,
    settings,
  };
}

async function getWorkspaceNotes(workspaceId, patientId = null) {
  const noteParams = patientId ? [workspaceId, patientId] : [workspaceId];
  const notesQuery = patientId
    ? `
        SELECT *
        FROM clinical_notes
        WHERE workspace_id = $1 AND patient_id = $2
        ORDER BY date DESC
      `
    : `
        SELECT *
        FROM clinical_notes
        WHERE workspace_id = $1
        ORDER BY date DESC
      `;
  const notesResult = await query(notesQuery, noteParams);
  const notes = notesResult.rows;

  if (notes.length === 0) return [];

  const noteIds = notes.map(note => note.id);
  const [diagnosesResult, medicationsResult, labOrdersResult, proceduresResult, careActionsResult] = await Promise.all([
    query(
      `
        SELECT *
        FROM diagnoses
        WHERE note_id = ANY($1::text[])
      `,
      [noteIds]
    ),
    query(
      `
        SELECT *
        FROM medications
        WHERE note_id = ANY($1::text[])
      `,
      [noteIds]
    ),
    query(
      `
        SELECT *
        FROM lab_orders
        WHERE note_id = ANY($1::text[])
      `,
      [noteIds]
    ),
    query(
      `
        SELECT *
        FROM procedures
        WHERE note_id = ANY($1::text[])
      `,
      [noteIds]
    ),
    query(
      `
        SELECT *
        FROM care_actions
        WHERE note_id = ANY($1::text[])
        ORDER BY created_at DESC
      `,
      [noteIds]
    ),
  ]);

  const diagnosesByNote = diagnosesResult.rows.reduce((acc, row) => {
    acc[row.note_id] ??= [];
    acc[row.note_id].push({
      id: row.id,
      code: row.code,
      name: row.name,
      isPrimary: row.is_primary,
    });
    return acc;
  }, {});

  const medicationsByNote = medicationsResult.rows.reduce((acc, row) => {
    acc[row.note_id] ??= [];
    acc[row.note_id].push({
      id: row.id,
      name: row.name,
      nameUrdu: row.name_urdu,
      generic: row.generic_name,
      strength: row.strength,
      form: row.form,
      route: row.route,
      dosePattern: row.dose_pattern || '',
      frequency: row.frequency,
      frequencyUrdu: row.frequency_urdu,
      duration: row.duration,
      durationUrdu: row.duration_urdu,
      instructions: row.instructions,
      instructionsUrdu: row.instructions_urdu,
      diagnosisId: row.diagnosis_id || undefined,
    });
    return acc;
  }, {});

  const labOrdersByNote = labOrdersResult.rows.reduce((acc, row) => {
    acc[row.note_id] ??= [];
    acc[row.note_id].push({
      id: row.id,
      testName: row.test_name,
      category: row.category,
      priority: row.priority,
      status: row.status,
      result: row.result,
      date: row.date,
    });
    return acc;
  }, {});

  const careActionsByNote = careActionsResult.rows.reduce((acc, row) => {
    acc[row.note_id] ??= [];
    acc[row.note_id].push(mapCareAction(row));
    return acc;
  }, {});

  const proceduresByNote = proceduresResult.rows.reduce((acc, row) => {
    acc[row.note_id] ??= [];
    acc[row.note_id].push({
      id: row.id,
      name: row.name,
      category: row.category,
      notes: row.notes,
    });
    return acc;
  }, {});

  return notes.map(note =>
    mapClinicalNote(
      { ...note, care_actions: careActionsByNote[note.id] ?? [] },
      diagnosesByNote,
      medicationsByNote,
      labOrdersByNote,
      proceduresByNote
    )
  );
}

async function getWorkspaceNoteById(workspaceId, noteId) {
  const { rows } = await query(
    `
      SELECT *
      FROM clinical_notes
      WHERE workspace_id = $1 AND id = $2
      LIMIT 1
    `,
    [workspaceId, noteId]
  );

  if (!rows[0]) return null;

  const [diagnosesResult, medicationsResult, labOrdersResult, proceduresResult, careActionsResult] = await Promise.all([
    query(`SELECT * FROM diagnoses WHERE note_id = $1`, [noteId]),
    query(`SELECT * FROM medications WHERE note_id = $1`, [noteId]),
    query(`SELECT * FROM lab_orders WHERE note_id = $1`, [noteId]),
    query(`SELECT * FROM procedures WHERE note_id = $1`, [noteId]),
    query(
      `
        SELECT *
        FROM care_actions
        WHERE note_id = $1
        ORDER BY created_at DESC
      `,
      [noteId]
    ),
  ]);

  return mapClinicalNote(
    {
      ...rows[0],
      care_actions: careActionsResult.rows.map(mapCareAction),
    },
    {
      [noteId]: diagnosesResult.rows.map(row => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isPrimary: row.is_primary,
      })),
    },
    {
      [noteId]: medicationsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        nameUrdu: row.name_urdu,
        generic: row.generic_name,
        strength: row.strength,
        form: row.form,
        route: row.route,
        dosePattern: row.dose_pattern || '',
        frequency: row.frequency,
        frequencyUrdu: row.frequency_urdu,
        duration: row.duration,
        durationUrdu: row.duration_urdu,
        instructions: row.instructions,
        instructionsUrdu: row.instructions_urdu,
        diagnosisId: row.diagnosis_id || undefined,
      })),
    },
    {
      [noteId]: labOrdersResult.rows.map(row => ({
        id: row.id,
        testName: row.test_name,
        category: row.category,
        priority: row.priority,
        status: row.status,
        result: row.result,
        date: row.date,
      })),
    },
    {
      [noteId]: proceduresResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        notes: row.notes,
      })),
    }
  );
}

async function getWorkspaceDrafts(workspaceId) {
  const { rows } = await query(
    `
      SELECT appointment_id, patient_id, payload, saved_at
      FROM consultation_drafts
      WHERE workspace_id = $1
    `,
    [workspaceId]
  );

  return Object.fromEntries(
    rows.map(row => [
      row.appointment_id || `orphan:${row.patient_id}`,
      {
        ...row.payload,
        appointmentId: row.appointment_id || row.payload?.appointmentId || '',
        savedAt: row.saved_at,
      },
    ])
  );
}

async function getWorkspaceAttachments(workspaceId) {
  const { rows } = await query(
    `
      SELECT *
      FROM patient_documents
      WHERE workspace_id = $1
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1000
    `,
    [workspaceId]
  );

  return rows.map(mapPatientDocument);
}

async function getDesktopBootstrapData(auth) {
  const [patientsResult, appointmentsResult, notes, drafts, clinics, settings, attachments] = await Promise.all([
    query(
      `
        SELECT *
        FROM patients
        WHERE workspace_id = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1000
      `,
      [auth.workspace.id]
    ),
    query(
      `
        SELECT *
        FROM appointments
        WHERE workspace_id = $1
        ORDER BY date DESC, time DESC, token_number DESC
        LIMIT 1500
      `,
      [auth.workspace.id]
    ),
    getWorkspaceNotes(auth.workspace.id),
    getWorkspaceDrafts(auth.workspace.id),
    getWorkspaceClinics(auth.workspace.id),
    getWorkspaceSettings(auth.workspace.id),
    getWorkspaceAttachments(auth.workspace.id),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    patients: patientsResult.rows.map(mapPatient),
    appointments: appointmentsResult.rows.map(mapAppointment),
    notes,
    drafts,
    clinics,
    settings,
    attachments,
  };
}

function parseSyncCheckpoint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function createIssuedSyncCheckpoint(workspaceId, issuedAt = new Date().toISOString()) {
  return `sync:v1:${String(workspaceId ?? '').trim()}:${issuedAt}`;
}

function parseIssuedSyncCheckpoint(value, expectedWorkspaceId = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (!raw.startsWith('sync:v1:')) {
    const legacyTimestamp = parseSyncCheckpoint(raw);
    if (!legacyTimestamp) return null;
    return {
      kind: 'legacy',
      workspaceId: '',
      issuedAt: legacyTimestamp,
    };
  }

  const withoutPrefix = raw.slice('sync:v1:'.length);
  const separatorIndex = withoutPrefix.indexOf(':');
  if (separatorIndex <= 0) return null;

  const workspaceId = withoutPrefix.slice(0, separatorIndex).trim();
  const issuedAtRaw = withoutPrefix.slice(separatorIndex + 1).trim();
  const issuedAt = parseSyncCheckpoint(issuedAtRaw);
  if (!workspaceId || !issuedAt) return null;
  if (expectedWorkspaceId && workspaceId !== expectedWorkspaceId) return null;

  return {
    kind: 'issued',
    workspaceId,
    issuedAt,
  };
}

function buildDraftBaseVersion(payload = {}, savedAt = '') {
  return JSON.stringify({
    appointmentId: String(payload?.appointmentId ?? '').trim(),
    patientId: String(payload?.patientId ?? '').trim(),
    clinicId: String(payload?.clinicId ?? '').trim(),
    chiefComplaint: String(payload?.chiefComplaint ?? ''),
    hpi: String(payload?.hpi ?? ''),
    pastHistory: String(payload?.pastHistory ?? ''),
    allergies: String(payload?.allergies ?? ''),
    examination: String(payload?.examination ?? ''),
    assessment: String(payload?.assessment ?? ''),
    plan: String(payload?.plan ?? ''),
    instructions: String(payload?.instructions ?? ''),
    followUp: String(payload?.followUp ?? ''),
    vitals: payload?.vitals ?? {},
    diagnoses: payload?.diagnoses ?? [],
    medications: payload?.medications ?? [],
    labOrders: payload?.labOrders ?? [],
    procedures: payload?.procedures ?? [],
    careActions: payload?.careActions ?? [],
    savedAt: String(savedAt || payload?.savedAt || ''),
  });
}

function buildAppointmentBaseVersion(appointment = {}) {
  return JSON.stringify({
    id: String(appointment?.id ?? '').trim(),
    patientId: String(appointment?.patientId ?? appointment?.patient_id ?? '').trim(),
    clinicId: String(appointment?.clinicId ?? appointment?.clinic_id ?? '').trim(),
    doctorId: String(appointment?.doctorId ?? appointment?.doctor_user_id ?? '').trim(),
    date: String(appointment?.date ?? '').trim(),
    time: String(appointment?.time ?? '').trim(),
    status: String(appointment?.status ?? '').trim(),
    type: String(appointment?.type ?? '').trim(),
    chiefComplaint: String(appointment?.chiefComplaint ?? appointment?.chief_complaint ?? '').trim(),
    tokenNumber: Number(appointment?.tokenNumber ?? appointment?.token_number ?? 0),
  });
}

function buildPatientBaseVersion(patient = {}) {
  return JSON.stringify({
    id: String(patient?.id ?? '').trim(),
    mrn: String(patient?.mrn ?? '').trim(),
    name: String(patient?.name ?? '').trim(),
    phone: String(patient?.phone ?? '').trim(),
    age: Number(patient?.age ?? 0),
    gender: String(patient?.gender ?? '').trim(),
    cnic: String(patient?.cnic ?? '').trim(),
    address: String(patient?.address ?? '').trim(),
    bloodGroup: String(patient?.bloodGroup ?? patient?.blood_group ?? '').trim(),
    emergencyContact: String(patient?.emergencyContact ?? patient?.emergency_contact ?? '').trim(),
  });
}

function createSyncError(message, {
  status = 'retryable_failure',
  errorCode = '',
  conflictType = '',
  serverSnapshot = null,
  serverBaseVersion = '',
} = {}) {
  const error = new Error(message);
  error.syncStatus = status;
  error.errorCode = errorCode || (
    status === 'conflict'
      ? 'SYNC_CONFLICT'
      : status === 'entitlement_rejected'
        ? 'ENTITLEMENT_REJECTED'
        : status === 'validation_rejected'
          ? 'VALIDATION_REJECTED'
          : 'RETRYABLE_FAILURE'
  );
  error.conflictType = conflictType;
  error.serverSnapshot = serverSnapshot;
  error.serverBaseVersion = serverBaseVersion;
  return error;
}

function resolvePullCheckpointState(rawCheckpoint, workspaceId) {
  const trimmed = String(rawCheckpoint ?? '').trim();
  if (!trimmed) {
    return { checkpointStatus: 'ok', rebuildRequired: false, rebuildReason: '', parsedCheckpoint: null, checkpointMeta: null };
  }

  const checkpointMeta = parseIssuedSyncCheckpoint(trimmed, workspaceId);
  if (!checkpointMeta) {
    return {
      checkpointStatus: 'unknown_checkpoint',
      rebuildRequired: true,
      rebuildReason: 'The saved desktop checkpoint could not be recognized. Rebuild the local cache before syncing again.',
      parsedCheckpoint: null,
      checkpointMeta: null,
    };
  }

  const parsedCheckpoint = checkpointMeta.issuedAt;
  const futureSkewMs = new Date(parsedCheckpoint).getTime() - Date.now();
  const maxFutureSkewMs = 5 * 60 * 1000;
  if (futureSkewMs > maxFutureSkewMs) {
    return {
      checkpointStatus: 'unknown_checkpoint',
      rebuildRequired: true,
      rebuildReason: 'The saved desktop checkpoint is ahead of server time. Rebuild the local cache before syncing again.',
      parsedCheckpoint: null,
      checkpointMeta: null,
    };
  }

  const ageMs = Date.now() - new Date(parsedCheckpoint).getTime();
  const maxCheckpointAgeMs = 45 * 24 * 60 * 60 * 1000;
  if (ageMs > maxCheckpointAgeMs) {
    return {
      checkpointStatus: 'expired_checkpoint',
      rebuildRequired: true,
      rebuildReason: 'The saved desktop checkpoint is too old for safe incremental sync. Rebuild the local cache before syncing again.',
      parsedCheckpoint: null,
      checkpointMeta: null,
    };
  }

  return { checkpointStatus: 'ok', rebuildRequired: false, rebuildReason: '', parsedCheckpoint, checkpointMeta };
}

function normalizeDesktopBundle(input = {}) {
  const rawMutations = Array.isArray(input?.mutations) ? input.mutations : [];
  const firstMutation = rawMutations[0] ?? {};
  return {
    bundleId: String(input?.bundleId ?? firstMutation?.bundleId ?? '').trim(),
    bundleType: String(input?.bundleType ?? firstMutation?.bundleType ?? 'mutation').trim() || 'mutation',
    rootEntityId: String(input?.rootEntityId ?? firstMutation?.rootEntityId ?? firstMutation?.entityId ?? '').trim(),
    deviceId: String(input?.deviceId ?? firstMutation?.deviceId ?? '').trim(),
    workspaceId: String(input?.workspaceId ?? firstMutation?.workspaceId ?? '').trim(),
    entityType: String(input?.entityType ?? firstMutation?.entityType ?? '').trim(),
    entityId: String(input?.entityId ?? firstMutation?.entityId ?? '').trim(),
    mutations: rawMutations,
  };
}

async function processDesktopBundle(client, auth, bundle) {
  const bundleResult = {
    bundleId: bundle.bundleId,
    bundleType: bundle.bundleType,
    rootEntityId: bundle.rootEntityId,
    status: 'accepted',
    committedMutationCount: 0,
    canonicalBundle: {
      patients: [],
      appointments: [],
      drafts: {},
      notes: [],
      attachments: [],
    },
  };
  const mutationResults = [];

  for (const mutation of bundle.mutations) {
    const responsePayload = await processDesktopMutation(client, auth, mutation);
    mutationResults.push({
      mutationId: String(mutation.mutationId ?? '').trim(),
      bundleId: bundle.bundleId,
      entityType: String(mutation.entityType ?? '').trim(),
      entityId: String(mutation.entityId ?? '').trim(),
      status: 'accepted',
      canonicalEntity: responsePayload,
      result: responsePayload,
    });

    if (responsePayload?.patient?.id) {
      bundleResult.canonicalBundle.patients.push(responsePayload.patient);
    }
    if (responsePayload?.appointment?.id) {
      bundleResult.canonicalBundle.appointments.push(responsePayload.appointment);
    }
    if (responsePayload?.draft?.appointmentId) {
      bundleResult.canonicalBundle.drafts[responsePayload.draft.appointmentId] = responsePayload.draft;
    }
    if (responsePayload?.note?.id) {
      bundleResult.canonicalBundle.notes.push(responsePayload.note);
    }
    if (responsePayload?.attachment?.id) {
      bundleResult.canonicalBundle.attachments.push(responsePayload.attachment);
    }
  }

  bundleResult.committedMutationCount = mutationResults.length;
  return { bundleResult, mutationResults };
}

async function getDesktopChangeSet(auth, checkpoint) {
  const normalizedCheckpoint = parseSyncCheckpoint(checkpoint);
  if (!normalizedCheckpoint) {
    return {
      patients: [],
      appointments: [],
      drafts: {},
      notes: [],
      attachments: [],
    };
  }

  const [patientsResult, appointmentsResult, draftRows, noteIdsResult, attachmentResult] = await Promise.all([
    query(
      `
        SELECT *
        FROM patients
        WHERE workspace_id = $1 AND updated_at > $2
        ORDER BY updated_at ASC
      `,
      [auth.workspace.id, normalizedCheckpoint]
    ),
    query(
      `
        SELECT *
        FROM appointments
        WHERE workspace_id = $1 AND updated_at > $2
        ORDER BY updated_at ASC
      `,
      [auth.workspace.id, normalizedCheckpoint]
    ),
    query(
      `
        SELECT appointment_id, patient_id, payload, saved_at
        FROM consultation_drafts
        WHERE workspace_id = $1 AND updated_at > $2
        ORDER BY updated_at ASC
      `,
      [auth.workspace.id, normalizedCheckpoint]
    ),
    query(
      `
        SELECT id
        FROM clinical_notes
        WHERE workspace_id = $1 AND updated_at > $2
        ORDER BY updated_at ASC
      `,
      [auth.workspace.id, normalizedCheckpoint]
    ),
    query(
      `
        SELECT *
        FROM patient_documents
        WHERE workspace_id = $1 AND updated_at > $2
        ORDER BY updated_at ASC
      `,
      [auth.workspace.id, normalizedCheckpoint]
    ),
  ]);

  const notes = await Promise.all(noteIdsResult.rows.map(row => getWorkspaceNoteById(auth.workspace.id, row.id)));

  return {
    patients: patientsResult.rows.map(mapPatient),
    appointments: appointmentsResult.rows.map(mapAppointment),
    drafts: Object.fromEntries(
      draftRows.rows.map(row => [
        row.appointment_id || `orphan:${row.patient_id}`,
        {
          ...row.payload,
          appointmentId: row.appointment_id || row.payload?.appointmentId || '',
          savedAt: row.saved_at,
        },
      ])
    ),
    notes: notes.filter(Boolean),
    attachments: attachmentResult.rows.map(mapPatientDocument),
  };
}

async function processDesktopMutation(client, auth, mutation) {
  const entityType = String(mutation?.entityType ?? '').trim();
  const operationType = String(mutation?.operationType ?? '').trim();
  const payload = mutation?.payload ?? {};

  if (entityType === 'patient' && operationType === 'create') {
    const patient = parseOrThrow(patientSchema, payload, 'INVALID_PATIENT');
    const id = patient.id || createId('patient');
    const mrn = patient.mrn || `MRN-${Date.now().toString().slice(-8)}`;

    const result = await client.query(
      `
        INSERT INTO patients (
          id, workspace_id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          mrn = EXCLUDED.mrn,
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          age = EXCLUDED.age,
          gender = EXCLUDED.gender,
          cnic = EXCLUDED.cnic,
          address = EXCLUDED.address,
          blood_group = EXCLUDED.blood_group,
          emergency_contact = EXCLUDED.emergency_contact,
          updated_at = NOW()
        RETURNING *
      `,
      [
        id,
        auth.workspace.id,
        mrn,
        patient.name,
        patient.phone || '',
        patient.age || 0,
        patient.gender || 'Male',
        patient.cnic || '',
        patient.address || '',
        patient.bloodGroup || '',
        patient.emergencyContact || '',
      ]
    );

    return { entityType, operationType, patient: mapPatient(result.rows[0]) };
  }

  if (entityType === 'patient' && operationType === 'update') {
    const patient = parseOrThrow(patientSchema, payload, 'INVALID_PATIENT');
    const currentPatientResult = await client.query(
      `
        SELECT *
        FROM patients
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [patient.id, auth.workspace.id]
    );

    if (currentPatientResult.rowCount === 0) {
      throw createSyncError('Patient not found for update', {
        status: 'validation_rejected',
        errorCode: 'VALIDATION_REJECTED',
      });
    }

    const currentPatient = mapPatient(currentPatientResult.rows[0]);
    const incomingBaseVersion = String(mutation?.baseVersion ?? '').trim();
    const currentBaseVersion = buildPatientBaseVersion(currentPatient);
    if (incomingBaseVersion && currentBaseVersion && incomingBaseVersion !== currentBaseVersion) {
      throw createSyncError('Patient conflict: the demographic record changed on another client', {
        status: 'conflict',
        conflictType: 'patient_conflict',
        serverSnapshot: currentPatient,
        serverBaseVersion: currentBaseVersion,
      });
    }

    const result = await client.query(
      `
        UPDATE patients
        SET
          name = $3,
          phone = $4,
          age = $5,
          gender = $6,
          cnic = $7,
          address = $8,
          blood_group = $9,
          emergency_contact = $10,
          updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
        RETURNING *
      `,
      [
        patient.id,
        auth.workspace.id,
        patient.name,
        patient.phone || '',
        patient.age || 0,
        patient.gender || 'Male',
        patient.cnic || '',
        patient.address || '',
        patient.bloodGroup || '',
        patient.emergencyContact || '',
      ]
    );

    if (result.rowCount === 0) {
      throw new Error('Patient not found for update');
    }

    return { entityType, operationType, patient: mapPatient(result.rows[0]) };
  }

  if (entityType === 'appointment' && operationType === 'create') {
    const appointment = parseOrThrow(appointmentSchema, payload, 'INVALID_APPOINTMENT');
    await requireOwnedPatient(client, auth.workspace.id, appointment.patientId);
    await requireOwnedClinic(client, auth.workspace.id, appointment.clinicId);

    const tokenNumber = appointment.tokenNumber > 0
      ? appointment.tokenNumber
      : await getNextTokenNumber(client, auth.workspace.id, appointment.clinicId, appointment.date);

    const result = await client.query(
      `
        INSERT INTO appointments (
          id, workspace_id, clinic_id, patient_id, doctor_user_id, date, time, status, type, chief_complaint, token_number, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          patient_id = EXCLUDED.patient_id,
          clinic_id = EXCLUDED.clinic_id,
          date = EXCLUDED.date,
          time = EXCLUDED.time,
          status = EXCLUDED.status,
          type = EXCLUDED.type,
          chief_complaint = EXCLUDED.chief_complaint,
          token_number = EXCLUDED.token_number,
          updated_at = NOW()
        RETURNING id, patient_id, clinic_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
      `,
      [
        appointment.id || createId('appointment'),
        auth.workspace.id,
        appointment.clinicId,
        appointment.patientId,
        auth.user.id,
        appointment.date,
        appointment.time,
        appointment.status || 'scheduled',
        appointment.type || 'new',
        appointment.chiefComplaint || '',
        tokenNumber,
      ]
    );

    return { entityType, operationType, appointment: mapAppointment(result.rows[0]) };
  }

  if (entityType === 'appointment' && operationType === 'update') {
    const appointment = parseOrThrow(appointmentSchema, payload, 'INVALID_APPOINTMENT');
    const currentAppointment = await requireOwnedAppointment(client, auth.workspace.id, appointment.id, { lock: true });
    const incomingBaseVersion = String(mutation?.baseVersion ?? '').trim();
    const currentBaseVersion = buildAppointmentBaseVersion(mapAppointment(currentAppointment));
    if (incomingBaseVersion && currentBaseVersion && incomingBaseVersion !== currentBaseVersion) {
      throw createSyncError('Appointment conflict: the visit changed on another client', {
        status: 'conflict',
        conflictType: 'appointment_conflict',
        serverSnapshot: mapAppointment(currentAppointment),
        serverBaseVersion: currentBaseVersion,
      });
    }
    const saved = await updateAppointmentForWorkspace(client, {
      workspaceId: auth.workspace.id,
      appointmentId: appointment.id,
      appointment,
    });
    return { entityType, operationType, appointment: mapAppointment(saved) };
  }

  if (entityType === 'appointment' && operationType === 'status_update') {
    const appointmentId = String(mutation?.entityId ?? payload?.appointmentId ?? '').trim();
    const status = String(payload?.status ?? '').trim();
    if (!appointmentId || !status) {
      throw new Error('Appointment status mutation is incomplete');
    }

    const appointment = await requireOwnedAppointment(client, auth.workspace.id, appointmentId, { lock: true });
    const incomingBaseVersion = String(mutation?.baseVersion ?? '').trim();
    const currentBaseVersion = buildAppointmentBaseVersion(mapAppointment(appointment));
    if (incomingBaseVersion && currentBaseVersion && incomingBaseVersion !== currentBaseVersion) {
      throw createSyncError('Appointment conflict: the visit changed on another client', {
        status: 'conflict',
        conflictType: 'appointment_conflict',
        serverSnapshot: mapAppointment(appointment),
        serverBaseVersion: currentBaseVersion,
      });
    }
    if (status === 'in-consultation') {
      const conflict = await client.query(
        `
          SELECT id
          FROM appointments
          WHERE workspace_id = $1
            AND clinic_id = $2
            AND date = $3
            AND status = 'in-consultation'
            AND id <> $4
          LIMIT 1
        `,
        [auth.workspace.id, appointment.clinic_id, appointment.date, appointmentId]
      );
      if (conflict.rowCount > 0) {
        throw createSyncError('Appointment status conflict: another visit is already in consultation', {
          status: 'conflict',
          conflictType: 'appointment_conflict',
          serverSnapshot: mapAppointment(appointment),
          serverBaseVersion: currentBaseVersion,
        });
      }
    }

    const updatedAppointment = await client.query(
      `
        UPDATE appointments
        SET status = $3, updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
        RETURNING id, patient_id, clinic_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
      `,
      [appointmentId, auth.workspace.id, status]
    );

    return { entityType, operationType, appointment: mapAppointment(updatedAppointment.rows[0]) };
  }

  if (entityType === 'consultation_draft' && operationType === 'upsert') {
    const appointmentId = String(mutation?.entityId ?? payload?.appointmentId ?? '').trim();
    const existingDraft = await client.query(
      `
        SELECT payload, saved_at
        FROM consultation_drafts
        WHERE workspace_id = $1 AND appointment_id = $2
        LIMIT 1
      `,
      [auth.workspace.id, appointmentId]
    );
    const existingBaseVersion = existingDraft.rows[0]
      ? buildDraftBaseVersion(existingDraft.rows[0].payload ?? {}, existingDraft.rows[0].saved_at)
      : '';
    const incomingBaseVersion = String(mutation?.baseVersion ?? '').trim();
    if (existingDraft.rows[0] && incomingBaseVersion && existingBaseVersion && incomingBaseVersion !== existingBaseVersion) {
      throw createSyncError('Draft conflict: the consultation draft changed on another client', {
        status: 'conflict',
        conflictType: 'draft_conflict',
        serverSnapshot: {
          ...existingDraft.rows[0].payload,
          appointmentId,
          savedAt: existingDraft.rows[0].saved_at,
        },
        serverBaseVersion: existingBaseVersion,
      });
    }
    await saveConsultationDraftForEncounter(client, {
      workspaceId: auth.workspace.id,
      doctorUserId: auth.user.id,
      appointmentId,
      payload,
    });
    return {
      entityType,
      operationType,
      appointmentId,
      draft: {
        ...payload,
        appointmentId,
        savedAt: payload?.savedAt ?? new Date().toISOString(),
      },
    };
  }

  if (entityType === 'walk_in' && operationType === 'create') {
    const walkInPayload = payload?.appointment && payload?.patient
      ? {
          patientId: payload.patient.id || '',
          name: payload.patient.name || '',
          phone: payload.patient.phone || '',
          age: Number(payload.patient.age || 0),
          gender: payload.patient.gender || 'Male',
          cnic: payload.patient.cnic || '',
          address: payload.patient.address || '',
          bloodGroup: payload.patient.bloodGroup || '',
          emergencyContact: payload.patient.emergencyContact || '',
          chiefComplaint: payload.chiefComplaint || payload.appointment.chiefComplaint || 'Walk-in',
          date: payload.appointment.date,
        }
      : payload;

    const result = await createWalkInEncounter(client, {
      workspaceId: auth.workspace.id,
      doctorUserId: auth.user.id,
      clinicId: String(payload?.clinicId ?? payload?.appointment?.clinicId ?? '').trim(),
      payload: walkInPayload,
    });

    return {
      entityType,
      operationType,
      patient: mapPatient(result.patient),
      appointment: mapAppointment(result.appointment),
      reusedPatient: result.reusedPatient,
      matchedBy: result.matchedBy,
    };
  }

  if (entityType === 'consultation' && operationType === 'complete') {
    const { noteId } = await completeConsultationEncounter(client, {
      workspaceId: auth.workspace.id,
      doctorUserId: auth.user.id,
      payload,
    });
    const note = await getWorkspaceNoteById(auth.workspace.id, noteId);
    return {
      entityType,
      operationType,
      noteId,
      note,
    };
  }

  if (entityType === 'attachment' && operationType === 'create') {
    const patientId = String(payload?.patientId ?? '').trim();
    const appointmentId = String(payload?.appointmentId ?? '').trim();
    if (!patientId) {
      throw new Error('Attachment is missing patient linkage');
    }

    await requireOwnedPatient(client, auth.workspace.id, patientId);
    if (appointmentId) {
      await requireOwnedAppointment(client, auth.workspace.id, appointmentId);
    }

    const attachmentId = String(payload?.attachmentId ?? mutation?.entityId ?? '').trim() || createId('patient_document');
    const result = await client.query(
      `
        INSERT INTO patient_documents (
          id, workspace_id, patient_id, appointment_id, uploaded_by_user_id, entity_type, entity_id,
          file_name, mime_type, file_size, checksum, remote_key, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id) DO UPDATE SET
          patient_id = EXCLUDED.patient_id,
          appointment_id = EXCLUDED.appointment_id,
          entity_type = EXCLUDED.entity_type,
          entity_id = EXCLUDED.entity_id,
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          file_size = EXCLUDED.file_size,
          checksum = EXCLUDED.checksum,
          remote_key = EXCLUDED.remote_key,
          updated_at = NOW()
        RETURNING *
      `,
      [
        attachmentId,
        auth.workspace.id,
        patientId,
        appointmentId || null,
        auth.user.id,
        String(payload?.entityType ?? (appointmentId ? 'appointment' : 'patient')).trim(),
        String(payload?.entityId ?? appointmentId ?? patientId).trim(),
        String(payload?.fileName ?? '').trim(),
        String(payload?.mimeType ?? '').trim(),
        Number(payload?.fileSize ?? 0),
        String(payload?.checksum ?? '').trim(),
        String(payload?.remoteKey ?? `workspace/${auth.workspace.id}/attachments/${attachmentId}`).trim(),
      ]
    );

    return {
      entityType,
      operationType,
      attachmentId,
      remoteKey: result.rows[0].remote_key,
      attachment: mapPatientDocument(result.rows[0]),
    };
  }

  return { entityType, operationType, skipped: true };
}

async function getDoctorMedicationFavorites(doctorUserId) {
  const favoritesResult = await query(
    `
      SELECT id, registration_no, created_at
      FROM medication_favorites
      WHERE doctor_user_id = $1
      ORDER BY created_at DESC
    `,
    [doctorUserId]
  );

  const registrationNos = favoritesResult.rows.map(row => row.registration_no);
  const medicines = await getMedicationCatalogEntries(registrationNos);
  const medicineByRegistrationNo = new Map(medicines.map(medicine => [medicine.registrationNo, medicine]));

  return favoritesResult.rows
    .map(row => ({
      id: row.id,
      registrationNo: row.registration_no,
      createdAt: row.created_at,
      medicine: medicineByRegistrationNo.get(row.registration_no) ?? null,
    }))
    .filter(item => item.medicine);
}

function normalizeMedicationKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, '')
    .trim();
}

function normalizeLookupKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, '')
    .trim();
}

function buildMedicationEnrichmentLookupKey(parts = {}) {
  const registrationNo = String(parts.registrationNo ?? '').trim();
  if (registrationNo) {
    return `reg:${normalizeLookupKey(registrationNo)}`;
  }

  return [
    'fallback',
    normalizeLookupKey(parts.brandName),
    normalizeLookupKey(parts.genericName),
    normalizeLookupKey(parts.strengthText),
    normalizeLookupKey(parts.dosageForm),
  ].join('|');
}

function buildCustomMedicationLookupKey(parts = {}) {
  return [
    normalizeLookupKey(parts.name),
    normalizeLookupKey(parts.generic),
    normalizeLookupKey(parts.strength),
    normalizeLookupKey(parts.form),
    normalizeLookupKey(parts.route),
  ].join('|');
}

function mapMedicationEnrichment(row) {
  if (!row) return null;

  return {
    registrationNo: row.registration_no,
    lookupKey: row.lookup_key,
    therapeuticCategory: row.therapeutic_category ?? '',
    drugCategory: row.drug_category ?? '',
    tradePrice: row.trade_price ?? '',
    packInfo: row.pack_info ?? '',
    indications: row.indications ?? '',
    dosage: row.dosage ?? '',
    administration: row.administration ?? '',
    contraindications: row.contraindications ?? '',
    precautions: row.precautions ?? '',
    adverseEffects: row.adverse_effects ?? '',
    alternativesSummary: row.alternatives_summary ?? '',
    sourceName: row.source_name ?? 'Licensed Pakistan Source',
    sourceUpdatedAt: row.source_updated_at,
    enrichmentStatus: row.enrichment_status ?? 'partial',
  };
}

async function getMedicationCatalogDetailWithEnrichment(registrationNo) {
  const entry = await getMedicationCatalogEntry(registrationNo);
  if (!entry) return null;

  const fallbackLookupKey = buildMedicationEnrichmentLookupKey({
    brandName: entry.brandName,
    genericName: entry.genericName,
    strengthText: entry.strengthText,
    dosageForm: entry.dosageForm,
  });

  const { rows } = await query(
    `
      SELECT *
      FROM medication_enrichments
      WHERE registration_no = $1
         OR lookup_key = $2
      ORDER BY CASE WHEN registration_no = $1 THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `,
    [String(registrationNo ?? '').trim(), fallbackLookupKey]
  );

  const enrichment = mapMedicationEnrichment(rows[0] ?? null);
  return {
    ...entry,
    detailAvailability: enrichment ? 'enriched' : 'base_only',
    enrichmentStatus: enrichment?.enrichmentStatus ?? 'missing',
    sourceUpdatedAt: enrichment?.sourceUpdatedAt ?? null,
    enrichment,
  };
}

async function getDoctorMedicationPreferences(doctorUserId) {
  const { rows } = await query(
    `
      SELECT id, medication_key, registration_no, payload, created_at, updated_at
      FROM medication_preferences
      WHERE doctor_user_id = $1
      ORDER BY updated_at DESC
    `,
    [doctorUserId]
  );

  return rows.map(row => ({
    id: row.id,
    medicationKey: row.medication_key,
    registrationNo: row.registration_no,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function searchDoctorCustomMedications(workspaceId, doctorUserId, queryText, limit = 20) {
  const normalized = normalizeLookupKey(queryText);
  if (!normalized) return [];

  const { rows } = await query(
    `
      SELECT id, name, generic_name, strength_text, dosage_form, route
      FROM custom_medications
      WHERE workspace_id = $1
        AND doctor_user_id = $2
        AND (
          LOWER(name) LIKE $3
          OR LOWER(generic_name) LIKE $3
          OR LOWER(strength_text) LIKE $3
          OR LOWER(dosage_form) LIKE $3
          OR LOWER(route) LIKE $3
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $4 THEN 0
          WHEN LOWER(name) LIKE $5 THEN 1
          WHEN LOWER(generic_name) LIKE $5 THEN 2
          ELSE 3
        END,
        updated_at DESC
      LIMIT $6
    `,
    [workspaceId, doctorUserId, `%${normalized}%`, normalized, `${normalized}%`, limit]
  );

  return rows.map(row => ({
    registrationNo: '',
    brandName: row.name,
    genericName: row.generic_name ?? '',
    companyName: 'My custom medicine',
    strengthText: row.strength_text ?? '',
    dosageForm: row.dosage_form ?? '',
    route: row.route ?? '',
    sourceType: 'custom',
    customMedicationId: row.id,
  }));
}

async function searchConditionLibrary(workspaceId, doctorUserId, queryText, limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const { rows } = await query(
    `
      SELECT id, code, name, aliases, created_at, updated_at
      FROM condition_library_entries
      WHERE workspace_id = $1
        AND doctor_user_id = $2
        AND (
          $3 = ''
          OR LOWER(name) LIKE $4
          OR LOWER(code) LIKE $4
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(aliases) AS alias
            WHERE LOWER(alias) LIKE $4
          )
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $3 THEN 0
          WHEN LOWER(code) = $3 THEN 1
          WHEN LOWER(name) LIKE $5 THEN 2
          WHEN LOWER(code) LIKE $5 THEN 3
          ELSE 4
        END,
        updated_at DESC,
        name ASC
      LIMIT $6
    `,
    [workspaceId, doctorUserId, normalized, `%${normalized}%`, `${normalized}%`, limit]
  );

  return rows.map(mapConditionLibraryEntry);
}

async function searchProcedureLibrary(workspaceId, doctorUserId, queryText, limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const { rows } = await query(
    `
      SELECT id, name, category, notes, created_at, updated_at
      FROM procedure_library_entries
      WHERE workspace_id = $1
        AND doctor_user_id = $2
        AND (
          $3 = ''
          OR LOWER(name) LIKE $4
          OR LOWER(category) LIKE $4
          OR LOWER(notes) LIKE $4
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $3 THEN 0
          WHEN LOWER(name) LIKE $5 THEN 1
          WHEN LOWER(category) LIKE $5 THEN 2
          ELSE 3
        END,
        updated_at DESC,
        name ASC
      LIMIT $6
    `,
    [workspaceId, doctorUserId, normalized, `%${normalized}%`, `${normalized}%`, limit]
  );

  return rows.map(mapProcedureLibraryEntry);
}

async function searchDiagnosisCatalog(queryText, limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const { rows } = await query(
    `
      SELECT id, code, name, is_active
      FROM diagnosis_catalog
      WHERE is_active = TRUE
        AND (
          $1 = ''
          OR LOWER(name) LIKE $2
          OR LOWER(code) LIKE $2
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $1 THEN 0
          WHEN LOWER(code) = $1 THEN 1
          WHEN LOWER(name) LIKE $3 THEN 2
          WHEN LOWER(code) LIKE $3 THEN 3
          ELSE 4
        END,
        name ASC
      LIMIT $4
    `,
    [normalized, `%${normalized}%`, `${normalized}%`, limit]
  );

  return rows.map(mapDiagnosisCatalogEntry);
}

async function searchInvestigationCatalog(queryText, type = '', limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const normalizedType = String(type ?? '').trim();
  const { rows } = await query(
    `
      SELECT id, name, category, type, is_active
      FROM investigation_catalog
      WHERE is_active = TRUE
        AND ($1 = '' OR type = $1)
        AND (
          $2 = ''
          OR LOWER(name) LIKE $3
          OR LOWER(category) LIKE $3
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $2 THEN 0
          WHEN LOWER(name) LIKE $4 THEN 1
          ELSE 2
        END,
        name ASC
      LIMIT $5
    `,
    [normalizedType, normalized, `%${normalized}%`, `${normalized}%`, limit]
  );

  return rows.map(mapInvestigationCatalogEntry);
}

async function searchReferralSpecialtiesCatalog(queryText, limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const { rows } = await query(
    `
      SELECT id, name, is_active
      FROM referral_specialties
      WHERE is_active = TRUE
        AND ($1 = '' OR LOWER(name) LIKE $2)
      ORDER BY
        CASE
          WHEN LOWER(name) = $1 THEN 0
          WHEN LOWER(name) LIKE $3 THEN 1
          ELSE 2
        END,
        name ASC
      LIMIT $4
    `,
    [normalized, `%${normalized}%`, `${normalized}%`, limit]
  );
  return rows.map(mapReferralSpecialty);
}

async function searchReferralFacilitiesCatalog(queryText, limit = 20) {
  const normalized = String(queryText ?? '').trim().toLowerCase();
  const { rows } = await query(
    `
      SELECT id, name, city, phone, is_active
      FROM referral_facilities
      WHERE is_active = TRUE
        AND (
          $1 = ''
          OR LOWER(name) LIKE $2
          OR LOWER(city) LIKE $2
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = $1 THEN 0
          WHEN LOWER(name) LIKE $3 THEN 1
          ELSE 2
        END,
        name ASC
      LIMIT $4
    `,
    [normalized, `%${normalized}%`, `${normalized}%`, limit]
  );
  return rows.map(mapReferralFacility);
}

async function listDiagnosisCatalogEntries() {
  const { rows } = await query(
    `
      SELECT id, code, name, is_active
      FROM diagnosis_catalog
      ORDER BY is_active DESC, name ASC
    `
  );
  return rows.map(mapDiagnosisCatalogEntry);
}

async function listInvestigationCatalogEntries() {
  const { rows } = await query(
    `
      SELECT id, name, category, type, is_active
      FROM investigation_catalog
      ORDER BY is_active DESC, type ASC, name ASC
    `
  );
  return rows.map(mapInvestigationCatalogEntry);
}

async function listReferralSpecialtiesCatalogEntries() {
  const { rows } = await query(
    `
      SELECT id, name, is_active
      FROM referral_specialties
      ORDER BY is_active DESC, name ASC
    `
  );
  return rows.map(mapReferralSpecialty);
}

async function listReferralFacilitiesCatalogEntries() {
  const { rows } = await query(
    `
      SELECT id, name, city, phone, is_active
      FROM referral_facilities
      ORDER BY is_active DESC, name ASC
    `
  );
  return rows.map(mapReferralFacility);
}

async function getDoctorDiagnosisFavorites(doctorUserId) {
  const { rows } = await query(
    `
      SELECT dc.id, dc.code, dc.name, dc.is_active
      FROM doctor_diagnosis_favorites fav
      JOIN diagnosis_catalog dc ON dc.id = fav.diagnosis_catalog_id
      WHERE fav.doctor_user_id = $1
      ORDER BY fav.created_at DESC
    `,
    [doctorUserId]
  );
  return rows.map(mapDiagnosisCatalogEntry);
}

async function getDoctorRecentDiagnoses(doctorUserId) {
  const { rows } = await query(
    `
      SELECT DISTINCT ON (LOWER(d.name), LOWER(d.code))
        d.name, d.code
      FROM diagnoses d
      JOIN clinical_notes cn ON cn.id = d.note_id
      WHERE cn.doctor_user_id = $1
      ORDER BY LOWER(d.name), LOWER(d.code), cn.date DESC
      LIMIT 20
    `,
    [doctorUserId]
  );
  return rows.map((row, index) => ({
    id: `recent-diagnosis-${index}-${row.code || row.name}`,
    code: row.code,
    name: row.name,
    isActive: true,
  }));
}

async function getDoctorInvestigationFavorites(doctorUserId, type = '') {
  const { rows } = await query(
    `
      SELECT ic.id, ic.name, ic.category, ic.type, ic.is_active
      FROM doctor_investigation_favorites fav
      JOIN investigation_catalog ic ON ic.id = fav.investigation_catalog_id
      WHERE fav.doctor_user_id = $1
        AND ($2 = '' OR ic.type = $2)
      ORDER BY fav.created_at DESC
    `,
    [doctorUserId, type]
  );
  return rows.map(mapInvestigationCatalogEntry);
}

async function getDoctorRecentInvestigations(doctorUserId, type = '') {
  const recentRows = await query(
    `
      SELECT id, name, category, type, priority, notes, updated_at
      FROM doctor_recent_investigations
      WHERE doctor_user_id = $1
        AND ($2 = '' OR type = $2)
      ORDER BY updated_at DESC
      LIMIT 20
    `,
    [doctorUserId, type]
  );

  const recentEntries = recentRows.rows.map(row => mapInvestigationCatalogEntry({
    ...row,
    is_active: true,
  }));

  const recentKeys = new Set(recentEntries.map(item => `${item.type}::${item.category.toLowerCase()}::${item.name.toLowerCase()}`));

  const { rows } = await query(
    `
      SELECT DISTINCT ON (LOWER(lo.test_name), LOWER(lo.category))
        lo.test_name,
        lo.category
      FROM lab_orders lo
      JOIN clinical_notes cn ON cn.id = lo.note_id
      WHERE cn.doctor_user_id = $1
        AND (
          $2 = ''
          OR (
            $2 = 'radiology'
            AND (LOWER(lo.category) LIKE '%radiology%' OR LOWER(lo.category) LIKE '%ct%' OR LOWER(lo.category) LIKE '%mri%' OR LOWER(lo.category) LIKE '%ultrasound%')
          )
          OR (
            $2 = 'lab'
            AND NOT (LOWER(lo.category) LIKE '%radiology%' OR LOWER(lo.category) LIKE '%ct%' OR LOWER(lo.category) LIKE '%mri%' OR LOWER(lo.category) LIKE '%ultrasound%')
          )
        )
      ORDER BY LOWER(lo.test_name), LOWER(lo.category), cn.date DESC
      LIMIT 20
    `,
    [doctorUserId, type]
  );
  const noteEntries = rows
    .map((row, index) => ({
      id: `recent-investigation-${index}-${row.test_name}`,
      name: row.test_name,
      category: row.category,
      type: type || 'lab',
      is_active: true,
    }))
    .map(mapInvestigationCatalogEntry)
    .filter(item => !recentKeys.has(`${item.type}::${item.category.toLowerCase()}::${item.name.toLowerCase()}`));

  return [...recentEntries, ...noteEntries].slice(0, 20);
}

async function getDoctorReferralFavorites(doctorUserId, targetType) {
  if (targetType === 'specialty') {
    const { rows } = await query(
      `
        SELECT rs.id, rs.name, rs.is_active
        FROM doctor_referral_favorites fav
        JOIN referral_specialties rs ON rs.id = fav.target_id
        WHERE fav.doctor_user_id = $1 AND fav.target_type = 'specialty'
        ORDER BY fav.created_at DESC
      `,
      [doctorUserId]
    );
    return rows.map(mapReferralSpecialty);
  }

  const { rows } = await query(
    `
      SELECT rf.id, rf.name, rf.city, rf.phone, rf.is_active
      FROM doctor_referral_favorites fav
      JOIN referral_facilities rf ON rf.id = fav.target_id
      WHERE fav.doctor_user_id = $1 AND fav.target_type = 'facility'
      ORDER BY fav.created_at DESC
    `,
    [doctorUserId]
  );
  return rows.map(mapReferralFacility);
}

async function getDoctorRecentReferralTargets(doctorUserId, targetType) {
  if (targetType === 'specialty') {
    const { rows } = await query(
      `
        SELECT DISTINCT ON (LOWER(title)) title
        FROM care_actions
        WHERE doctor_user_id = $1
          AND type = 'referral'
          AND target_type = 'specialty'
          AND title <> ''
        ORDER BY LOWER(title), created_at DESC
        LIMIT 20
      `,
      [doctorUserId]
    );
    return rows.map((row, index) => ({
      id: `recent-specialty-${index}-${row.title}`,
      name: row.title,
      isActive: true,
    }));
  }

  const { rows } = await query(
    `
      SELECT DISTINCT ON (LOWER(title)) title
      FROM care_actions
      WHERE doctor_user_id = $1
        AND type IN ('admission', 'referral')
        AND target_type = 'facility'
        AND title <> ''
      ORDER BY LOWER(title), created_at DESC
      LIMIT 20
    `,
    [doctorUserId]
  );
  return rows.map((row, index) => ({
    id: `recent-facility-${index}-${row.title}`,
    name: row.title,
    city: '',
    phone: '',
    isActive: true,
  }));
}

function mapTreatmentTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    conditionLabel: row.condition_label ?? '',
    chiefComplaint: row.chief_complaint ?? '',
    instructions: row.instructions ?? '',
    followUp: row.follow_up ?? '',
    diagnoses: row.diagnoses ?? [],
    medications: row.medications ?? [],
    labOrders: row.lab_orders ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDiagnosisSet(row) {
  return {
    id: row.id,
    name: row.name,
    diagnoses: row.diagnoses ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvestigationSet(row) {
  return {
    id: row.id,
    name: row.name,
    labOrders: row.lab_orders ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdviceTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    languageMode: row.language_mode,
    instructions: row.instructions ?? '',
    followUp: row.follow_up ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDoctorTreatmentTemplates(workspaceId, doctorUserId) {
  const { rows } = await query(
    `
      SELECT id, name, condition_label, chief_complaint, instructions, follow_up, diagnoses, medications, lab_orders, created_at, updated_at
      FROM treatment_templates
      WHERE workspace_id = $1 AND doctor_user_id = $2
      ORDER BY updated_at DESC, created_at DESC
    `,
    [workspaceId, doctorUserId]
  );

  return rows.map(mapTreatmentTemplate);
}

async function getDoctorDiagnosisSets(workspaceId, doctorUserId) {
  const { rows } = await query(
    `
      SELECT id, name, diagnoses, created_at, updated_at
      FROM diagnosis_sets
      WHERE workspace_id = $1 AND doctor_user_id = $2
      ORDER BY updated_at DESC, created_at DESC
    `,
    [workspaceId, doctorUserId]
  );

  return rows.map(mapDiagnosisSet);
}

async function getDoctorInvestigationSets(workspaceId, doctorUserId) {
  const { rows } = await query(
    `
      SELECT id, name, lab_orders, created_at, updated_at
      FROM investigation_sets
      WHERE workspace_id = $1 AND doctor_user_id = $2
      ORDER BY updated_at DESC, created_at DESC
    `,
    [workspaceId, doctorUserId]
  );

  return rows.map(mapInvestigationSet);
}

async function getDoctorAdviceTemplates(workspaceId, doctorUserId) {
  const { rows } = await query(
    `
      SELECT id, name, language_mode, instructions, follow_up, created_at, updated_at
      FROM advice_templates
      WHERE workspace_id = $1 AND doctor_user_id = $2
      ORDER BY updated_at DESC, created_at DESC
    `,
    [workspaceId, doctorUserId]
  );

  return rows.map(mapAdviceTemplate);
}

async function importStarterTreatmentTemplates(workspaceId, doctorUserId) {
  await withTransaction(async client => {
    for (const template of starterTreatmentTemplates) {
      const existing = await client.query(
        `
          SELECT 1
          FROM treatment_templates
          WHERE workspace_id = $1 AND doctor_user_id = $2 AND lower(name) = lower($3)
          LIMIT 1
        `,
        [workspaceId, doctorUserId, template.name]
      );

      if (existing.rowCount > 0) {
        continue;
      }

      await client.query(
        `
          INSERT INTO treatment_templates (
            id, workspace_id, doctor_user_id, name, condition_label, chief_complaint,
            instructions, follow_up, diagnoses, medications, lab_orders
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          createId('treatment_template'),
          workspaceId,
          doctorUserId,
          template.name,
          template.conditionLabel,
          template.chiefComplaint,
          template.instructions,
          template.followUp,
          template.diagnoses,
          template.medications,
          template.labOrders,
        ]
      );
    }
  });
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
}));

app.get('/api/medication-catalog', requireAuth, asyncHandler(async (req, res) => {
  const queryText = String(req.query.q ?? '').trim();
  const limit = Number(req.query.limit ?? 20);
  const cursor = Number(req.query.cursor ?? 0);
  const safeLimit = Number.isFinite(limit) ? limit : 20;
  const safeCursor = Number.isFinite(cursor) ? cursor : 0;
  const [result, customEntries] = await Promise.all([
    searchMedicationCatalog(queryText, safeLimit, safeCursor),
    req.auth.user.role === 'doctor_owner'
      ? searchDoctorCustomMedications(req.auth.workspace.id, req.auth.user.id, queryText, Math.min(safeLimit, 20))
      : Promise.resolve([]),
  ]);
  res.json({
    data: safeCursor > 0 ? result.entries : [...customEntries, ...result.entries].slice(0, 20),
    meta: {
      ...result.metadata,
      hasMore: safeCursor > 0 ? result.hasMore : result.hasMore || result.entries.length + customEntries.length > 20,
      nextCursor: safeCursor > 0 ? result.nextCursor : result.nextCursor,
    },
  });
}));

app.get('/api/medication-catalog/:registrationNo', requireAuth, asyncHandler(async (req, res) => {
  const entry = await getMedicationCatalogDetailWithEnrichment(String(req.params.registrationNo ?? ''));
  if (!entry) {
    res.status(404).json({ error: 'Medication not found', code: 'MEDICATION_NOT_FOUND' });
    return;
  }

  res.json({ data: entry });
}));

app.get('/api/medication-favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const favorites = await getDoctorMedicationFavorites(req.auth.user.id);
  res.json({ data: favorites });
}));

app.post('/api/medication-favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const registrationNo = String(req.body?.registrationNo ?? '').trim();
  if (!registrationNo) {
    res.status(400).json({ error: 'Registration number is required', code: 'INVALID_MEDICATION_FAVORITE' });
    return;
  }

  const medicine = await getMedicationCatalogEntry(registrationNo);
  if (!medicine) {
    res.status(404).json({ error: 'Medication not found', code: 'MEDICATION_NOT_FOUND' });
    return;
  }

  await withTransaction(async client => {
    await client.query(
      `
        INSERT INTO medication_favorites (id, doctor_user_id, registration_no)
        VALUES ($1, $2, $3)
        ON CONFLICT (doctor_user_id, registration_no)
        DO UPDATE SET updated_at = NOW()
      `,
      [createId('medication_favorite'), req.auth.user.id, registrationNo]
    );
  });

  const favorites = await getDoctorMedicationFavorites(req.auth.user.id);
  const favorite = favorites.find(item => item.registrationNo === registrationNo);
  res.status(201).json({ data: favorite });
}));

app.delete('/api/medication-favorites/:registrationNo', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(
    `
      DELETE FROM medication_favorites
      WHERE doctor_user_id = $1 AND registration_no = $2
    `,
    [req.auth.user.id, String(req.params.registrationNo ?? '').trim()]
  );

  res.json({ ok: true });
}));

app.get('/api/medication-preferences', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const preferences = await getDoctorMedicationPreferences(req.auth.user.id);
  res.json({ data: preferences });
}));

app.post('/api/custom-medications', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(customMedicationSchema, req.body ?? {}, 'INVALID_CUSTOM_MEDICATION');
  const lookupKey = buildCustomMedicationLookupKey(payload);

  const { rows } = await query(
    `
      INSERT INTO custom_medications (
        id, workspace_id, doctor_user_id, lookup_key, name, generic_name, strength_text, dosage_form, route
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (doctor_user_id, lookup_key)
      DO UPDATE SET
        name = EXCLUDED.name,
        generic_name = EXCLUDED.generic_name,
        strength_text = EXCLUDED.strength_text,
        dosage_form = EXCLUDED.dosage_form,
        route = EXCLUDED.route,
        updated_at = NOW()
      RETURNING id, name, generic_name, strength_text, dosage_form, route
    `,
    [
      createId('custom_medication'),
      req.auth.workspace.id,
      req.auth.user.id,
      lookupKey,
      payload.name.trim(),
      payload.generic.trim(),
      payload.strength.trim(),
      payload.form.trim(),
      payload.route.trim(),
    ]
  );

  res.status(201).json({
    data: {
      registrationNo: '',
      brandName: rows[0].name,
      genericName: rows[0].generic_name ?? '',
      companyName: 'My custom medicine',
      strengthText: rows[0].strength_text ?? '',
      dosageForm: rows[0].dosage_form ?? '',
      route: rows[0].route ?? '',
      sourceType: 'custom',
      customMedicationId: rows[0].id,
    },
  });
}));

app.put('/api/medication-preferences', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const medicationKey = normalizeMedicationKey(req.body?.medicationKey);
  const registrationNo = String(req.body?.registrationNo ?? '').trim();
  const payload = req.body?.payload ?? {};

  if (!medicationKey) {
    return res.status(400).json({ error: 'Medication key is required', code: 'INVALID_MEDICATION_PREFERENCE' });
  }

  await withTransaction(async client => {
    await client.query(
      `
        INSERT INTO medication_preferences (id, doctor_user_id, medication_key, registration_no, payload)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (doctor_user_id, medication_key)
        DO UPDATE SET registration_no = EXCLUDED.registration_no, payload = EXCLUDED.payload, updated_at = NOW()
      `,
      [createId('medication_preference'), req.auth.user.id, medicationKey, registrationNo, payload]
    );
  });

  const preferences = await getDoctorMedicationPreferences(req.auth.user.id);
  const preference = preferences.find(item => item.medicationKey === medicationKey);
  res.json({ data: preference });
}));

app.get('/api/condition-library', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const items = await searchConditionLibrary(req.auth.workspace.id, req.auth.user.id, String(req.query.q ?? ''), Number(req.query.limit ?? 20));
  res.json({ data: items });
}));

app.post('/api/condition-library', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(conditionLibrarySchema, req.body, 'INVALID_CONDITION_LIBRARY');
  const { rows } = await query(
    `
      INSERT INTO condition_library_entries (id, workspace_id, doctor_user_id, code, name, aliases)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, code, name, aliases, created_at, updated_at
    `,
    [createId('condition_library_entry'), req.auth.workspace.id, req.auth.user.id, payload.code, payload.name, payload.aliases]
  );
  res.status(201).json({ data: mapConditionLibraryEntry(rows[0]) });
}));

app.put('/api/condition-library/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(conditionLibrarySchema, req.body, 'INVALID_CONDITION_LIBRARY');
  const entryId = String(req.params.id ?? '').trim();
  const { rows } = await query(
    `
      UPDATE condition_library_entries
      SET code = $4, name = $5, aliases = $6, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3
      RETURNING id, code, name, aliases, created_at, updated_at
    `,
    [entryId, req.auth.workspace.id, req.auth.user.id, payload.code, payload.name, payload.aliases]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Condition library entry not found', code: 'CONDITION_LIBRARY_NOT_FOUND' });
  }
  res.json({ data: mapConditionLibraryEntry(rows[0]) });
}));

app.delete('/api/condition-library/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(
    `DELETE FROM condition_library_entries WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3`,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, req.auth.user.id]
  );
  res.json({ ok: true });
}));

app.get('/api/procedure-library', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const items = await searchProcedureLibrary(req.auth.workspace.id, req.auth.user.id, String(req.query.q ?? ''), Number(req.query.limit ?? 20));
  res.json({ data: items });
}));

app.post('/api/procedure-library', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(procedureLibrarySchema, req.body, 'INVALID_PROCEDURE_LIBRARY');
  const { rows } = await query(
    `
      INSERT INTO procedure_library_entries (id, workspace_id, doctor_user_id, name, category, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, category, notes, created_at, updated_at
    `,
    [createId('procedure_library_entry'), req.auth.workspace.id, req.auth.user.id, payload.name, payload.category, payload.notes]
  );
  res.status(201).json({ data: mapProcedureLibraryEntry(rows[0]) });
}));

app.get('/api/diagnosis-catalog', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const items = await searchDiagnosisCatalog(String(req.query.q ?? ''), Number(req.query.limit ?? 20));
  res.json({ data: items });
}));

app.get('/api/diagnosis-catalog/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorDiagnosisFavorites(req.auth.user.id) });
}));

app.get('/api/diagnosis-catalog/recents', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorRecentDiagnoses(req.auth.user.id) });
}));

app.post('/api/diagnosis-catalog/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const catalogId = String(req.body?.catalogId ?? '').trim();
  if (!catalogId) return res.status(400).json({ error: 'Catalog entry is required', code: 'INVALID_DIAGNOSIS_FAVORITE' });
  await query(
    `INSERT INTO doctor_diagnosis_favorites (id, doctor_user_id, diagnosis_catalog_id) VALUES ($1, $2, $3)
     ON CONFLICT (doctor_user_id, diagnosis_catalog_id) DO UPDATE SET updated_at = NOW()`,
    [createId('doctor_diagnosis_favorite'), req.auth.user.id, catalogId]
  );
  res.status(201).json({ ok: true });
}));

app.delete('/api/diagnosis-catalog/favorites/:catalogId', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM doctor_diagnosis_favorites WHERE doctor_user_id = $1 AND diagnosis_catalog_id = $2`, [req.auth.user.id, String(req.params.catalogId ?? '').trim()]);
  res.json({ ok: true });
}));

app.get('/api/investigation-catalog', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const items = await searchInvestigationCatalog(String(req.query.q ?? ''), String(req.query.type ?? ''), Number(req.query.limit ?? 20));
  res.json({ data: items });
}));

app.get('/api/investigation-catalog/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorInvestigationFavorites(req.auth.user.id, String(req.query.type ?? '')) });
}));

app.get('/api/investigation-catalog/recents', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorRecentInvestigations(req.auth.user.id, String(req.query.type ?? '')) });
}));

app.post('/api/investigation-catalog/recents', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(recentInvestigationSchema, req.body, 'INVALID_RECENT_INVESTIGATION');
  const lookupKey = `${payload.type}::${normalizeLookupKey(payload.category)}::${normalizeLookupKey(payload.name)}`;
  await query(
    `
      INSERT INTO doctor_recent_investigations (id, doctor_user_id, lookup_key, name, category, type, priority, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (doctor_user_id, lookup_key)
      DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        type = EXCLUDED.type,
        priority = EXCLUDED.priority,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `,
    [createId('doctor_recent_investigation'), req.auth.user.id, lookupKey, payload.name, payload.category, payload.type, payload.priority, payload.notes]
  );
  res.status(201).json({ ok: true });
}));

app.post('/api/investigation-catalog/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const catalogId = String(req.body?.catalogId ?? '').trim();
  if (!catalogId) return res.status(400).json({ error: 'Catalog entry is required', code: 'INVALID_INVESTIGATION_FAVORITE' });
  await query(
    `INSERT INTO doctor_investigation_favorites (id, doctor_user_id, investigation_catalog_id) VALUES ($1, $2, $3)
     ON CONFLICT (doctor_user_id, investigation_catalog_id) DO UPDATE SET updated_at = NOW()`,
    [createId('doctor_investigation_favorite'), req.auth.user.id, catalogId]
  );
  res.status(201).json({ ok: true });
}));

app.delete('/api/investigation-catalog/favorites/:catalogId', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM doctor_investigation_favorites WHERE doctor_user_id = $1 AND investigation_catalog_id = $2`, [req.auth.user.id, String(req.params.catalogId ?? '').trim()]);
  res.json({ ok: true });
}));

app.get('/api/referral-specialties', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await searchReferralSpecialtiesCatalog(String(req.query.q ?? ''), Number(req.query.limit ?? 20)) });
}));

app.get('/api/referral-specialties/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorReferralFavorites(req.auth.user.id, 'specialty') });
}));

app.get('/api/referral-specialties/recents', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorRecentReferralTargets(req.auth.user.id, 'specialty') });
}));

app.post('/api/referral-specialties/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const targetId = String(req.body?.targetId ?? '').trim();
  if (!targetId) return res.status(400).json({ error: 'Specialty is required', code: 'INVALID_REFERRAL_FAVORITE' });
  await query(
    `INSERT INTO doctor_referral_favorites (id, doctor_user_id, target_type, target_id) VALUES ($1, $2, 'specialty', $3)
     ON CONFLICT (doctor_user_id, target_type, target_id) DO UPDATE SET updated_at = NOW()`,
    [createId('doctor_referral_favorite'), req.auth.user.id, targetId]
  );
  res.status(201).json({ ok: true });
}));

app.delete('/api/referral-specialties/favorites/:targetId', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM doctor_referral_favorites WHERE doctor_user_id = $1 AND target_type = 'specialty' AND target_id = $2`, [req.auth.user.id, String(req.params.targetId ?? '').trim()]);
  res.json({ ok: true });
}));

app.get('/api/referral-facilities', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await searchReferralFacilitiesCatalog(String(req.query.q ?? ''), Number(req.query.limit ?? 20)) });
}));

app.get('/api/referral-facilities/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorReferralFavorites(req.auth.user.id, 'facility') });
}));

app.get('/api/referral-facilities/recents', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  res.json({ data: await getDoctorRecentReferralTargets(req.auth.user.id, 'facility') });
}));

app.post('/api/referral-facilities/favorites', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const targetId = String(req.body?.targetId ?? '').trim();
  if (!targetId) return res.status(400).json({ error: 'Facility is required', code: 'INVALID_REFERRAL_FAVORITE' });
  await query(
    `INSERT INTO doctor_referral_favorites (id, doctor_user_id, target_type, target_id) VALUES ($1, $2, 'facility', $3)
     ON CONFLICT (doctor_user_id, target_type, target_id) DO UPDATE SET updated_at = NOW()`,
    [createId('doctor_referral_favorite'), req.auth.user.id, targetId]
  );
  res.status(201).json({ ok: true });
}));

app.delete('/api/referral-facilities/favorites/:targetId', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(`DELETE FROM doctor_referral_favorites WHERE doctor_user_id = $1 AND target_type = 'facility' AND target_id = $2`, [req.auth.user.id, String(req.params.targetId ?? '').trim()]);
  res.json({ ok: true });
}));

app.get('/api/care-actions', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId ?? '').trim();
  if (patientId) {
    const rows = await query(
      `SELECT * FROM care_actions WHERE workspace_id = $1 AND patient_id = $2 ORDER BY created_at DESC`,
      [req.auth.workspace.id, patientId]
    );
    return res.json({ data: rows.rows.map(mapCareAction) });
  }
  const rows = await query(
    `SELECT * FROM care_actions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.auth.workspace.id]
  );
  res.json({ data: rows.rows.map(mapCareAction) });
}));

app.post('/api/care-actions', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(careActionSchema, req.body, 'INVALID_CARE_ACTION');
  const appointmentCheck = await withTransaction(client => requireOwnedAppointment(client, req.auth.workspace.id, payload.appointmentId));
  if (appointmentCheck.patient_id !== payload.patientId || appointmentCheck.clinic_id !== payload.clinicId) {
    return res.status(400).json({ error: 'Care action does not match appointment context', code: 'INVALID_CARE_ACTION' });
  }
  const result = await query(
    `INSERT INTO care_actions (
      id, appointment_id, workspace_id, patient_id, clinic_id, doctor_user_id, type, target_type, target_id, title, notes, urgency, action_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      createId('care_action'),
      payload.appointmentId,
      req.auth.workspace.id,
      payload.patientId,
      payload.clinicId,
      req.auth.user.id,
      payload.type,
      payload.targetType,
      payload.targetId,
      payload.title,
      payload.notes,
      payload.urgency,
      payload.actionDate,
    ]
  );
  res.status(201).json({ data: mapCareAction(result.rows[0]) });
}));

app.get('/api/treatment-templates', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const templates = await getDoctorTreatmentTemplates(req.auth.workspace.id, req.auth.user.id);
  res.json({ data: templates });
}));

app.post('/api/treatment-templates/import-starters', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await importStarterTreatmentTemplates(req.auth.workspace.id, req.auth.user.id);
  const templates = await getDoctorTreatmentTemplates(req.auth.workspace.id, req.auth.user.id);
  res.json({ data: templates });
}));

app.post('/api/treatment-templates', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(treatmentTemplateSchema, req.body, 'INVALID_TREATMENT_TEMPLATE');

  const templateId = createId('treatment_template');
  await query(
    `
      INSERT INTO treatment_templates (
        id, workspace_id, doctor_user_id, name, condition_label, chief_complaint,
        instructions, follow_up, diagnoses, medications, lab_orders
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      templateId,
      req.auth.workspace.id,
      req.auth.user.id,
      payload.name,
      payload.conditionLabel,
      payload.chiefComplaint,
      payload.instructions,
      payload.followUp,
      JSON.stringify(payload.diagnoses),
      JSON.stringify(payload.medications),
      JSON.stringify(payload.labOrders),
    ]
  );

  const templates = await getDoctorTreatmentTemplates(req.auth.workspace.id, req.auth.user.id);
  res.status(201).json({ data: templates.find(item => item.id === templateId) });
}));

app.put('/api/treatment-templates/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(treatmentTemplateSchema, req.body, 'INVALID_TREATMENT_TEMPLATE');
  const templateId = String(req.params.id ?? '').trim();

  const result = await query(
    `
      UPDATE treatment_templates
      SET
        name = $3,
        condition_label = $4,
        chief_complaint = $5,
        instructions = $6,
        follow_up = $7,
        diagnoses = $8,
        medications = $9,
        lab_orders = $10,
        updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $11
      RETURNING id, name, condition_label, chief_complaint, instructions, follow_up, diagnoses, medications, lab_orders, created_at, updated_at
    `,
    [
      templateId,
      req.auth.workspace.id,
      payload.name,
      payload.conditionLabel,
      payload.chiefComplaint,
      payload.instructions,
      payload.followUp,
      JSON.stringify(payload.diagnoses),
      JSON.stringify(payload.medications),
      JSON.stringify(payload.labOrders),
      req.auth.user.id,
    ]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Treatment template not found', code: 'TREATMENT_TEMPLATE_NOT_FOUND' });
    return;
  }

  res.json({ data: mapTreatmentTemplate(result.rows[0]) });
}));

app.delete('/api/treatment-templates/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const result = await query(
    `
      DELETE FROM treatment_templates
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3
    `,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, req.auth.user.id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Treatment template not found', code: 'TREATMENT_TEMPLATE_NOT_FOUND' });
    return;
  }

  res.json({ ok: true });
}));

app.get('/api/diagnosis-sets', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const sets = await getDoctorDiagnosisSets(req.auth.workspace.id, req.auth.user.id);
  res.json({ data: sets });
}));

app.post('/api/diagnosis-sets', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(diagnosisSetSchema, req.body, 'INVALID_DIAGNOSIS_SET');
  const setId = createId('diagnosis_set');

  await query(
    `
      INSERT INTO diagnosis_sets (id, workspace_id, doctor_user_id, name, diagnoses)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [setId, req.auth.workspace.id, req.auth.user.id, payload.name, JSON.stringify(payload.diagnoses)]
  );

  const sets = await getDoctorDiagnosisSets(req.auth.workspace.id, req.auth.user.id);
  res.status(201).json({ data: sets.find(item => item.id === setId) });
}));

app.put('/api/diagnosis-sets/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(diagnosisSetSchema, req.body, 'INVALID_DIAGNOSIS_SET');
  const result = await query(
    `
      UPDATE diagnosis_sets
      SET name = $3, diagnoses = $4, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $5
      RETURNING id, name, diagnoses, created_at, updated_at
    `,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, payload.name, JSON.stringify(payload.diagnoses), req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Diagnosis set not found', code: 'DIAGNOSIS_SET_NOT_FOUND' });
  }

  res.json({ data: mapDiagnosisSet(result.rows[0]) });
}));

app.delete('/api/diagnosis-sets/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM diagnosis_sets WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3`,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Diagnosis set not found', code: 'DIAGNOSIS_SET_NOT_FOUND' });
  }

  res.json({ ok: true });
}));

app.get('/api/investigation-sets', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const sets = await getDoctorInvestigationSets(req.auth.workspace.id, req.auth.user.id);
  res.json({ data: sets });
}));

app.post('/api/investigation-sets', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(investigationSetSchema, req.body, 'INVALID_INVESTIGATION_SET');
  const setId = createId('investigation_set');

  await query(
    `
      INSERT INTO investigation_sets (id, workspace_id, doctor_user_id, name, lab_orders)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [setId, req.auth.workspace.id, req.auth.user.id, payload.name, JSON.stringify(payload.labOrders)]
  );

  const sets = await getDoctorInvestigationSets(req.auth.workspace.id, req.auth.user.id);
  res.status(201).json({ data: sets.find(item => item.id === setId) });
}));

app.put('/api/investigation-sets/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(investigationSetSchema, req.body, 'INVALID_INVESTIGATION_SET');
  const result = await query(
    `
      UPDATE investigation_sets
      SET name = $3, lab_orders = $4, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $5
      RETURNING id, name, lab_orders, created_at, updated_at
    `,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, payload.name, JSON.stringify(payload.labOrders), req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Investigation set not found', code: 'INVESTIGATION_SET_NOT_FOUND' });
  }

  res.json({ data: mapInvestigationSet(result.rows[0]) });
}));

app.delete('/api/investigation-sets/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM investigation_sets WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3`,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Investigation set not found', code: 'INVESTIGATION_SET_NOT_FOUND' });
  }

  res.json({ ok: true });
}));

app.get('/api/advice-templates', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const templates = await getDoctorAdviceTemplates(req.auth.workspace.id, req.auth.user.id);
  res.json({ data: templates });
}));

app.post('/api/advice-templates', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(adviceTemplateSchema, req.body, 'INVALID_ADVICE_TEMPLATE');
  const templateId = createId('advice_template');

  await query(
    `
      INSERT INTO advice_templates (id, workspace_id, doctor_user_id, name, language_mode, instructions, follow_up)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [templateId, req.auth.workspace.id, req.auth.user.id, payload.name, payload.languageMode, payload.instructions, payload.followUp]
  );

  const templates = await getDoctorAdviceTemplates(req.auth.workspace.id, req.auth.user.id);
  res.status(201).json({ data: templates.find(item => item.id === templateId) });
}));

app.put('/api/advice-templates/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(adviceTemplateSchema, req.body, 'INVALID_ADVICE_TEMPLATE');
  const result = await query(
    `
      UPDATE advice_templates
      SET name = $3, language_mode = $4, instructions = $5, follow_up = $6, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $7
      RETURNING id, name, language_mode, instructions, follow_up, created_at, updated_at
    `,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, payload.name, payload.languageMode, payload.instructions, payload.followUp, req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Advice template not found', code: 'ADVICE_TEMPLATE_NOT_FOUND' });
  }

  res.json({ data: mapAdviceTemplate(result.rows[0]) });
}));

app.delete('/api/advice-templates/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const result = await query(
    `DELETE FROM advice_templates WHERE id = $1 AND workspace_id = $2 AND doctor_user_id = $3`,
    [String(req.params.id ?? '').trim(), req.auth.workspace.id, req.auth.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Advice template not found', code: 'ADVICE_TEMPLATE_NOT_FOUND' });
  }

  res.json({ ok: true });
}));

app.post('/api/auth/signup', authRateLimit, asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    phone,
    password,
    pmcNumber,
    specialization,
    qualifications,
    clinicName,
    city,
    notes,
  } = parseOrThrow(signupSchema, req.body ?? {}, 'INVALID_SIGNUP');

  const passwordIssue = validatePasswordPolicy(password);
  if (passwordIssue) {
    return res.status(400).json({ error: passwordIssue, code: 'WEAK_PASSWORD' });
  }

  const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email.trim()]);
  if (existingUser.rowCount > 0) {
    return res.status(409).json({ error: 'Email already exists', code: 'EMAIL_EXISTS' });
  }

  await withTransaction(async client => {
    const userId = createId('user');
    const doctorProfileId = createId('doctor_profile');
    const workspaceId = createId('workspace');
    const approvalId = createId('approval');
    const memberId = createId('member');
    const subscriptionId = createId('subscription');
    const settingsId = createId('workspace_setting');
    const passwordHash = await hashPassword(password);

    await client.query(
      `
        INSERT INTO users (id, email, password_hash, role, status)
        VALUES ($1, $2, $3, 'doctor_owner', 'pending')
      `,
      [userId, email.trim().toLowerCase(), passwordHash]
    );

    await client.query(
      `
        INSERT INTO doctor_profiles (id, user_id, full_name, phone, pmc_number, specialization, qualifications, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        doctorProfileId,
        userId,
        fullName.trim(),
        phone.trim(),
        pmcNumber.trim(),
        specialization.trim(),
        (qualifications ?? '').trim(),
        (notes ?? '').trim(),
      ]
    );

    await client.query(
      `
        INSERT INTO workspaces (id, owner_user_id, name, city, status)
        VALUES ($1, $2, $3, $4, 'pending')
      `,
      [workspaceId, userId, clinicName.trim(), city.trim()]
    );

    await client.query(
      `
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES ($1, $2, $3, 'owner')
      `,
      [memberId, workspaceId, userId]
    );

    await client.query(
      `
        INSERT INTO subscriptions (id, workspace_id, plan_name, status, trial_ends_at)
        VALUES ($1, $2, 'Trial', 'trial', NOW() + INTERVAL '14 day')
      `,
      [subscriptionId, workspaceId]
    );

    await client.query(
      `
        INSERT INTO approval_requests (id, user_id, workspace_id, clinic_name, city, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      `,
      [approvalId, userId, workspaceId, clinicName.trim(), city.trim(), (notes ?? '').trim()]
    );

    await client.query(
      `
        INSERT INTO workspace_settings (id, workspace_id, data)
        VALUES ($1, $2, $3)
      `,
      [settingsId, workspaceId, {}]
    );
  });

  res.status(201).json({ ok: true, message: 'Signup request submitted for admin approval.' });
}));

app.post('/api/auth/login', authRateLimit, asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', code: 'INVALID_LOGIN' });
  }

  const { rows } = await query(
    `
      SELECT id, email, password_hash, role, status
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email.trim()]
  );

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  if (user.role === 'doctor_owner' && user.status !== 'active') {
    return res.status(403).json({
      error: user.status === 'pending'
        ? 'Your account is awaiting admin approval.'
        : user.status === 'rejected'
          ? 'Your signup request was rejected.'
          : 'Your account is suspended.',
      code: user.status === 'pending'
        ? 'ACCOUNT_PENDING'
        : user.status === 'rejected'
          ? 'ACCOUNT_REJECTED'
          : 'ACCOUNT_SUSPENDED',
    });
  }

  if (user.role === 'platform_admin' && user.status !== 'active') {
    return res.status(403).json({ error: 'Admin account is inactive', code: 'ACCOUNT_SUSPENDED' });
  }

  const token = issueToken(user);
  const session = await getSessionPayload(user.id);
  res.json({ token, session });
}));

app.post('/api/auth/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parseOrThrow(passwordChangeSchema, req.body ?? {}, 'INVALID_PASSWORD_CHANGE');
  const passwordIssue = validatePasswordPolicy(newPassword);
  if (passwordIssue) {
    return res.status(400).json({ error: passwordIssue, code: 'WEAK_PASSWORD' });
  }

  const { rows } = await query(
    `
      SELECT password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [req.auth.user.id]
  );

  const user = rows[0];
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' });
  }

  await query(
    `
      UPDATE users
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [req.auth.user.id, await hashPassword(newPassword)]
  );

  res.json({ ok: true });
}));

app.post('/api/auth/demo', authRateLimit, asyncHandler(async (_req, res) => {
  if (isProduction && !enablePublicDemo) {
    return res.status(403).json({ error: 'Public demo access is disabled', code: 'DEMO_DISABLED' });
  }

  await cleanupExpiredDemoSessions({ query });

  const { userId } = await withTransaction(async client => {
    await cleanupExpiredDemoSessions({ query: client.query.bind(client) });
    return createEphemeralDemoSession(client);
  });

  const session = await getSessionPayload(userId);
  const token = issueToken({
    id: userId,
    role: 'doctor_owner',
    status: 'active',
  });

  res.status(201).json({ token, session });
}));

app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const session = await getSessionPayload(req.auth.user.id);
  res.json({ data: session });
}));

app.post('/api/desktop/devices/register', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { deviceId, deviceName, platform, appVersion } = req.body ?? {};
  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required', code: 'INVALID_DEVICE' });
  }

  const result = await query(
    `
      INSERT INTO desktop_devices (
        id, workspace_id, doctor_user_id, device_id, device_name, platform, app_version, status, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        doctor_user_id = EXCLUDED.doctor_user_id,
        device_name = EXCLUDED.device_name,
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        status = CASE
          WHEN desktop_devices.status = 'revoked' THEN desktop_devices.status
          ELSE 'active'
        END,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING id, device_id, status, last_seen_at
    `,
    [
      createId('desktop_device'),
      req.auth.workspace.id,
      req.auth.user.id,
      String(deviceId).trim(),
      String(deviceName ?? 'Desktop Device').trim(),
      String(platform ?? 'windows-desktop').trim(),
      String(appVersion ?? '0.0.0').trim(),
    ]
  );

  if (result.rows[0].status === 'revoked') {
    return res.status(403).json({
      error: 'This desktop device has been revoked. Contact support or register a different approved device.',
      code: 'DEVICE_REVOKED',
      data: {
        id: result.rows[0].id,
        deviceId: result.rows[0].device_id,
        status: result.rows[0].status,
        lastSeenAt: result.rows[0].last_seen_at,
      },
    });
  }

  res.json({
    ok: true,
    data: {
      id: result.rows[0].id,
      deviceId: result.rows[0].device_id,
      status: result.rows[0].status,
      lastSeenAt: result.rows[0].last_seen_at,
    },
  });
}));

app.get('/api/desktop/bootstrap', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const deviceAccess = await requireActiveDesktopDevice(req, res);
  if (deviceAccess?.blocked) return;
  const snapshot = await getDesktopBootstrapData(req.auth);
  res.json({ data: snapshot });
}));

app.get('/api/desktop/entitlement', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const deviceAccess = await requireActiveDesktopDevice(req, res);
  if (deviceAccess?.blocked) return;
  const session = await getSessionPayload(req.auth.user.id);
  const subscription = session?.workspace?.subscription ?? null;
  const status = subscription?.status === 'active'
    ? 'valid'
    : subscription?.status === 'trial'
      ? 'valid_but_recheck_due'
      : subscription?.status === 'suspended'
        ? 'restricted'
        : subscription?.status === 'cancelled'
          ? 'locked'
          : 'unknown';

  res.json({
    data: {
      status,
      planName: subscription?.planName ?? '',
      trialEndsAt: subscription?.trialEndsAt ?? null,
      entitlementValidUntil: subscription?.trialEndsAt ?? null,
      graceDeadline: subscription?.trialEndsAt ?? null,
      lockMessage: status === 'locked' ? 'Your trial/subscription has ended. Renew it to continue using the app.' : '',
      lastCheckedAt: new Date().toISOString(),
    },
  });
}));

app.post('/api/sync/push', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const compatibility = getSyncCompatibility(req);
  if (!compatibility.compatible) {
    return res.status(426).json({
      error: 'Desktop client version is not supported for sync. Please update the app.',
      code: 'DESKTOP_CLIENT_OUTDATED',
      data: {
        compatibility,
      },
    });
  }

  const deviceAccess = await requireActiveDesktopDevice(req, res);
  if (deviceAccess?.blocked) return;

  const inputBundles = Array.isArray(req.body?.bundles)
    ? req.body.bundles.map(normalizeDesktopBundle)
    : [];
  const fallbackMutations = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
  const bundles = inputBundles.length > 0
    ? inputBundles
    : fallbackMutations.map(mutation => normalizeDesktopBundle({
        bundleId: String(mutation?.bundleId ?? mutation?.mutationId ?? '').trim(),
        bundleType: String(mutation?.bundleType ?? 'mutation').trim() || 'mutation',
        rootEntityId: String(mutation?.rootEntityId ?? mutation?.entityId ?? '').trim(),
        deviceId: String(mutation?.deviceId ?? '').trim(),
        workspaceId: String(mutation?.workspaceId ?? '').trim(),
        entityType: String(mutation?.entityType ?? '').trim(),
        entityId: String(mutation?.entityId ?? '').trim(),
        mutations: [mutation],
      }));
  const results = [];
  const bundleResults = [];

  for (const bundle of bundles) {
    const bundleId = String(bundle?.bundleId ?? '').trim();
    const bundleType = String(bundle?.bundleType ?? 'mutation').trim() || 'mutation';
    const rootEntityId = String(bundle?.rootEntityId ?? '').trim();

    if (!bundleId) {
      bundleResults.push({
        bundleId: '',
        bundleType,
        rootEntityId,
        status: 'validation_rejected',
        committedMutationCount: 0,
        errorCode: 'MISSING_BUNDLE_ID',
        errorMessage: 'Missing bundleId',
      });
      continue;
    }

    if (!Array.isArray(bundle.mutations) || bundle.mutations.length === 0) {
      bundleResults.push({
        bundleId,
        bundleType,
        rootEntityId,
        status: 'validation_rejected',
        committedMutationCount: 0,
        errorCode: 'EMPTY_BUNDLE',
        errorMessage: 'Bundle does not contain mutations',
      });
      continue;
    }

    const missingMutationId = bundle.mutations.find(item => !String(item?.mutationId ?? '').trim());
    if (missingMutationId) {
      bundleResults.push({
        bundleId,
        bundleType,
        rootEntityId,
        status: 'validation_rejected',
        committedMutationCount: 0,
        errorCode: 'MISSING_MUTATION_ID',
        errorMessage: 'Bundle contains a mutation without mutationId',
      });
      for (const mutation of bundle.mutations) {
        results.push({
          mutationId: String(mutation?.mutationId ?? '').trim(),
          entityType: String(mutation?.entityType ?? '').trim(),
          entityId: String(mutation?.entityId ?? '').trim(),
          status: 'validation_rejected',
          errorCode: 'MISSING_MUTATION_ID',
          errorMessage: 'Bundle contains a mutation without mutationId',
        });
      }
      continue;
    }

    const existingBundle = await query(
      `SELECT result_status, response_payload FROM processed_bundles WHERE bundle_id = $1 LIMIT 1`,
      [bundleId]
    );

    if (existingBundle.rowCount > 0) {
      const payload = existingBundle.rows[0].response_payload ?? {};
      bundleResults.push({
        bundleId,
        bundleType,
        rootEntityId,
        status: 'accepted_already_processed',
        committedMutationCount: Number(payload?.bundleResult?.committedMutationCount ?? bundle.mutations.length),
        canonicalBundle: payload?.bundleResult?.canonicalBundle ?? null,
      });
      if (Array.isArray(payload?.results) && payload.results.length > 0) {
        results.push(
          ...payload.results.map(item => ({
            ...item,
            status: 'accepted_already_processed',
          }))
        );
      }
      continue;
    }

    try {
      const { bundleResult, mutationResults } = await withTransaction(async client => {
        const processed = await processDesktopBundle(client, req.auth, bundle);

        await client.query(
          `
            INSERT INTO processed_bundles (
              id, bundle_id, device_id, workspace_id, bundle_type, root_entity_id, entity_type, entity_id, result_status, response_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'accepted', $9)
          `,
            [
              createId('processed_bundle'),
            bundleId,
            String(bundle.deviceId ?? '').trim(),
            req.auth.workspace.id,
            bundleType,
            rootEntityId,
            String(bundle.entityType ?? '').trim(),
            String(bundle.entityId ?? '').trim(),
            { bundleResult: processed.bundleResult, results: processed.mutationResults },
          ]
        );

        for (const [index, mutation] of bundle.mutations.entries()) {
          await client.query(
            `
              INSERT INTO processed_mutations (
                id, mutation_id, bundle_id, device_id, workspace_id, entity_type, entity_id, operation_type, result_status, response_payload
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'accepted', $9)
            `,
            [
              createId('processed_mutation'),
              String(mutation.mutationId ?? '').trim(),
              bundleId,
              String(mutation.deviceId ?? '').trim(),
              req.auth.workspace.id,
              String(mutation.entityType ?? '').trim(),
              String(mutation.entityId ?? '').trim(),
              String(mutation.operationType ?? '').trim(),
              processed.mutationResults[index]?.canonicalEntity ?? {},
            ]
          );
        }

        return processed;
      });

      bundleResults.push(bundleResult);
      results.push(...mutationResults);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bundle failed';
      const conflictType = error?.conflictType || (
        /draft conflict/i.test(message)
          ? 'draft_conflict'
          : /appointment status conflict|appointment conflict/i.test(message)
            ? 'appointment_conflict'
            : /patient conflict/i.test(message)
              ? 'patient_conflict'
              : /conflict/i.test(message)
                ? 'generic_conflict'
                : ''
      );
      const status = error?.syncStatus || (
        /conflict/i.test(message)
          ? 'conflict'
          : /entitlement|subscription|trial/i.test(message)
            ? 'entitlement_rejected'
            : /not found|invalid|missing/i.test(message)
              ? 'validation_rejected'
              : 'retryable_failure'
      );
      const errorCode = error?.errorCode || (
        status === 'conflict'
          ? 'SYNC_CONFLICT'
          : status === 'entitlement_rejected'
            ? 'ENTITLEMENT_REJECTED'
            : status === 'validation_rejected'
              ? 'VALIDATION_REJECTED'
              : 'RETRYABLE_FAILURE'
      );
      const serverSnapshot = error?.serverSnapshot ?? null;
      const serverBaseVersion = error?.serverBaseVersion ?? '';

      bundleResults.push({
        bundleId,
        bundleType,
        rootEntityId,
        status,
        committedMutationCount: 0,
        conflictType,
        errorCode,
        errorMessage: message,
        serverSnapshot,
        serverBaseVersion,
      });
      for (const mutation of bundle.mutations) {
        results.push({
          mutationId: String(mutation.mutationId ?? '').trim(),
          bundleId,
          entityType: String(mutation.entityType ?? '').trim(),
          entityId: String(mutation.entityId ?? '').trim(),
          conflictType,
          status,
          errorCode,
          errorMessage: message,
          serverSnapshot,
          serverBaseVersion,
        });
      }
    }
  }

  res.json({
    data: {
      apiVersion: syncApiVersion,
      compatibility,
      serverTime: new Date().toISOString(),
      checkpoint: createIssuedSyncCheckpoint(req.auth.workspace.id),
      bundles: bundleResults,
      results,
    },
  });
}));

app.get('/api/sync/pull', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const compatibility = getSyncCompatibility(req);
  if (!compatibility.compatible) {
    return res.status(426).json({
      error: 'Desktop client version is not supported for sync. Please update the app.',
      code: 'DESKTOP_CLIENT_OUTDATED',
      data: {
        compatibility,
      },
    });
  }

  const deviceAccess = await requireActiveDesktopDevice(req, res);
  if (deviceAccess?.blocked) return;

  const session = await getSessionPayload(req.auth.user.id);
  const checkpointInput = String(req.query?.checkpoint ?? '').trim();
  const rebuildRequested = req.query?.rebuild === '1';
  const checkpointState = rebuildRequested
    ? {
        checkpointStatus: 'rebuild_required',
        rebuildRequired: true,
        rebuildReason: 'The desktop client requested a full rebuild of the local cache.',
        parsedCheckpoint: null,
        checkpointMeta: null,
      }
    : resolvePullCheckpointState(checkpointInput, req.auth.workspace.id);
  const includeSnapshot = !checkpointInput || checkpointState.rebuildRequired || req.query?.rebuild === '1';
  const snapshot = includeSnapshot ? await getDesktopBootstrapData(req.auth) : null;
  const changes = checkpointState.rebuildRequired
    ? { patients: [], appointments: [], drafts: {}, notes: [], attachments: [] }
    : await getDesktopChangeSet(req.auth, checkpointState.parsedCheckpoint ?? '');
  const subscription = session?.workspace?.subscription ?? null;
  const entitlement = {
    workspaceId: req.auth.workspace.id,
    status: subscription?.status === 'active'
      ? 'valid'
      : subscription?.status === 'trial'
        ? 'valid_but_recheck_due'
        : subscription?.status === 'suspended'
          ? 'restricted'
          : subscription?.status === 'cancelled'
            ? 'locked'
            : 'unknown',
    planName: subscription?.planName ?? '',
    trialEndsAt: subscription?.trialEndsAt ?? null,
    entitlementValidUntil: subscription?.trialEndsAt ?? null,
    graceDeadline: subscription?.trialEndsAt ?? null,
    lockMessage: subscription?.status === 'cancelled'
      ? 'Your trial/subscription has ended. Renew it to continue using the app.'
      : '',
    lastCheckedAt: new Date().toISOString(),
  };

  res.json({
    data: {
      apiVersion: syncApiVersion,
      compatibility,
      serverTime: new Date().toISOString(),
      checkpoint: createIssuedSyncCheckpoint(req.auth.workspace.id),
      checkpointStatus: checkpointState.checkpointStatus,
      rebuildRequired: checkpointState.rebuildRequired,
      snapshot,
      changes,
      entitlement,
    },
  });
}));

app.post('/api/admin/offline-sync/devices/:deviceId/revoke', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const deviceId = String(req.params.deviceId ?? '').trim();
  const reason = String(req.body?.reason ?? '').trim();

  if (!deviceId) {
    return res.status(400).json({ error: 'Device ID is required', code: 'INVALID_DEVICE_ID' });
  }

  const result = await query(
    `
      UPDATE desktop_devices
      SET status = 'revoked',
          revoked_at = NOW(),
          updated_at = NOW()
      WHERE device_id = $1
      RETURNING id, workspace_id, doctor_user_id, device_id, device_name, status, revoked_at
    `,
    [deviceId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Desktop device not found', code: 'DESKTOP_DEVICE_NOT_FOUND' });
  }

  const row = result.rows[0];
  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    targetUserId: row.doctor_user_id,
    workspaceId: row.workspace_id,
    action: 'desktop_device_revoked',
    details: {
      deviceId: row.device_id,
      deviceName: row.device_name,
      reason,
    },
  });

  res.json({
    ok: true,
    data: {
      id: row.id,
      workspaceId: row.workspace_id,
      doctorUserId: row.doctor_user_id,
      deviceId: row.device_id,
      deviceName: row.device_name,
      status: row.status,
      revokedAt: row.revoked_at,
    },
  });
}));

app.post('/api/auth/logout', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/overview', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  const [pendingApprovals, activeDoctors, suspendedDoctors, workspaceCount, clinicCount, patientCount, visitCount] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM approval_requests ar JOIN users u ON u.id = ar.user_id WHERE ar.status = 'pending' AND u.is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'doctor_owner' AND status = 'active' AND is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'doctor_owner' AND status = 'suspended' AND is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM workspaces WHERE is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM clinics c JOIN workspaces w ON w.id = c.workspace_id WHERE w.is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM patients p JOIN workspaces w ON w.id = p.workspace_id WHERE w.is_demo = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM appointments a JOIN workspaces w ON w.id = a.workspace_id WHERE w.is_demo = FALSE`),
  ]);

  res.json({
    data: {
      pendingApprovals: pendingApprovals.rows[0].count,
      activeDoctors: activeDoctors.rows[0].count,
      suspendedDoctors: suspendedDoctors.rows[0].count,
      workspaces: workspaceCount.rows[0].count,
      clinics: clinicCount.rows[0].count,
      patients: patientCount.rows[0].count,
      appointments: visitCount.rows[0].count,
    },
  });
}));

app.get('/api/admin/audit-logs', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const q = String(req.query?.q ?? '').trim();
  const targetUserId = String(req.query?.targetUserId ?? '').trim();
  const workspaceId = String(req.query?.workspaceId ?? '').trim();
  const limitInput = Number.parseInt(String(req.query?.limit ?? '100'), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 300) : 100;

  const conditions = ['1 = 1'];
  const params = [];

  if (targetUserId) {
    params.push(targetUserId);
    conditions.push(`target_user_id = $${params.length}`);
  }

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`workspace_id = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const searchRef = `$${params.length}`;
    conditions.push(`(action ILIKE ${searchRef} OR CAST(details AS TEXT) ILIKE ${searchRef})`);
  }

  params.push(limit);

  const { rows } = await query(
    `
      SELECT id, actor_user_id, target_user_id, workspace_id, action, details, created_at
      FROM admin_audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
      actorUserId: row.actor_user_id,
      targetUserId: row.target_user_id,
      workspaceId: row.workspace_id,
      details: row.details ?? {},
    })),
  });
}));

app.get('/api/admin/offline-sync/stats', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const workspaceId = String(req.query?.workspaceId ?? '').trim();
  const doctorId = String(req.query?.doctorId ?? '').trim();
  const q = String(req.query?.q ?? '').trim();
  const statusFilter = String(req.query?.status ?? '').trim();
  const limitInput = Number.parseInt(String(req.query?.limit ?? '300'), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 500) : 300;

  const conditions = ['u.role = \'doctor_owner\'', 'u.is_demo = FALSE', 'w.is_demo = FALSE'];
  const params = [];

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`w.id = $${params.length}`);
  }

  if (doctorId) {
    params.push(doctorId);
    conditions.push(`u.id = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const searchRef = `$${params.length}`;
    conditions.push(`(dp.full_name ILIKE ${searchRef} OR u.email ILIKE ${searchRef} OR w.name ILIKE ${searchRef} OR w.city ILIKE ${searchRef})`);
  }

  params.push(limit);

  const { rows } = await query(
    `
      WITH doctor_scope AS (
        SELECT
          u.id AS doctor_user_id,
          u.email AS doctor_email,
          dp.full_name AS doctor_name,
          w.id AS workspace_id,
          w.name AS workspace_name,
          w.city AS workspace_city
        FROM users u
        JOIN doctor_profiles dp ON dp.user_id = u.id
        JOIN workspaces w ON w.owner_user_id = u.id
        WHERE ${conditions.join(' AND ')}
      ),
      device_stats AS (
        SELECT
          dd.doctor_user_id,
          dd.workspace_id,
          COUNT(*)::int AS device_count,
          COUNT(*) FILTER (WHERE dd.status = 'active')::int AS active_device_count,
          COUNT(*) FILTER (WHERE dd.status = 'revoked')::int AS revoked_device_count,
          MAX(dd.last_seen_at) AS last_seen_at
        FROM desktop_devices dd
        GROUP BY dd.doctor_user_id, dd.workspace_id
      ),
      bundle_stats AS (
        SELECT
          w.owner_user_id AS doctor_user_id,
          pb.workspace_id,
          COUNT(*)::int AS bundles_processed,
          COUNT(*) FILTER (WHERE pb.result_status = 'accepted')::int AS bundles_accepted,
          COUNT(*) FILTER (WHERE pb.result_status = 'accepted_already_processed')::int AS bundles_accepted_already_processed,
          COUNT(*) FILTER (WHERE pb.result_status = 'conflict')::int AS bundle_conflicts,
          COUNT(*) FILTER (WHERE pb.result_status = 'retryable_failure')::int AS bundle_retryable_failures,
          COUNT(*) FILTER (WHERE pb.result_status = 'validation_rejected')::int AS bundle_validation_rejected,
          COUNT(*) FILTER (WHERE pb.result_status = 'permission_rejected')::int AS bundle_permission_rejected,
          COUNT(*) FILTER (WHERE pb.result_status = 'entitlement_rejected')::int AS bundle_entitlement_rejected,
          MAX(pb.processed_at) AS last_bundle_processed_at
        FROM processed_bundles pb
        JOIN workspaces w ON w.id = pb.workspace_id
        GROUP BY w.owner_user_id, pb.workspace_id
      ),
      mutation_stats AS (
        SELECT
          w.owner_user_id AS doctor_user_id,
          pm.workspace_id,
          COUNT(*)::int AS mutations_processed,
          COUNT(*) FILTER (WHERE pm.result_status = 'accepted')::int AS mutations_accepted,
          COUNT(*) FILTER (WHERE pm.result_status = 'accepted_already_processed')::int AS mutations_accepted_already_processed,
          COUNT(*) FILTER (WHERE pm.result_status = 'conflict')::int AS mutation_conflicts,
          COUNT(*) FILTER (WHERE pm.result_status = 'retryable_failure')::int AS mutation_retryable_failures,
          COUNT(*) FILTER (WHERE pm.result_status = 'validation_rejected')::int AS mutation_validation_rejected,
          COUNT(*) FILTER (WHERE pm.result_status = 'permission_rejected')::int AS mutation_permission_rejected,
          COUNT(*) FILTER (WHERE pm.result_status = 'entitlement_rejected')::int AS mutation_entitlement_rejected,
          MAX(pm.processed_at) AS last_mutation_processed_at
        FROM processed_mutations pm
        JOIN workspaces w ON w.id = pm.workspace_id
        GROUP BY w.owner_user_id, pm.workspace_id
      )
      SELECT
        ds.doctor_user_id,
        ds.doctor_email,
        ds.doctor_name,
        ds.workspace_id,
        ds.workspace_name,
        ds.workspace_city,
        COALESCE(dv.device_count, 0) AS device_count,
        COALESCE(dv.active_device_count, 0) AS active_device_count,
        COALESCE(dv.revoked_device_count, 0) AS revoked_device_count,
        dv.last_seen_at,
        COALESCE(bs.bundles_processed, 0) AS bundles_processed,
        COALESCE(ms.mutations_processed, 0) AS mutations_processed,
        COALESCE(bs.bundles_accepted, 0) + COALESCE(ms.mutations_accepted, 0) AS accepted_total,
        COALESCE(bs.bundles_accepted_already_processed, 0) + COALESCE(ms.mutations_accepted_already_processed, 0) AS accepted_already_processed_total,
        COALESCE(bs.bundle_conflicts, 0) + COALESCE(ms.mutation_conflicts, 0) AS conflicts_total,
        COALESCE(bs.bundle_retryable_failures, 0) + COALESCE(ms.mutation_retryable_failures, 0) AS retryable_failures_total,
        COALESCE(bs.bundle_validation_rejected, 0) + COALESCE(ms.mutation_validation_rejected, 0) AS validation_rejected_total,
        COALESCE(bs.bundle_permission_rejected, 0) + COALESCE(ms.mutation_permission_rejected, 0) AS permission_rejected_total,
        COALESCE(bs.bundle_entitlement_rejected, 0) + COALESCE(ms.mutation_entitlement_rejected, 0) AS entitlement_rejected_total,
        bs.last_bundle_processed_at,
        ms.last_mutation_processed_at
      FROM doctor_scope ds
      LEFT JOIN device_stats dv ON dv.doctor_user_id = ds.doctor_user_id AND dv.workspace_id = ds.workspace_id
      LEFT JOIN bundle_stats bs ON bs.doctor_user_id = ds.doctor_user_id AND bs.workspace_id = ds.workspace_id
      LEFT JOIN mutation_stats ms ON ms.doctor_user_id = ds.doctor_user_id AND ms.workspace_id = ds.workspace_id
      ORDER BY ds.doctor_name ASC
      LIMIT $${params.length}
    `,
    params
  );

  const deviceRows = rows.length > 0
    ? (await query(
        `
          SELECT
            dd.workspace_id,
            dd.doctor_user_id,
            dd.device_id,
            dd.device_name,
            dd.platform,
            dd.app_version,
            dd.status,
            dd.last_seen_at,
            dd.revoked_at
          FROM desktop_devices dd
          WHERE (dd.doctor_user_id, dd.workspace_id) IN (
            ${rows.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')}
          )
          ORDER BY dd.last_seen_at DESC NULLS LAST, dd.updated_at DESC
        `,
        rows.flatMap(row => [row.doctor_user_id, row.workspace_id])
      )).rows
    : [];

  const devicesByScope = new Map();
  for (const row of deviceRows) {
    const key = `${row.doctor_user_id}::${row.workspace_id}`;
    const items = devicesByScope.get(key) ?? [];
    items.push({
      deviceId: row.device_id,
      deviceName: row.device_name,
      platform: row.platform,
      appVersion: row.app_version,
      status: row.status,
      lastSeenAt: toIsoOrNull(row.last_seen_at),
      revokedAt: toIsoOrNull(row.revoked_at),
    });
    devicesByScope.set(key, items);
  }

  const doctors = rows.map(row => {
    const lastBundleProcessedAt = toIsoOrNull(row.last_bundle_processed_at);
    const lastMutationProcessedAt = toIsoOrNull(row.last_mutation_processed_at);
    const lastSyncedAt = lastBundleProcessedAt && lastMutationProcessedAt
      ? (new Date(lastBundleProcessedAt).getTime() >= new Date(lastMutationProcessedAt).getTime() ? lastBundleProcessedAt : lastMutationProcessedAt)
      : lastBundleProcessedAt || lastMutationProcessedAt;
    const health = computeOfflineSyncHealth({
      activeDeviceCount: Number(row.active_device_count ?? 0),
      conflicts: Number(row.conflicts_total ?? 0),
      retryableFailures: Number(row.retryable_failures_total ?? 0),
      validationRejected: Number(row.validation_rejected_total ?? 0),
      permissionRejected: Number(row.permission_rejected_total ?? 0),
      entitlementRejected: Number(row.entitlement_rejected_total ?? 0),
      lastSeenAt: row.last_seen_at,
      lastSyncedAt,
    });

    return {
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
        email: row.doctor_email,
      },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      devices: {
        total: Number(row.device_count ?? 0),
        active: Number(row.active_device_count ?? 0),
        revoked: Number(row.revoked_device_count ?? 0),
        lastSeenAt: toIsoOrNull(row.last_seen_at),
      },
      sync: {
        lastBundleProcessedAt,
        lastMutationProcessedAt,
        lastSyncedAt,
        bundlesProcessed: Number(row.bundles_processed ?? 0),
        mutationsProcessed: Number(row.mutations_processed ?? 0),
      },
      outcomes: {
        conflicts: Number(row.conflicts_total ?? 0),
        retryableFailures: Number(row.retryable_failures_total ?? 0),
        validationRejected: Number(row.validation_rejected_total ?? 0),
        permissionRejected: Number(row.permission_rejected_total ?? 0),
        entitlementRejected: Number(row.entitlement_rejected_total ?? 0),
        accepted: Number(row.accepted_total ?? 0),
        acceptedAlreadyProcessed: Number(row.accepted_already_processed_total ?? 0),
      },
      deviceEntries: devicesByScope.get(`${row.doctor_user_id}::${row.workspace_id}`) ?? [],
      health,
    };
  });

  const filteredByStatus = statusFilter
    ? doctors.filter(item => item.health === statusFilter)
    : doctors;

  const summary = filteredByStatus.reduce((acc, item) => {
    acc.doctors += 1;
    acc.workspaces.add(item.workspace.id);
    acc.totalDevices += item.devices.total;
    acc.activeDevices += item.devices.active;
    acc.revokedDevices += item.devices.revoked;
    acc.bundlesProcessed += item.sync.bundlesProcessed;
    acc.mutationsProcessed += item.sync.mutationsProcessed;
    acc.conflicts += item.outcomes.conflicts;
    acc.retryableFailures += item.outcomes.retryableFailures;
    acc.validationRejected += item.outcomes.validationRejected;
    acc.permissionRejected += item.outcomes.permissionRejected;
    acc.entitlementRejected += item.outcomes.entitlementRejected;
    acc.accepted += item.outcomes.accepted;
    acc.acceptedAlreadyProcessed += item.outcomes.acceptedAlreadyProcessed;
    if (item.outcomes.conflicts > 0) acc.doctorsWithConflicts += 1;
    if (item.health === 'attention') acc.doctorsWithAttention += 1;
    if (item.health === 'offline') acc.doctorsOffline += 1;
    if (item.sync.lastSyncedAt) {
      if (!acc.lastSyncedAt || new Date(item.sync.lastSyncedAt).getTime() > new Date(acc.lastSyncedAt).getTime()) {
        acc.lastSyncedAt = item.sync.lastSyncedAt;
      }
    }
    return acc;
  }, {
    doctors: 0,
    workspaces: new Set(),
    totalDevices: 0,
    activeDevices: 0,
    revokedDevices: 0,
    doctorsWithConflicts: 0,
    doctorsWithAttention: 0,
    doctorsOffline: 0,
    bundlesProcessed: 0,
    mutationsProcessed: 0,
    conflicts: 0,
    retryableFailures: 0,
    validationRejected: 0,
    permissionRejected: 0,
    entitlementRejected: 0,
    accepted: 0,
    acceptedAlreadyProcessed: 0,
    lastSyncedAt: null,
  });

  res.json({
    data: {
      generatedAt: new Date().toISOString(),
      rollout: evaluatePilotRollout({
        doctors: summary.doctors,
        activeDevices: summary.activeDevices,
        totalDevices: summary.totalDevices,
        doctorsWithAttention: summary.doctorsWithAttention,
        doctorsOffline: summary.doctorsOffline,
        conflicts: summary.conflicts,
        retryableFailures: summary.retryableFailures,
      }),
      summary: {
        doctors: summary.doctors,
        workspaces: summary.workspaces.size,
        totalDevices: summary.totalDevices,
        activeDevices: summary.activeDevices,
        revokedDevices: summary.revokedDevices,
        doctorsWithConflicts: summary.doctorsWithConflicts,
        doctorsWithAttention: summary.doctorsWithAttention,
        doctorsOffline: summary.doctorsOffline,
        bundlesProcessed: summary.bundlesProcessed,
        mutationsProcessed: summary.mutationsProcessed,
        conflicts: summary.conflicts,
        retryableFailures: summary.retryableFailures,
        validationRejected: summary.validationRejected,
        permissionRejected: summary.permissionRejected,
        entitlementRejected: summary.entitlementRejected,
        accepted: summary.accepted,
        acceptedAlreadyProcessed: summary.acceptedAlreadyProcessed,
        lastSyncedAt: summary.lastSyncedAt,
      },
      doctors: filteredByStatus,
    },
  });
}));

app.get('/api/admin/approval-requests', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `
      SELECT
        ar.id,
        ar.status,
        ar.clinic_name,
        ar.city,
        ar.notes,
        ar.rejection_reason,
        ar.created_at,
        u.id AS user_id,
        u.email,
        u.status AS user_status,
        dp.full_name,
        dp.phone,
        dp.pmc_number,
        dp.specialization,
        dp.qualifications,
        dp.notes,
        w.id AS workspace_id,
        w.name AS workspace_name
      FROM approval_requests ar
      JOIN users u ON u.id = ar.user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      JOIN workspaces w ON w.id = ar.workspace_id
      WHERE u.is_demo = FALSE
      ORDER BY ar.created_at DESC
    `
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      status: row.status,
      clinicName: row.clinic_name,
      city: row.city,
      notes: row.notes,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        email: row.email,
        status: row.user_status,
      },
      doctor: {
        name: row.full_name,
        phone: row.phone,
        pmcNumber: row.pmc_number,
        specialization: row.specialization,
      },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
      },
    })),
  });
}));

app.get('/api/admin/doctors', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `
      SELECT
        u.id,
        u.email,
        u.status,
        u.is_demo,
        dp.full_name,
        dp.phone,
        dp.pmc_number,
        dp.specialization,
        dp.qualifications,
        dp.notes,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        w.status AS workspace_status,
        s.plan_name,
        s.status AS subscription_status,
        s.trial_ends_at,
        COALESCE(clinic_counts.count, 0) AS clinic_count,
        COALESCE(patient_counts.count, 0) AS patient_count,
        COALESCE(appointment_counts.count, 0) AS appointment_count
      FROM users u
      JOIN doctor_profiles dp ON dp.user_id = u.id
      JOIN workspaces w ON w.owner_user_id = u.id
      LEFT JOIN subscriptions s ON s.workspace_id = w.id
      LEFT JOIN (
        SELECT workspace_id, COUNT(*)::int AS count
        FROM clinics
        GROUP BY workspace_id
      ) clinic_counts ON clinic_counts.workspace_id = w.id
      LEFT JOIN (
        SELECT workspace_id, COUNT(*)::int AS count
        FROM patients
        GROUP BY workspace_id
      ) patient_counts ON patient_counts.workspace_id = w.id
      LEFT JOIN (
        SELECT workspace_id, COUNT(*)::int AS count
        FROM appointments
        GROUP BY workspace_id
      ) appointment_counts ON appointment_counts.workspace_id = w.id
      WHERE u.role = 'doctor_owner'
        AND u.is_demo = FALSE
      ORDER BY u.created_at DESC
    `
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      email: row.email,
      status: row.status,
      name: row.full_name,
      phone: row.phone,
      pmcNumber: row.pmc_number,
      specialization: row.specialization,
      qualifications: row.qualifications ?? '',
      notes: row.notes ?? '',
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
        status: row.workspace_status,
      },
      subscription: {
        planName: row.plan_name,
        status: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
      },
      usage: {
        clinics: row.clinic_count,
        patients: row.patient_count,
        appointments: row.appointment_count,
      },
    })),
  });
}));

app.get('/api/admin/patients', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const workspaceId = String(req.query?.workspaceId ?? '').trim();
  const doctorId = String(req.query?.doctorId ?? '').trim();
  const clinicId = String(req.query?.clinicId ?? '').trim();
  const activity = String(req.query?.activity ?? '').trim();
  const searchQuery = String(req.query?.q ?? '').trim();
  const limitInput = Number.parseInt(String(req.query?.limit ?? '200'), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 500) : 200;

  const conditions = ['w.is_demo = FALSE'];
  const params = [];

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`p.workspace_id = $${params.length}`);
  }

  if (doctorId) {
    params.push(doctorId);
    conditions.push(`w.owner_user_id = $${params.length}`);
  }

  if (clinicId) {
    params.push(clinicId);
    const clinicRef = `$${params.length}`;
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM appointments appointment_filter
        WHERE appointment_filter.workspace_id = p.workspace_id
          AND appointment_filter.patient_id = p.id
          AND appointment_filter.clinic_id = ${clinicRef}
      )
    `);
  }

  if (activity === 'recent') {
    conditions.push(`appointment_stats.last_appointment_date >= CURRENT_DATE - INTERVAL '30 days'`);
  } else if (activity === 'inactive') {
    conditions.push(`(appointment_stats.last_appointment_date IS NULL OR appointment_stats.last_appointment_date < CURRENT_DATE - INTERVAL '90 days')`);
  } else if (activity === 'new') {
    conditions.push(`COALESCE(appointment_stats.total_appointments, 0) = 0`);
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    const searchParamRef = `$${params.length}`;
    conditions.push(
      `(p.name ILIKE ${searchParamRef} OR p.mrn ILIKE ${searchParamRef} OR p.phone ILIKE ${searchParamRef} OR p.cnic ILIKE ${searchParamRef} OR w.name ILIKE ${searchParamRef} OR dp.full_name ILIKE ${searchParamRef})`
    );
  }

  params.push(limit);

  const { rows } = await query(
    `
      SELECT
        p.id,
        p.mrn,
        p.name,
        p.phone,
        p.age,
        p.gender,
        p.cnic,
        p.address,
        p.blood_group,
        p.emergency_contact,
        p.created_at,
        p.updated_at,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        u.id AS doctor_user_id,
        u.email AS doctor_email,
        dp.full_name AS doctor_name,
        last_clinic.id AS last_clinic_id,
        last_clinic.name AS last_clinic_name,
        COALESCE(appointment_stats.total_appointments, 0) AS total_appointments,
        appointment_stats.last_appointment_date
      FROM patients p
      JOIN workspaces w ON w.id = p.workspace_id
      JOIN users u ON u.id = w.owner_user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT
          workspace_id,
          patient_id,
          COUNT(*)::int AS total_appointments,
          MAX(date::date) AS last_appointment_date
        FROM appointments
        GROUP BY workspace_id, patient_id
      ) appointment_stats ON appointment_stats.workspace_id = p.workspace_id AND appointment_stats.patient_id = p.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name
        FROM appointments a
        JOIN clinics c ON c.id = a.clinic_id
        WHERE a.workspace_id = p.workspace_id
          AND a.patient_id = p.id
        ORDER BY a.date DESC, a.time DESC
        LIMIT 1
      ) last_clinic ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      mrn: row.mrn,
      name: row.name,
      phone: row.phone,
      age: row.age,
      gender: row.gender,
      cnic: row.cnic,
      address: row.address,
      bloodGroup: row.blood_group,
      emergencyContact: row.emergency_contact,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
        email: row.doctor_email,
      },
      lastClinic: row.last_clinic_id
        ? {
            id: row.last_clinic_id,
            name: row.last_clinic_name,
          }
        : null,
      totalAppointments: row.total_appointments,
      lastAppointmentDate: row.last_appointment_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}));

app.put('/api/admin/patients/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const patient = parseOrThrow(patientSchema, req.body ?? {}, 'INVALID_PATIENT');

  const result = await query(
    `
      UPDATE patients
      SET
        name = $2,
        phone = $3,
        age = $4,
        gender = $5,
        cnic = $6,
        address = $7,
        blood_group = $8,
        emergency_contact = $9,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      patient.name,
      patient.phone || '',
      patient.age || 0,
      patient.gender || 'Male',
      patient.cnic || '',
      patient.address || '',
      patient.bloodGroup || '',
      patient.emergencyContact || '',
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Patient not found', code: 'PATIENT_NOT_FOUND' });
  }

  const workspaceId = result.rows[0].workspace_id;
  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    workspaceId,
    action: 'patient_demographics_updated',
    details: {
      patientId: id,
      name: patient.name,
      phone: patient.phone || '',
      age: patient.age || 0,
      gender: patient.gender || 'Male',
      cnic: patient.cnic || '',
    },
  });

  const patientRows = await query(
    `
      SELECT
        p.id,
        p.mrn,
        p.name,
        p.phone,
        p.age,
        p.gender,
        p.cnic,
        p.address,
        p.blood_group,
        p.emergency_contact,
        p.created_at,
        p.updated_at,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        u.id AS doctor_user_id,
        u.email AS doctor_email,
        dp.full_name AS doctor_name,
        last_clinic.id AS last_clinic_id,
        last_clinic.name AS last_clinic_name,
        COALESCE(appointment_stats.total_appointments, 0) AS total_appointments,
        appointment_stats.last_appointment_date
      FROM patients p
      JOIN workspaces w ON w.id = p.workspace_id
      JOIN users u ON u.id = w.owner_user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT
          workspace_id,
          patient_id,
          COUNT(*)::int AS total_appointments,
          MAX(date::date) AS last_appointment_date
        FROM appointments
        GROUP BY workspace_id, patient_id
      ) appointment_stats ON appointment_stats.workspace_id = p.workspace_id AND appointment_stats.patient_id = p.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name
        FROM appointments a
        JOIN clinics c ON c.id = a.clinic_id
        WHERE a.workspace_id = p.workspace_id
          AND a.patient_id = p.id
        ORDER BY a.date DESC, a.time DESC
        LIMIT 1
      ) last_clinic ON TRUE
      WHERE p.id = $1
      LIMIT 1
    `,
    [id]
  );

  const row = patientRows.rows[0];
  res.json({
    data: {
      id: row.id,
      mrn: row.mrn,
      name: row.name,
      phone: row.phone,
      age: row.age,
      gender: row.gender,
      cnic: row.cnic,
      address: row.address,
      bloodGroup: row.blood_group,
      emergencyContact: row.emergency_contact,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
        email: row.doctor_email,
      },
      lastClinic: row.last_clinic_id ? { id: row.last_clinic_id, name: row.last_clinic_name } : null,
      totalAppointments: row.total_appointments,
      lastAppointmentDate: row.last_appointment_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}));

app.get('/api/admin/clinics', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const workspaceId = String(req.query?.workspaceId ?? '').trim();
  const doctorId = String(req.query?.doctorId ?? '').trim();
  const status = String(req.query?.status ?? '').trim();
  const q = String(req.query?.q ?? '').trim();
  const limitInput = Number.parseInt(String(req.query?.limit ?? '300'), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 500) : 300;

  const conditions = ['w.is_demo = FALSE'];
  const params = [];

  if (workspaceId) {
    params.push(workspaceId);
    conditions.push(`c.workspace_id = $${params.length}`);
  }

  if (doctorId) {
    params.push(doctorId);
    conditions.push(`w.owner_user_id = $${params.length}`);
  }

  if (status === 'active') {
    conditions.push(`c.is_active = TRUE`);
  } else if (status === 'inactive') {
    conditions.push(`c.is_active = FALSE`);
  }

  if (q) {
    params.push(`%${q}%`);
    const searchRef = `$${params.length}`;
    conditions.push(`(c.name ILIKE ${searchRef} OR c.city ILIKE ${searchRef} OR c.phone ILIKE ${searchRef} OR w.name ILIKE ${searchRef} OR dp.full_name ILIKE ${searchRef})`);
  }

  params.push(limit);

  const { rows } = await query(
    `
      SELECT
        c.id,
        c.name,
        c.location,
        c.city,
        c.phone,
        c.timings,
        c.specialties,
        c.logo,
        c.is_active,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        u.id AS doctor_user_id,
        dp.full_name AS doctor_name,
        COALESCE(clinic_patient_stats.patient_count, 0) AS patient_count,
        COALESCE(clinic_appointment_stats.appointment_count, 0) AS appointment_count,
        clinic_appointment_stats.recent_appointment_date
      FROM clinics c
      JOIN workspaces w ON w.id = c.workspace_id
      JOIN users u ON u.id = w.owner_user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT clinic_id, COUNT(DISTINCT patient_id)::int AS patient_count
        FROM appointments
        GROUP BY clinic_id
      ) clinic_patient_stats ON clinic_patient_stats.clinic_id = c.id
      LEFT JOIN (
        SELECT clinic_id, COUNT(*)::int AS appointment_count, MAX(date::date) AS recent_appointment_date
        FROM appointments
        GROUP BY clinic_id
      ) clinic_appointment_stats ON clinic_appointment_stats.clinic_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.name ASC, c.name ASC
      LIMIT $${params.length}
    `,
    params
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      name: row.name,
      location: row.location,
      city: row.city,
      phone: row.phone,
      timings: row.timings,
      specialties: Array.isArray(row.specialties) ? row.specialties : [],
      logo: row.logo,
      isActive: row.is_active,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
      },
      patientCount: row.patient_count,
      appointmentCount: row.appointment_count,
      recentAppointmentDate: row.recent_appointment_date,
    })),
  });
}));

app.put('/api/admin/clinics/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = parseOrThrow(adminClinicUpdateSchema, req.body ?? {}, 'INVALID_CLINIC');

  const result = await query(
    `
      UPDATE clinics
      SET
        name = $2,
        location = $3,
        city = $4,
        phone = $5,
        timings = $6,
        specialties = $7,
        logo = $8,
        is_active = $9,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      payload.name.trim(),
      payload.location.trim(),
      payload.city.trim(),
      payload.phone.trim(),
      payload.timings.trim() || 'By appointment',
      payload.specialties,
      payload.logo.trim() || '🏥',
      payload.isActive,
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Clinic not found', code: 'CLINIC_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    workspaceId: result.rows[0].workspace_id,
    action: 'clinic_profile_updated',
    details: {
      clinicId: id,
      name: payload.name.trim(),
      city: payload.city.trim(),
      phone: payload.phone.trim(),
      timings: payload.timings.trim() || 'By appointment',
      isActive: payload.isActive,
    },
  });

  const clinicRows = await query(
    `
      SELECT
        c.id,
        c.name,
        c.location,
        c.city,
        c.phone,
        c.timings,
        c.specialties,
        c.logo,
        c.is_active,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        u.id AS doctor_user_id,
        dp.full_name AS doctor_name,
        COALESCE(clinic_patient_stats.patient_count, 0) AS patient_count,
        COALESCE(clinic_appointment_stats.appointment_count, 0) AS appointment_count,
        clinic_appointment_stats.recent_appointment_date
      FROM clinics c
      JOIN workspaces w ON w.id = c.workspace_id
      JOIN users u ON u.id = w.owner_user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT clinic_id, COUNT(DISTINCT patient_id)::int AS patient_count
        FROM appointments
        GROUP BY clinic_id
      ) clinic_patient_stats ON clinic_patient_stats.clinic_id = c.id
      LEFT JOIN (
        SELECT clinic_id, COUNT(*)::int AS appointment_count, MAX(date::date) AS recent_appointment_date
        FROM appointments
        GROUP BY clinic_id
      ) clinic_appointment_stats ON clinic_appointment_stats.clinic_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [id]
  );

  const row = clinicRows.rows[0];
  res.json({
    data: {
      id: row.id,
      name: row.name,
      location: row.location,
      city: row.city,
      phone: row.phone,
      timings: row.timings,
      specialties: Array.isArray(row.specialties) ? row.specialties : [],
      logo: row.logo,
      isActive: row.is_active,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
      },
      patientCount: row.patient_count,
      appointmentCount: row.appointment_count,
      recentAppointmentDate: row.recent_appointment_date,
    },
  });
}));

app.get('/api/admin/doctors/:id/patients', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const doctorId = String(req.params.id ?? '').trim();
  const clinicId = String(req.query?.clinicId ?? '').trim();
  const searchQuery = String(req.query?.q ?? '').trim();
  const limitInput = Number.parseInt(String(req.query?.limit ?? '200'), 10);
  const limit = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 500) : 200;

  const conditions = ['w.is_demo = FALSE', 'w.owner_user_id = $1'];
  const params = [doctorId];

  if (clinicId) {
    params.push(clinicId);
    const clinicRef = `$${params.length}`;
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM appointments appointment_filter
        WHERE appointment_filter.workspace_id = p.workspace_id
          AND appointment_filter.patient_id = p.id
          AND appointment_filter.clinic_id = ${clinicRef}
      )
    `);
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    const searchRef = `$${params.length}`;
    conditions.push(`(p.name ILIKE ${searchRef} OR p.mrn ILIKE ${searchRef} OR p.phone ILIKE ${searchRef} OR p.cnic ILIKE ${searchRef})`);
  }

  params.push(limit);

  const { rows } = await query(
    `
      SELECT
        p.id,
        p.mrn,
        p.name,
        p.phone,
        p.age,
        p.gender,
        p.cnic,
        p.address,
        p.blood_group,
        p.emergency_contact,
        p.created_at,
        p.updated_at,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        u.id AS doctor_user_id,
        u.email AS doctor_email,
        dp.full_name AS doctor_name,
        last_clinic.id AS last_clinic_id,
        last_clinic.name AS last_clinic_name,
        COALESCE(appointment_stats.total_appointments, 0) AS total_appointments,
        appointment_stats.last_appointment_date
      FROM patients p
      JOIN workspaces w ON w.id = p.workspace_id
      JOIN users u ON u.id = w.owner_user_id
      JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT
          workspace_id,
          patient_id,
          COUNT(*)::int AS total_appointments,
          MAX(date::date) AS last_appointment_date
        FROM appointments
        GROUP BY workspace_id, patient_id
      ) appointment_stats ON appointment_stats.workspace_id = p.workspace_id AND appointment_stats.patient_id = p.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name
        FROM appointments a
        JOIN clinics c ON c.id = a.clinic_id
        WHERE a.workspace_id = p.workspace_id
          AND a.patient_id = p.id
        ORDER BY a.date DESC, a.time DESC
        LIMIT 1
      ) last_clinic ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.updated_at DESC, p.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  res.json({
    data: rows.map(row => ({
      id: row.id,
      mrn: row.mrn,
      name: row.name,
      phone: row.phone,
      age: row.age,
      gender: row.gender,
      cnic: row.cnic,
      address: row.address,
      bloodGroup: row.blood_group,
      emergencyContact: row.emergency_contact,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        city: row.workspace_city,
      },
      doctor: {
        id: row.doctor_user_id,
        name: row.doctor_name,
        email: row.doctor_email,
      },
      lastClinic: row.last_clinic_id ? { id: row.last_clinic_id, name: row.last_clinic_name } : null,
      totalAppointments: row.total_appointments,
      lastAppointmentDate: row.last_appointment_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}));

app.get('/api/admin/diagnosis-catalog', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  res.json({ data: await listDiagnosisCatalogEntries() });
}));

app.post('/api/admin/medication-enrichments', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];
  if (itemsInput.length === 0) {
    return res.status(400).json({ error: 'At least one medication enrichment item is required', code: 'INVALID_MEDICATION_ENRICHMENT_IMPORT' });
  }

  const items = itemsInput.map(item => parseOrThrow(medicationEnrichmentImportSchema, item, 'INVALID_MEDICATION_ENRICHMENT_IMPORT'));

  await withTransaction(async client => {
    for (const item of items) {
      const lookupKey = buildMedicationEnrichmentLookupKey(item);
      await client.query(
        `
          INSERT INTO medication_enrichments (
            id,
            registration_no,
            lookup_key,
            brand_name,
            generic_name,
            strength_text,
            dosage_form,
            therapeutic_category,
            drug_category,
            trade_price,
            pack_info,
            indications,
            dosage,
            administration,
            contraindications,
            precautions,
            adverse_effects,
            alternatives_summary,
            source_name,
            source_updated_at,
            enrichment_status
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
            NULLIF($20, '')::timestamptz,
            $21
          )
          ON CONFLICT (lookup_key)
          DO UPDATE SET
            registration_no = EXCLUDED.registration_no,
            brand_name = EXCLUDED.brand_name,
            generic_name = EXCLUDED.generic_name,
            strength_text = EXCLUDED.strength_text,
            dosage_form = EXCLUDED.dosage_form,
            therapeutic_category = EXCLUDED.therapeutic_category,
            drug_category = EXCLUDED.drug_category,
            trade_price = EXCLUDED.trade_price,
            pack_info = EXCLUDED.pack_info,
            indications = EXCLUDED.indications,
            dosage = EXCLUDED.dosage,
            administration = EXCLUDED.administration,
            contraindications = EXCLUDED.contraindications,
            precautions = EXCLUDED.precautions,
            adverse_effects = EXCLUDED.adverse_effects,
            alternatives_summary = EXCLUDED.alternatives_summary,
            source_name = EXCLUDED.source_name,
            source_updated_at = EXCLUDED.source_updated_at,
            enrichment_status = EXCLUDED.enrichment_status,
            updated_at = NOW()
        `,
        [
          createId('medication_enrichment'),
          item.registrationNo.trim(),
          lookupKey,
          item.brandName.trim(),
          item.genericName.trim(),
          item.strengthText.trim(),
          item.dosageForm.trim(),
          item.therapeuticCategory.trim(),
          item.drugCategory.trim(),
          item.tradePrice.trim(),
          item.packInfo.trim(),
          item.indications.trim(),
          item.dosage.trim(),
          item.administration.trim(),
          item.contraindications.trim(),
          item.precautions.trim(),
          item.adverseEffects.trim(),
          item.alternativesSummary.trim(),
          item.sourceName.trim() || 'Licensed Pakistan Source',
          item.sourceUpdatedAt ?? '',
          item.enrichmentStatus,
        ]
      );
    }
  });

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'medication_enrichment_imported',
    details: { itemCount: items.length },
  });

  res.status(201).json({ ok: true, imported: items.length });
}));

app.post('/api/admin/diagnosis-catalog', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(diagnosisCatalogSchema, req.body ?? {}, 'INVALID_DIAGNOSIS_CATALOG_ENTRY');
  const { rows } = await query(
    `
      INSERT INTO diagnosis_catalog (id, code, name, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, code, name, is_active
    `,
    [createId('diagnosis_catalog_entry'), payload.code.trim(), payload.name.trim(), payload.isActive]
  );

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_diagnosis_created',
    details: { diagnosisCatalogId: rows[0].id, code: rows[0].code, name: rows[0].name },
  });

  res.status(201).json({ data: mapDiagnosisCatalogEntry(rows[0]) });
}));

app.put('/api/admin/diagnosis-catalog/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(diagnosisCatalogSchema, req.body ?? {}, 'INVALID_DIAGNOSIS_CATALOG_ENTRY');
  const { rows } = await query(
    `
      UPDATE diagnosis_catalog
      SET code = $2, name = $3, is_active = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING id, code, name, is_active
    `,
    [req.params.id, payload.code.trim(), payload.name.trim(), payload.isActive]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Diagnosis catalog entry not found', code: 'DIAGNOSIS_CATALOG_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_diagnosis_updated',
    details: { diagnosisCatalogId: rows[0].id, code: rows[0].code, name: rows[0].name },
  });

  res.json({ data: mapDiagnosisCatalogEntry(rows[0]) });
}));

app.delete('/api/admin/diagnosis-catalog/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM diagnosis_catalog WHERE id = $1', [req.params.id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Diagnosis catalog entry not found', code: 'DIAGNOSIS_CATALOG_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_diagnosis_deleted',
    details: { diagnosisCatalogId: req.params.id },
  });

  res.json({ ok: true });
}));

app.get('/api/admin/investigation-catalog', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  res.json({ data: await listInvestigationCatalogEntries() });
}));

app.post('/api/admin/investigation-catalog', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(investigationCatalogSchema, req.body ?? {}, 'INVALID_INVESTIGATION_CATALOG_ENTRY');
  const { rows } = await query(
    `
      INSERT INTO investigation_catalog (id, name, category, type, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, category, type, is_active
    `,
    [createId('investigation_catalog_entry'), payload.name.trim(), payload.category.trim(), payload.type, payload.isActive]
  );

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_investigation_created',
    details: { investigationCatalogId: rows[0].id, name: rows[0].name, type: rows[0].type },
  });

  res.status(201).json({ data: mapInvestigationCatalogEntry(rows[0]) });
}));

app.put('/api/admin/investigation-catalog/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(investigationCatalogSchema, req.body ?? {}, 'INVALID_INVESTIGATION_CATALOG_ENTRY');
  const { rows } = await query(
    `
      UPDATE investigation_catalog
      SET name = $2, category = $3, type = $4, is_active = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, category, type, is_active
    `,
    [req.params.id, payload.name.trim(), payload.category.trim(), payload.type, payload.isActive]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Investigation catalog entry not found', code: 'INVESTIGATION_CATALOG_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_investigation_updated',
    details: { investigationCatalogId: rows[0].id, name: rows[0].name, type: rows[0].type },
  });

  res.json({ data: mapInvestigationCatalogEntry(rows[0]) });
}));

app.delete('/api/admin/investigation-catalog/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM investigation_catalog WHERE id = $1', [req.params.id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Investigation catalog entry not found', code: 'INVESTIGATION_CATALOG_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_investigation_deleted',
    details: { investigationCatalogId: req.params.id },
  });

  res.json({ ok: true });
}));

app.get('/api/admin/referral-specialties', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  res.json({ data: await listReferralSpecialtiesCatalogEntries() });
}));

app.post('/api/admin/referral-specialties', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(referralSpecialtySchema, req.body ?? {}, 'INVALID_REFERRAL_SPECIALTY');
  const { rows } = await query(
    `
      INSERT INTO referral_specialties (id, name, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, name, is_active
    `,
    [createId('referral_specialty'), payload.name.trim(), payload.isActive]
  );

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_specialty_created',
    details: { referralSpecialtyId: rows[0].id, name: rows[0].name },
  });

  res.status(201).json({ data: mapReferralSpecialty(rows[0]) });
}));

app.put('/api/admin/referral-specialties/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(referralSpecialtySchema, req.body ?? {}, 'INVALID_REFERRAL_SPECIALTY');
  const { rows } = await query(
    `
      UPDATE referral_specialties
      SET name = $2, is_active = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, is_active
    `,
    [req.params.id, payload.name.trim(), payload.isActive]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Referral specialty not found', code: 'REFERRAL_SPECIALTY_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_specialty_updated',
    details: { referralSpecialtyId: rows[0].id, name: rows[0].name },
  });

  res.json({ data: mapReferralSpecialty(rows[0]) });
}));

app.delete('/api/admin/referral-specialties/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM referral_specialties WHERE id = $1', [req.params.id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Referral specialty not found', code: 'REFERRAL_SPECIALTY_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_specialty_deleted',
    details: { referralSpecialtyId: req.params.id },
  });

  res.json({ ok: true });
}));

app.get('/api/admin/referral-facilities', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  res.json({ data: await listReferralFacilitiesCatalogEntries() });
}));

app.post('/api/admin/referral-facilities', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(referralFacilitySchema, req.body ?? {}, 'INVALID_REFERRAL_FACILITY');
  const { rows } = await query(
    `
      INSERT INTO referral_facilities (id, name, city, phone, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, city, phone, is_active
    `,
    [createId('referral_facility'), payload.name.trim(), payload.city.trim(), payload.phone.trim(), payload.isActive]
  );

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_facility_created',
    details: { referralFacilityId: rows[0].id, name: rows[0].name, city: rows[0].city },
  });

  res.status(201).json({ data: mapReferralFacility(rows[0]) });
}));

app.put('/api/admin/referral-facilities/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const payload = parseOrThrow(referralFacilitySchema, req.body ?? {}, 'INVALID_REFERRAL_FACILITY');
  const { rows } = await query(
    `
      UPDATE referral_facilities
      SET name = $2, city = $3, phone = $4, is_active = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, city, phone, is_active
    `,
    [req.params.id, payload.name.trim(), payload.city.trim(), payload.phone.trim(), payload.isActive]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Referral facility not found', code: 'REFERRAL_FACILITY_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_facility_updated',
    details: { referralFacilityId: rows[0].id, name: rows[0].name, city: rows[0].city },
  });

  res.json({ data: mapReferralFacility(rows[0]) });
}));

app.delete('/api/admin/referral-facilities/:id', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM referral_facilities WHERE id = $1', [req.params.id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Referral facility not found', code: 'REFERRAL_FACILITY_NOT_FOUND' });
  }

  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    action: 'clinical_catalog_referral_facility_deleted',
    details: { referralFacilityId: req.params.id },
  });

  res.json({ ok: true });
}));

app.post('/api/admin/approval-requests/:id/approve', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  await withTransaction(async client => {
    const approvalResult = await client.query(
      `
        SELECT *
        FROM approval_requests
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (approvalResult.rowCount === 0) {
      const error = new Error('Approval request not found');
      error.statusCode = 404;
      throw error;
    }

    const approval = approvalResult.rows[0];

    await client.query(`UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`, [approval.user_id]);
    await client.query(`UPDATE workspaces SET status = 'active', updated_at = NOW() WHERE id = $1`, [approval.workspace_id]);
    await client.query(
      `
        UPDATE approval_requests
        SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), rejection_reason = '', updated_at = NOW()
        WHERE id = $1
      `,
      [id, req.auth.user.id]
    );

    const clinicResult = await client.query(
      `SELECT id FROM clinics WHERE workspace_id = $1 LIMIT 1`,
      [approval.workspace_id]
    );

    if (clinicResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo, is_active)
          VALUES ($1, $2, $3, $4, $5, '', 'By appointment', '[]'::jsonb, '🏥', TRUE)
        `,
        [createId('clinic'), approval.workspace_id, approval.clinic_name || 'Main Clinic', approval.city || '', approval.city || '']
      );
    }

    await recordAdminAudit(client, {
      actorUserId: req.auth.user.id,
      targetUserId: approval.user_id,
      workspaceId: approval.workspace_id,
      action: 'doctor_approved',
      details: { approvalRequestId: id },
    });
  });

  res.json({ ok: true });
}));

app.post('/api/admin/approval-requests/:id/reject', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body ?? {};

  await withTransaction(async client => {
    const approvalResult = await client.query(`SELECT * FROM approval_requests WHERE id = $1 LIMIT 1`, [id]);
    if (approvalResult.rowCount === 0) {
      const error = new Error('Approval request not found');
      error.statusCode = 404;
      throw error;
    }

    const approval = approvalResult.rows[0];
    await client.query(`UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [approval.user_id]);
    await client.query(`UPDATE workspaces SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [approval.workspace_id]);
    await client.query(
      `
        UPDATE approval_requests
        SET status = 'rejected', rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [id, reason, req.auth.user.id]
    );

    await recordAdminAudit(client, {
      actorUserId: req.auth.user.id,
      targetUserId: approval.user_id,
      workspaceId: approval.workspace_id,
      action: 'doctor_rejected',
      details: { approvalRequestId: id, reason },
    });
  });

  res.json({ ok: true });
}));

app.put('/api/admin/doctors/:id/profile', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = parseOrThrow(adminDoctorProfileUpdateSchema, req.body ?? {}, 'INVALID_ADMIN_DOCTOR_PROFILE');

  await withTransaction(async client => {
    const existingEmail = await client.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
          AND id <> $2
        LIMIT 1
      `,
      [payload.email.trim().toLowerCase(), id]
    );

    if (existingEmail.rowCount > 0) {
      const error = new Error('Email already exists');
      error.statusCode = 409;
      throw error;
    }

    const doctorResult = await client.query(
      `
        SELECT u.id, w.id AS workspace_id
        FROM users u
        JOIN workspaces w ON w.owner_user_id = u.id
        WHERE u.id = $1
          AND u.role = 'doctor_owner'
        LIMIT 1
      `,
      [id]
    );

    if (doctorResult.rowCount === 0) {
      const error = new Error('Doctor account not found');
      error.statusCode = 404;
      throw error;
    }

    const workspaceId = doctorResult.rows[0].workspace_id;

    await client.query(
      `
        UPDATE users
        SET email = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [id, payload.email.trim().toLowerCase()]
    );

    await client.query(
      `
        UPDATE doctor_profiles
        SET full_name = $2, phone = $3, pmc_number = $4, specialization = $5, qualifications = $6, notes = $7, updated_at = NOW()
        WHERE user_id = $1
      `,
      [
        id,
        payload.fullName.trim(),
        payload.phone.trim(),
        payload.pmcNumber.trim(),
        payload.specialization.trim(),
        payload.qualifications.trim(),
        payload.notes.trim(),
      ]
    );

    await client.query(
      `
        UPDATE workspaces
        SET name = $2, city = $3, updated_at = NOW()
        WHERE id = $1
      `,
      [workspaceId, payload.workspaceName.trim(), payload.workspaceCity.trim()]
    );

    await recordAdminAudit(client, {
      actorUserId: req.auth.user.id,
      targetUserId: id,
      workspaceId,
      action: 'doctor_profile_updated',
      details: {
        email: payload.email.trim().toLowerCase(),
        fullName: payload.fullName.trim(),
        phone: payload.phone.trim(),
        pmcNumber: payload.pmcNumber.trim(),
        specialization: payload.specialization.trim(),
        qualifications: payload.qualifications.trim(),
        notes: payload.notes.trim(),
        workspaceName: payload.workspaceName.trim(),
        workspaceCity: payload.workspaceCity.trim(),
      },
    });
  });

  res.json({ ok: true });
}));

app.put('/api/admin/doctors/:id/status', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid doctor status', code: 'INVALID_STATUS' });
  }

  await query(`UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1`, [id, status]);
  await query(`UPDATE workspaces SET status = $2, updated_at = NOW() WHERE owner_user_id = $1`, [id, status]);
  const workspaceResult = await query(`SELECT id FROM workspaces WHERE owner_user_id = $1 LIMIT 1`, [id]);
  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    targetUserId: id,
    workspaceId: workspaceResult.rows[0]?.id ?? null,
    action: 'doctor_status_changed',
    details: { status },
  });

  res.json({ ok: true });
}));

app.post('/api/admin/doctors/:id/reset-password', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = parseOrThrow(passwordResetSchema, req.body ?? {}, 'INVALID_PASSWORD_RESET');
  const passwordIssue = validatePasswordPolicy(newPassword);
  if (passwordIssue) {
    return res.status(400).json({ error: passwordIssue, code: 'WEAK_PASSWORD' });
  }

  const result = await query(
    `
      UPDATE users
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1 AND role = 'doctor_owner'
      RETURNING id
    `,
    [id, await hashPassword(newPassword)]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Doctor account not found', code: 'DOCTOR_NOT_FOUND' });
  }

  const workspaceResult = await query(`SELECT id FROM workspaces WHERE owner_user_id = $1 LIMIT 1`, [id]);
  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    targetUserId: id,
    workspaceId: workspaceResult.rows[0]?.id ?? null,
    action: 'doctor_password_reset',
    details: {},
  });

  res.json({ ok: true });
}));

app.put('/api/admin/workspaces/:id/subscription', requireAuth, requireRole('platform_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { planName, status, trialEndsAt } = req.body ?? {};

  if (!planName || !status) {
    return res.status(400).json({ error: 'Missing subscription data', code: 'INVALID_SUBSCRIPTION' });
  }

  await query(
    `
      UPDATE subscriptions
      SET plan_name = $2, status = $3, trial_ends_at = $4, updated_at = NOW()
      WHERE workspace_id = $1
    `,
    [id, planName, status, trialEndsAt || null]
  );
  await recordAdminAudit(query, {
    actorUserId: req.auth.user.id,
    workspaceId: id,
    action: 'subscription_updated',
    details: { planName, status, trialEndsAt: trialEndsAt || null },
  });

  res.json({ ok: true });
}));

app.get('/api/clinics', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const clinics = await getWorkspaceClinics(req.auth.workspace.id);
  res.json({ data: clinics });
}));

app.post('/api/clinics', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { name, location = '', city = '', phone = '', timings = 'By appointment', specialties = [], logo = '🏥' } = req.body ?? {};
  if (!name || !city) {
    return res.status(400).json({ error: 'Clinic name and city are required', code: 'INVALID_CLINIC' });
  }

  const clinic = {
    id: createId('clinic'),
    workspaceId: req.auth.workspace.id,
    name: name.trim(),
    location: location.trim(),
    city: city.trim(),
    phone: phone.trim(),
    timings: timings.trim() || 'By appointment',
    specialties,
    logo,
  };

  await query(
    `
      INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW())
    `,
    [clinic.id, clinic.workspaceId, clinic.name, clinic.location, clinic.city, clinic.phone, clinic.timings, clinic.specialties, clinic.logo]
  );

  res.status(201).json({
    data: {
      id: clinic.id,
      name: clinic.name,
      location: clinic.location,
      city: clinic.city,
      phone: clinic.phone,
      timings: clinic.timings,
      specialties: clinic.specialties,
      logo: clinic.logo,
      isActive: true,
    },
  });
}));

app.put('/api/clinics/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, location = '', city = '', phone = '', timings = 'By appointment', specialties = [], logo = '🏥' } = req.body ?? {};
  if (!name || !city) {
    return res.status(400).json({ error: 'Clinic name and city are required', code: 'INVALID_CLINIC' });
  }

  const result = await query(
    `
      UPDATE clinics
      SET name = $3, location = $4, city = $5, phone = $6, timings = $7, specialties = $8, logo = $9, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, name, location, city, phone, timings, specialties, logo, is_active
    `,
    [id, req.auth.workspace.id, name.trim(), location.trim(), city.trim(), phone.trim(), timings.trim() || 'By appointment', specialties, logo]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Clinic not found', code: 'CLINIC_NOT_FOUND' });
  }

  res.json({ data: mapClinic(result.rows[0]) });
}));

app.get('/api/patients', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `
      SELECT *
      FROM patients
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `,
    [req.auth.workspace.id]
  );

  res.json({ data: rows.map(mapPatient) });
}));

app.get('/api/patients/search-by-phone', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const phone = String(req.query.phone ?? '').trim();
  if (!phone) {
    return res.json({ data: [] });
  }

  const rows = await withTransaction(client => searchPatientsByPhone(client, req.auth.workspace.id, phone));
  res.json({ data: rows.map(mapPatient) });
}));

app.get('/api/patients/search', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    return res.json({ data: [] });
  }

  const searchTerm = `%${q.toLowerCase()}%`;
  const { rows } = await query(
    `
      SELECT *
      FROM patients
      WHERE workspace_id = $1
        AND (
          LOWER(name) LIKE $2
          OR LOWER(mrn) LIKE $2
          OR LOWER(phone) LIKE $2
          OR LOWER(cnic) LIKE $2
        )
      ORDER BY
        CASE
          WHEN LOWER(name) = LOWER($3) THEN 0
          WHEN LOWER(mrn) = LOWER($3) THEN 1
          WHEN LOWER(phone) = LOWER($3) THEN 2
          WHEN LOWER(cnic) = LOWER($3) THEN 3
          WHEN LOWER(name) LIKE LOWER($4) THEN 4
          ELSE 5
        END,
        created_at DESC
      LIMIT 25
    `,
    [req.auth.workspace.id, searchTerm, q.toLowerCase(), `${q.toLowerCase()}%`]
  );

  res.json({ data: rows.map(mapPatient) });
}));

app.post('/api/patients', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const patient = parseOrThrow(patientSchema, req.body ?? {}, 'INVALID_PATIENT');

  const id = patient.id || createId('patient');
  const mrn = patient.mrn || `MRN-${Date.now().toString().slice(-8)}`;

  await query(
    `
      INSERT INTO patients (
        id, workspace_id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      id,
      req.auth.workspace.id,
      mrn,
      patient.name,
      patient.phone || '',
      patient.age || 0,
      patient.gender || 'Male',
      patient.cnic || '',
      patient.address || '',
      patient.bloodGroup || '',
      patient.emergencyContact || '',
    ]
  );

  res.status(201).json({
    data: {
      id,
      mrn,
      name: patient.name,
      phone: patient.phone || '',
      age: patient.age || 0,
      gender: patient.gender || 'Male',
      cnic: patient.cnic || '',
      address: patient.address || '',
      bloodGroup: patient.bloodGroup || '',
      emergencyContact: patient.emergencyContact || '',
    },
  });
}));

app.put('/api/patients/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const patient = parseOrThrow(patientSchema, req.body ?? {}, 'INVALID_PATIENT');

  const result = await query(
    `
      UPDATE patients
      SET
        name = $3,
        phone = $4,
        age = $5,
        gender = $6,
        cnic = $7,
        address = $8,
        blood_group = $9,
        emergency_contact = $10,
        updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `,
    [
      id,
      req.auth.workspace.id,
      patient.name,
      patient.phone || '',
      patient.age || 0,
      patient.gender || 'Male',
      patient.cnic || '',
      patient.address || '',
      patient.bloodGroup || '',
      patient.emergencyContact || '',
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Patient not found', code: 'PATIENT_NOT_FOUND' });
  }

  res.json({ data: mapPatient(result.rows[0]) });
}));

app.get('/api/appointments', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `
      SELECT *
      FROM appointments
      WHERE workspace_id = $1
      ORDER BY date ASC, time ASC, token_number ASC
    `,
    [req.auth.workspace.id]
  );

  res.json({ data: rows.map(mapAppointment) });
}));

app.post('/api/appointments', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const appointment = parseOrThrow(appointmentSchema, req.body ?? {}, 'INVALID_APPOINTMENT');

  const saved = await withTransaction(client =>
    createAppointmentForWorkspace(client, {
      workspaceId: req.auth.workspace.id,
      doctorUserId: req.auth.user.id,
      appointment,
    })
  );

  res.status(201).json({ data: mapAppointment(saved) });
}));

app.put('/api/appointments/:id', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const appointment = parseOrThrow(appointmentSchema, req.body ?? {}, 'INVALID_APPOINTMENT');
  const saved = await withTransaction(client =>
    updateAppointmentForWorkspace(client, {
      workspaceId: req.auth.workspace.id,
      appointmentId: id,
      appointment,
    })
  );
  res.json({ data: mapAppointment(saved) });
}));

app.patch('/api/appointments/:id/status', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};
  if (!status) {
    return res.status(400).json({ error: 'Status is required', code: 'INVALID_STATUS' });
  }

  await withTransaction(async client => {
    const result = await client.query(
      `SELECT clinic_id, date FROM appointments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, req.auth.workspace.id]
    );

    if (result.rowCount === 0) {
      const error = new Error('Appointment not found');
      error.statusCode = 404;
      throw error;
    }

    const target = result.rows[0];

    await client.query(
      `
        UPDATE appointments
        SET status = $3, updated_at = NOW()
        WHERE id = $1 AND workspace_id = $2
      `,
      [id, req.auth.workspace.id, status]
    );

    if (status === 'in-consultation') {
      await client.query(
        `
          UPDATE appointments
          SET status = 'waiting', updated_at = NOW()
          WHERE workspace_id = $1
            AND clinic_id = $2
            AND date = $3
            AND id <> $4
            AND status = 'in-consultation'
        `,
        [req.auth.workspace.id, target.clinic_id, target.date, id]
      );
    }
  });

  res.json({ ok: true });
}));

app.get('/api/consultation-drafts', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const drafts = await getWorkspaceDrafts(req.auth.workspace.id);
  res.json({ data: drafts });
}));

app.put('/api/consultation-drafts/:appointmentId', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  await withTransaction(client =>
    saveConsultationDraftForEncounter(client, {
      workspaceId: req.auth.workspace.id,
      doctorUserId: req.auth.user.id,
      appointmentId,
      payload: req.body ?? {},
    })
  );
  res.json({ ok: true });
}));

app.get('/api/clinical-notes', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const patientId = req.query.patientId || null;
  const notes = await getWorkspaceNotes(req.auth.workspace.id, patientId);
  res.json({ data: notes });
}));

app.post('/api/consultations/complete', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const payload = req.body ?? {};
  const { noteId } = await withTransaction(client =>
    completeConsultationEncounter(client, {
      workspaceId: req.auth.workspace.id,
      doctorUserId: req.auth.user.id,
      payload,
    })
  );

  const note = await getWorkspaceNoteById(req.auth.workspace.id, noteId);
  if (!note) {
    throw createHttpError('Completed note could not be loaded', 'CONSULTATION_READBACK_FAILED', 500);
  }

  res.status(201).json({
    data: note,
  });
}));

app.post('/api/walk-ins', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const { clinicId, ...payload } = parseOrThrow(walkInSchema, req.body ?? {}, 'INVALID_WALK_IN');
  if (!payload.patientId && !String(payload.name ?? '').trim()) {
    return res.status(400).json({ error: 'Patient name is required', code: 'INVALID_WALK_IN' });
  }

  const result = await withTransaction(client =>
    createWalkInEncounter(client, {
      workspaceId: req.auth.workspace.id,
      doctorUserId: req.auth.user.id,
      clinicId,
      payload,
    })
  );

  res.status(201).json({
    data: {
      patient: mapPatient(result.patient),
      appointment: mapAppointment(result.appointment),
      reusedPatient: result.reusedPatient,
      matchedBy: result.matchedBy,
    },
  });
}));

app.get('/api/settings', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  const settings = await getWorkspaceSettings(req.auth.workspace.id);
  res.json({ data: settings });
}));

app.put('/api/settings', requireAuth, requireRole('doctor_owner'), asyncHandler(async (req, res) => {
  await query(
    `
      INSERT INTO workspace_settings (id, workspace_id, data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (workspace_id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_at = NOW()
    `,
    [createId('workspace_setting'), req.auth.workspace.id, req.body ?? {}]
  );

  res.json({ ok: true });
}));

app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  logError('api_error', error, { requestId: _req.requestId, path: _req.path, method: _req.method });
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error.message || 'Server error',
    code: error.code || 'SERVER_ERROR',
  });
});

initDb()
  .then(async () => {
    if (isProduction && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123')) {
      throw new Error('Production startup blocked: ADMIN_PASSWORD must be changed from the default value.');
    }
    if (isProduction && !process.env.JWT_SECRET) {
      throw new Error('Production startup blocked: JWT_SECRET is required.');
    }
    if (isProduction && enablePublicDemo) {
      logWarn('public_demo_enabled_in_production', {});
    }

    if (warmMedicationCatalogOnBoot) {
      await warmMedicationCatalog();
    }

    app.listen(port, () => {
      logInfo('server_started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        warmMedicationCatalogOnBoot,
      });
    });
  })
  .catch(error => {
    logError('startup_failed', error);
    process.exit(1);
  });
