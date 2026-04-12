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
import { getMedicationCatalogEntries, getMedicationCatalogEntry, searchMedicationCatalog } from './medicationCatalog.js';
import { createRateLimitMiddleware } from './rateLimit.js';
import { appointmentSchema, parseOrThrow, passwordChangeSchema, passwordResetSchema, patientSchema, signupSchema, treatmentTemplateSchema, validatePasswordPolicy, walkInSchema } from './validation.js';
import {
  completeConsultationEncounter,
  createAppointmentForWorkspace,
  createWalkInEncounter,
  searchPatientsByPhone,
  saveConsultationDraftForEncounter,
  updateAppointmentForWorkspace,
} from './workflows.js';
import { starterTreatmentTemplates } from './treatmentTemplates.js';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 4001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const isProduction = process.env.NODE_ENV === 'production';
const enablePublicDemo = process.env.ENABLE_PUBLIC_DEMO === 'true';

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
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    city: row.city,
    phone: row.phone,
    timings: row.timings,
    specialties: row.specialties ?? [],
    logo: row.logo,
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

function mapClinicalNote(row, diagnosesByNote, medicationsByNote, labOrdersByNote) {
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
    status: row.status,
  };
}

async function getWorkspaceClinics(workspaceId) {
  const { rows } = await query(
    `
      SELECT id, name, location, city, phone, timings, specialties, logo
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
  const [diagnosesResult, medicationsResult, labOrdersResult] = await Promise.all([
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

  return notes.map(note => mapClinicalNote(note, diagnosesByNote, medicationsByNote, labOrdersByNote));
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
  const result = await searchMedicationCatalog(queryText, Number.isFinite(limit) ? limit : 20, Number.isFinite(cursor) ? cursor : 0);
  res.json({
    data: result.entries,
    meta: {
      ...result.metadata,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  });
}));

app.get('/api/medication-catalog/:registrationNo', requireAuth, asyncHandler(async (req, res) => {
  const entry = await getMedicationCatalogEntry(String(req.params.registrationNo ?? ''));
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

app.get('/api/admin/audit-logs', requireAuth, requireRole('platform_admin'), asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `
      SELECT id, actor_user_id, target_user_id, workspace_id, action, details, created_at
      FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT 20
    `
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
          INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo)
          VALUES ($1, $2, $3, $4, $5, '', 'By appointment', '[]'::jsonb, '🏥')
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
      INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
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
      RETURNING id, name, location, city, phone, timings, specialties, logo
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
  const completedAt = new Date().toISOString();
  const { noteId } = await withTransaction(client =>
    completeConsultationEncounter(client, {
      workspaceId: req.auth.workspace.id,
      doctorUserId: req.auth.user.id,
      payload,
    })
  );

  res.status(201).json({
    data: {
      id: noteId,
      appointmentId: payload.appointmentId,
      patientId: payload.patientId,
      clinicId: payload.clinicId,
      doctorId: req.auth.user.id,
      date: completedAt,
      chiefComplaint: payload.chiefComplaint || '',
      hpi: payload.hpi || '',
      pastHistory: payload.pastHistory || '',
      allergies: payload.allergies || '',
      examination: payload.examination || '',
      assessment: payload.assessment || '',
      plan: payload.plan || '',
      instructions: payload.instructions || '',
      followUp: payload.followUp || '',
      vitals: payload.vitals || {},
      diagnoses: payload.diagnoses || [],
      medications: payload.medications || [],
      labOrders: payload.labOrders || [],
      status: 'completed',
    },
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
  .then(() => {
    if (isProduction && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123')) {
      throw new Error('Production startup blocked: ADMIN_PASSWORD must be changed from the default value.');
    }
    if (isProduction && !process.env.JWT_SECRET) {
      throw new Error('Production startup blocked: JWT_SECRET is required.');
    }
    if (isProduction && enablePublicDemo) {
      logWarn('public_demo_enabled_in_production', {});
    }

    app.listen(port, () => {
      logInfo('server_started', { port, environment: process.env.NODE_ENV || 'development' });
    });
  })
  .catch(error => {
    logError('startup_failed', error);
    process.exit(1);
  });
