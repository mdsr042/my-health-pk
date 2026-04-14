import { createId } from './id.js';

function createHttpError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function requireOwnedClinic(client, workspaceId, clinicId, { lock = false } = {}) {
  const query = lock
    ? `SELECT id, workspace_id FROM clinics WHERE id = $1 AND workspace_id = $2 LIMIT 1 FOR UPDATE`
    : `SELECT id, workspace_id FROM clinics WHERE id = $1 AND workspace_id = $2 LIMIT 1`;
  const result = await client.query(query, [clinicId, workspaceId]);
  if (result.rowCount === 0) {
    throw createHttpError('Clinic not found in this workspace', 'INVALID_CLINIC_REFERENCE', 404);
  }
  return result.rows[0];
}

export async function requireOwnedPatient(client, workspaceId, patientId) {
  const result = await client.query(
    `SELECT id, workspace_id FROM patients WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [patientId, workspaceId]
  );
  if (result.rowCount === 0) {
    throw createHttpError('Patient not found in this workspace', 'INVALID_PATIENT_REFERENCE', 404);
  }
  return result.rows[0];
}

export async function requireOwnedAppointment(client, workspaceId, appointmentId, { lock = false } = {}) {
  const query = lock
    ? `
        SELECT id, workspace_id, clinic_id, patient_id, date, time, status
        FROM appointments
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
        FOR UPDATE
      `
    : `
        SELECT id, workspace_id, clinic_id, patient_id, date, time, status
        FROM appointments
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `;
  const result = await client.query(query, [appointmentId, workspaceId]);
  if (result.rowCount === 0) {
    throw createHttpError('Appointment not found in this workspace', 'INVALID_APPOINTMENT_REFERENCE', 404);
  }
  return result.rows[0];
}

async function getNextTokenNumber(client, workspaceId, clinicId, date) {
  await requireOwnedClinic(client, workspaceId, clinicId, { lock: true });
  const result = await client.query(
    `
      SELECT COALESCE(MAX(token_number), 0)::int + 1 AS next_token
      FROM appointments
      WHERE workspace_id = $1
        AND clinic_id = $2
        AND date = $3
    `,
    [workspaceId, clinicId, date]
  );

  return result.rows[0]?.next_token ?? 1;
}

async function findMatchingPatientForWalkIn(client, workspaceId, payload) {
  const normalizedCnic = String(payload.cnic ?? '').trim();
  if (normalizedCnic) {
    const result = await client.query(
      `
        SELECT id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        FROM patients
        WHERE workspace_id = $1 AND cnic = $2
        LIMIT 1
      `,
      [workspaceId, normalizedCnic]
    );
    if (result.rowCount > 0) return { patient: result.rows[0], matchedBy: 'cnic' };
  }

  const normalizedPhone = String(payload.phone ?? '').trim();
  if (normalizedPhone) {
    const result = await client.query(
      `
        SELECT id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        FROM patients
        WHERE workspace_id = $1 AND phone = $2
        LIMIT 1
      `,
      [workspaceId, normalizedPhone]
    );
    if (result.rowCount > 0) return { patient: result.rows[0], matchedBy: 'phone' };
  }

  const normalizedName = String(payload.name ?? '').trim();
  const age = Number(payload.age ?? 0);
  if (normalizedName && age > 0) {
    const result = await client.query(
      `
        SELECT id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        FROM patients
        WHERE workspace_id = $1
          AND LOWER(name) = LOWER($2)
          AND age = $3
        LIMIT 1
      `,
      [workspaceId, normalizedName, age]
    );
    if (result.rowCount > 0) return { patient: result.rows[0], matchedBy: 'name_age' };
  }

  return null;
}

export async function searchPatientsByPhone(client, workspaceId, phone) {
  const normalizedPhone = String(phone ?? '').trim();
  if (!normalizedPhone) return [];

  const result = await client.query(
    `
      SELECT id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
      FROM patients
      WHERE workspace_id = $1 AND phone = $2
      ORDER BY created_at DESC, name ASC
    `,
    [workspaceId, normalizedPhone]
  );

  return result.rows;
}

export async function createAppointmentForWorkspace(client, { workspaceId, doctorUserId, appointment }) {
  await requireOwnedPatient(client, workspaceId, appointment.patientId);
  await requireOwnedClinic(client, workspaceId, appointment.clinicId);

  const id = createId('appointment');
  const tokenNumber = appointment.tokenNumber > 0
    ? appointment.tokenNumber
    : await getNextTokenNumber(client, workspaceId, appointment.clinicId, appointment.date);

  const result = await client.query(
    `
      INSERT INTO appointments (
        id, workspace_id, clinic_id, patient_id, doctor_user_id, date, time, status, type, chief_complaint, token_number, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id, patient_id, clinic_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
    `,
    [
      id,
      workspaceId,
      appointment.clinicId,
      appointment.patientId,
      doctorUserId,
      appointment.date,
      appointment.time,
      appointment.status || 'scheduled',
      appointment.type || 'new',
      appointment.chiefComplaint || '',
      tokenNumber,
    ]
  );

  return result.rows[0];
}

export async function updateAppointmentForWorkspace(client, { workspaceId, appointmentId, appointment }) {
  await requireOwnedAppointment(client, workspaceId, appointmentId, { lock: true });
  await requireOwnedPatient(client, workspaceId, appointment.patientId);
  await requireOwnedClinic(client, workspaceId, appointment.clinicId);

  const result = await client.query(
    `
      UPDATE appointments
      SET patient_id = $3,
          clinic_id = $4,
          date = $5,
          time = $6,
          status = $7,
          type = $8,
          chief_complaint = $9,
          token_number = $10,
          updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, patient_id, clinic_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
    `,
    [
      appointmentId,
      workspaceId,
      appointment.patientId,
      appointment.clinicId,
      appointment.date,
      appointment.time,
      appointment.status,
      appointment.type,
      appointment.chiefComplaint || '',
      appointment.tokenNumber || 0,
    ]
  );

  if (result.rowCount === 0) {
    throw createHttpError('Appointment not found', 'INVALID_APPOINTMENT_REFERENCE', 404);
  }

  return result.rows[0];
}

export async function saveConsultationDraftForEncounter(client, { workspaceId, doctorUserId, appointmentId, payload }) {
  const appointment = await requireOwnedAppointment(client, workspaceId, appointmentId, { lock: true });

  if (appointment.patient_id !== payload.patientId) {
    throw createHttpError('Draft patient does not match the appointment', 'INVALID_PATIENT_REFERENCE', 400);
  }

  if (appointment.clinic_id !== payload.clinicId) {
    throw createHttpError('Draft clinic does not match the appointment', 'INVALID_CLINIC_REFERENCE', 400);
  }

  await client.query(
    `
      INSERT INTO consultation_drafts (
        id, appointment_id, patient_id, workspace_id, clinic_id, doctor_user_id, payload, saved_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (appointment_id) DO UPDATE SET
        patient_id = EXCLUDED.patient_id,
        workspace_id = EXCLUDED.workspace_id,
        clinic_id = EXCLUDED.clinic_id,
        doctor_user_id = EXCLUDED.doctor_user_id,
        payload = EXCLUDED.payload,
        saved_at = NOW(),
        updated_at = NOW()
    `,
    [createId('consultation_draft'), appointmentId, payload.patientId, workspaceId, payload.clinicId, doctorUserId, payload]
  );
}

export async function createWalkInEncounter(client, { workspaceId, doctorUserId, clinicId, payload }) {
  await requireOwnedClinic(client, workspaceId, clinicId, { lock: true });

  const appointmentId = createId('appointment');
  const now = new Date();
  const date = payload.date;
  const time = payload.time || `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const tokenNumber = await getNextTokenNumber(client, workspaceId, clinicId, date);

  let matchedPatient = null;
  if (payload.patientId) {
    const patient = await requireOwnedPatient(client, workspaceId, payload.patientId);
    const result = await client.query(
      `
        SELECT id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        FROM patients
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [patient.id, workspaceId]
    );
    matchedPatient = result.rowCount > 0 ? { patient: result.rows[0], matchedBy: 'phone' } : null;
  } else {
    matchedPatient = await findMatchingPatientForWalkIn(client, workspaceId, payload);
  }

  let patientRow = matchedPatient?.patient ?? null;
  if (!patientRow) {
    if (!String(payload.name ?? '').trim()) {
      throw createHttpError('Patient name is required', 'INVALID_WALK_IN', 400);
    }
    const patientId = createId('patient');
    const mrn = `MRN-${Date.now().toString().slice(-8)}`;
    const patientResult = await client.query(
      `
        INSERT INTO patients (
          id, workspace_id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
      `,
      [
        patientId,
        workspaceId,
        mrn,
        payload.name,
        payload.phone || '',
        payload.age || 0,
        payload.gender || 'Male',
        payload.cnic || '',
        payload.address || '',
        payload.bloodGroup || '',
        payload.emergencyContact || '',
      ]
    );
    patientRow = patientResult.rows[0];
  }

  const appointmentResult = await client.query(
    `
      INSERT INTO appointments (
        id, workspace_id, clinic_id, patient_id, doctor_user_id, date, time, status, type, chief_complaint, token_number, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'waiting', $8, $9, $10, NOW())
      RETURNING id, patient_id, clinic_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
    `,
    [
      appointmentId,
      workspaceId,
      clinicId,
      patientRow.id,
      doctorUserId,
      date,
      time,
      matchedPatient ? 'follow-up' : 'new',
      payload.chiefComplaint || 'Walk-in',
      tokenNumber,
    ]
  );

  return {
    patient: patientRow,
    appointment: appointmentResult.rows[0],
    reusedPatient: Boolean(matchedPatient),
    matchedBy: matchedPatient?.matchedBy ?? null,
  };
}

export async function completeConsultationEncounter(client, { workspaceId, doctorUserId, payload }) {
  const appointment = await requireOwnedAppointment(client, workspaceId, payload.appointmentId, { lock: true });

  if (appointment.patient_id !== payload.patientId) {
    throw createHttpError('Consultation patient does not match the appointment', 'INVALID_PATIENT_REFERENCE', 400);
  }

  if (appointment.clinic_id !== payload.clinicId) {
    throw createHttpError('Consultation clinic does not match the appointment', 'INVALID_CLINIC_REFERENCE', 400);
  }

  if (['cancelled', 'no-show', 'completed'].includes(appointment.status)) {
    throw createHttpError('This appointment cannot be completed from its current status', 'INVALID_APPOINTMENT_STATE', 409);
  }

  const noteId = createId('clinical_note');

  await client.query(
    `
      INSERT INTO clinical_notes (
        id, appointment_id, workspace_id, patient_id, clinic_id, doctor_user_id, date,
        chief_complaint, hpi, past_history, allergies, examination, assessment,
        plan, instructions, follow_up, vitals, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, NOW(),
        $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'completed'
      )
    `,
    [
      noteId,
      payload.appointmentId,
      workspaceId,
      payload.patientId,
      payload.clinicId,
      doctorUserId,
      payload.chiefComplaint || '',
      payload.hpi || '',
      payload.pastHistory || '',
      payload.allergies || '',
      payload.examination || '',
      payload.assessment || '',
      payload.plan || '',
      payload.instructions || '',
      payload.followUp || '',
      payload.vitals || {},
    ]
  );

  for (const diagnosis of payload.diagnoses ?? []) {
    await client.query(
      `
        INSERT INTO diagnoses (id, note_id, code, name, is_primary)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [diagnosis.id || createId('diagnosis'), noteId, diagnosis.code || '', diagnosis.name, Boolean(diagnosis.isPrimary)]
    );
  }

  for (const medication of payload.medications ?? []) {
    await client.query(
      `
        INSERT INTO medications (
          id, note_id, name, name_urdu, generic_name, strength, form, route, dose_pattern,
          frequency, frequency_urdu, duration, duration_urdu, instructions, instructions_urdu, diagnosis_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
      [
        medication.id || createId('medication'),
        noteId,
        medication.name,
        medication.nameUrdu || '',
        medication.generic || '',
        medication.strength || '',
        medication.form || '',
        medication.route || '',
        medication.dosePattern || '',
        medication.frequency || '',
        medication.frequencyUrdu || '',
        medication.duration || '',
        medication.durationUrdu || '',
        medication.instructions || '',
        medication.instructionsUrdu || '',
        medication.diagnosisId || '',
      ]
    );
  }

  for (const order of payload.labOrders ?? []) {
    await client.query(
      `
        INSERT INTO lab_orders (id, note_id, test_name, category, priority, status, result, date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        order.id || createId('lab_order'),
        noteId,
        order.testName,
        order.category,
        order.priority || 'routine',
        order.status || 'ordered',
        order.result || '',
        order.date,
      ]
    );
  }

  for (const action of payload.careActions ?? []) {
    await client.query(
      `
        INSERT INTO care_actions (
          id, note_id, appointment_id, workspace_id, patient_id, clinic_id, doctor_user_id,
          type, target_type, target_id, title, notes, urgency, action_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        action.id || createId('care_action'),
        noteId,
        payload.appointmentId,
        workspaceId,
        payload.patientId,
        payload.clinicId,
        doctorUserId,
        action.type,
        action.targetType || '',
        action.targetId || '',
        action.title || '',
        action.notes || '',
        action.urgency || 'routine',
        action.actionDate || '',
      ]
    );
  }

  await client.query(
    `
      DELETE FROM consultation_drafts
      WHERE appointment_id = $1 AND workspace_id = $2
    `,
    [payload.appointmentId, workspaceId]
  );

  await client.query(
    `
      UPDATE appointments
      SET status = 'completed', updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
    `,
    [payload.appointmentId, workspaceId]
  );

  return { noteId };
}
