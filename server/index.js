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
