import bcrypt from 'bcryptjs';
import { createId } from './id.js';

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@myhealth.pk';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo123';

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function consultationPayload({ patientId, clinicId, chiefComplaint, pastHistory, allergies, assessment, plan, instructions, followUp }) {
  return {
    patientId,
    clinicId,
    chiefComplaint,
    hpi: '',
    pastHistory,
    allergies,
    examination: '',
    assessment,
    plan,
    instructions,
    followUp,
    vitals: {
      bp: '130/85',
      pulse: '78',
      temp: '98.6',
      spo2: '97',
      weight: '82',
      height: '175',
      bmi: '26.8',
      respiratoryRate: '18',
    },
    diagnoses: [],
    medications: [],
    labOrders: [],
    savedAt: new Date().toISOString(),
  };
}

export async function seedDemoWorkspace({ query }) {
  const existingDemo = await query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [DEMO_EMAIL]);
  if (existingDemo.rowCount > 0) {
    return;
  }

  const today = getLocalDateKey();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demoUserId = createId('user');
  const demoDoctorProfileId = createId('doctor_profile');
  const demoWorkspaceId = createId('workspace');
  const demoClinic1Id = createId('clinic');
  const demoClinic2Id = createId('clinic');
  const demoSubscriptionId = createId('subscription');
  const demoMemberId = createId('workspace_member');
  const demoSettingsId = createId('workspace_setting');
  const demoPatient1Id = createId('patient');
  const demoPatient2Id = createId('patient');
  const demoPatient3Id = createId('patient');
  const demoPatient4Id = createId('patient');
  const demoPatient5Id = createId('patient');

  await query(
    `
      INSERT INTO users (id, email, password_hash, role, status, is_demo)
      VALUES ($1, $2, $3, 'doctor_owner', 'active', TRUE)
    `,
    [demoUserId, DEMO_EMAIL, passwordHash]
  );

  await query(
    `
      INSERT INTO doctor_profiles (id, user_id, full_name, phone, pmc_number, specialization, qualifications, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      demoDoctorProfileId,
      demoUserId,
      'Dr. Demo User',
      '0300-0000000',
      'PMC-DEMO-001',
      'Internal Medicine',
      'MBBS, FCPS (Medicine)',
      'Isolated demo account for walkthroughs',
    ]
  );

  await query(
    `
      INSERT INTO workspaces (id, owner_user_id, name, city, status, is_demo)
      VALUES ($1, $2, $3, $4, 'active', TRUE)
    `,
    [demoWorkspaceId, demoUserId, 'My Health Demo Practice', 'Lahore']
  );

  await query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES ($1, $2, $3, 'owner')
    `,
    [demoMemberId, demoWorkspaceId, demoUserId]
  );

  await query(
    `
      INSERT INTO subscriptions (id, workspace_id, plan_name, status, trial_ends_at)
      VALUES ($1, $2, 'Demo', 'active', NULL)
    `,
    [demoSubscriptionId, demoWorkspaceId]
  );

  await query(
    `
      INSERT INTO workspace_settings (id, workspace_id, data)
      VALUES ($1, $2, $3)
    `,
    [demoSettingsId, demoWorkspaceId, {
      notifications: true,
      soundAlerts: true,
      autoSave: true,
      language: 'en',
      prescriptionLang: 'bilingual',
      theme: 'light',
      compactMode: false,
      clinicOverrides: {},
      managedClinics: [],
    }]
  );

  await query(
    `
      INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9),
        ($10, $2, $11, $12, $13, $14, $15, $16, $17)
    `,
    [
      demoClinic1Id,
      demoWorkspaceId,
      'Demo Medical Center',
      'Johar Town',
      'Lahore',
      '042-35431200',
      '9:00 AM - 2:00 PM',
      JSON.stringify(['General Medicine', 'Cardiology', 'Dermatology']),
      '🏥',
      demoClinic2Id,
      'Demo Family Clinic',
      'Gulberg III',
      'Lahore',
      '042-35762100',
      '4:00 PM - 9:00 PM',
      JSON.stringify(['Family Medicine', 'Pediatrics']),
      '🏨',
    ]
  );

  const patients = [
    {
      id: demoPatient1Id,
      mrn: 'MRN-DEMO-001',
      name: 'Muhammad Asif Ali',
      phone: '0300-1234567',
      age: 45,
      gender: 'Male',
      cnic: '35201-1234567-1',
      address: 'Johar Town, Lahore',
      bloodGroup: 'B+',
      emergencyContact: '0301-9876543',
    },
    {
      id: demoPatient2Id,
      mrn: 'MRN-DEMO-002',
      name: 'Fatima Bibi',
      phone: '0321-2345678',
      age: 32,
      gender: 'Female',
      cnic: '35202-2345678-2',
      address: 'Model Town, Lahore',
      bloodGroup: 'A+',
      emergencyContact: '0322-8765432',
    },
    {
      id: demoPatient3Id,
      mrn: 'MRN-DEMO-003',
      name: 'Imran Hussain',
      phone: '0333-3456789',
      age: 58,
      gender: 'Male',
      cnic: '35203-3456789-3',
      address: 'Garden Town, Lahore',
      bloodGroup: 'O+',
      emergencyContact: '0334-7654321',
    },
    {
      id: demoPatient4Id,
      mrn: 'MRN-DEMO-004',
      name: 'Ayesha Siddiqui',
      phone: '0345-4567890',
      age: 28,
      gender: 'Female',
      cnic: '35204-4567890-4',
      address: 'Cantt, Lahore',
      bloodGroup: 'AB+',
      emergencyContact: '0346-6543210',
    },
    {
      id: demoPatient5Id,
      mrn: 'MRN-DEMO-005',
      name: 'Rizwan Ahmed',
      phone: '0312-5678901',
      age: 67,
      gender: 'Male',
      cnic: '35205-5678901-5',
      address: 'Gulberg II, Lahore',
      bloodGroup: 'A-',
      emergencyContact: '0313-5432109',
    },
  ];

  for (const patient of patients) {
    await query(
      `
        INSERT INTO patients (
          id, workspace_id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        patient.id,
        demoWorkspaceId,
        patient.mrn,
        patient.name,
        patient.phone,
        patient.age,
        patient.gender,
        patient.cnic,
        patient.address,
        patient.bloodGroup,
        patient.emergencyContact,
      ]
    );
  }

  const appointments = [
    [createId('appointment'), demoClinic1Id, demoPatient1Id, '09:15', 'completed', 'follow-up', 'Diabetes follow-up', 1],
    [createId('appointment'), demoClinic1Id, demoPatient2Id, '09:30', 'completed', 'new', 'Chronic headache', 2],
    [createId('appointment'), demoClinic1Id, demoPatient3Id, '09:45', 'in-consultation', 'new', 'Chest pain and shortness of breath', 3],
    [createId('appointment'), demoClinic1Id, demoPatient4Id, '10:00', 'waiting', 'follow-up', 'Hypertension review', 4],
    [createId('appointment'), demoClinic1Id, demoPatient5Id, '10:15', 'scheduled', 'new', 'Joint pain and stiffness', 5],
    [createId('appointment'), demoClinic2Id, demoPatient2Id, '16:00', 'waiting', 'follow-up', 'Gastritis review', 1],
  ];

  for (const [id, clinicId, patientId, time, status, type, chiefComplaint, tokenNumber] of appointments) {
    await query(
      `
        INSERT INTO appointments (
          id, workspace_id, clinic_id, patient_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [id, demoWorkspaceId, clinicId, patientId, demoUserId, today, time, status, type, chiefComplaint, tokenNumber]
    );
  }

  const demoDx1Id = createId('diagnosis');
  const demoDx2Id = createId('diagnosis');
  const notes = [
    {
      id: createId('clinical_note'),
      patientId: demoPatient1Id,
      clinicId: demoClinic1Id,
      chiefComplaint: 'Diabetes follow-up',
      pastHistory: 'Known case of diabetes mellitus and hypertension',
      allergies: 'NKDA',
      assessment: 'Type 2 diabetes mellitus with fair control',
      plan: 'Continue current medications and review HbA1c next visit',
      instructions: 'Medication compliance explained',
      followUp: 'Follow up in 2 weeks',
      diagnoses: [{ id: demoDx1Id, code: 'E11', name: 'Type 2 diabetes mellitus', isPrimary: true }],
      medications: [{
        id: createId('medication'),
        name: 'Metformin',
        nameUrdu: '',
        generic: 'Metformin',
        strength: '500 mg',
        form: 'Tablet',
        route: 'Oral',
        frequency: '1 tablet twice daily',
        frequencyUrdu: '',
        duration: '14 days',
        durationUrdu: '',
        instructions: 'After meals',
        instructionsUrdu: '',
        diagnosisId: demoDx1Id,
      }],
    },
    {
      id: createId('clinical_note'),
      patientId: demoPatient2Id,
      clinicId: demoClinic1Id,
      chiefComplaint: 'Chronic headache',
      pastHistory: 'No significant comorbidity',
      allergies: 'NKDA',
      assessment: 'Tension type headache',
      plan: 'Symptomatic treatment and hydration advice',
      instructions: 'Return if worsening symptoms',
      followUp: 'PRN review',
      diagnoses: [{ id: demoDx2Id, code: 'G44.2', name: 'Tension headache', isPrimary: true }],
      medications: [{
        id: createId('medication'),
        name: 'Paracetamol',
        nameUrdu: '',
        generic: 'Acetaminophen',
        strength: '500 mg',
        form: 'Tablet',
        route: 'Oral',
        frequency: '1 tablet three times daily',
        frequencyUrdu: '',
        duration: '5 days',
        durationUrdu: '',
        instructions: 'After food if needed',
        instructionsUrdu: '',
        diagnosisId: demoDx2Id,
      }],
    },
  ];

  for (const note of notes) {
    await query(
      `
        INSERT INTO clinical_notes (
          id, workspace_id, patient_id, clinic_id, doctor_user_id, date,
          chief_complaint, hpi, past_history, allergies, examination, assessment,
          plan, instructions, follow_up, vitals, status
        )
        VALUES (
          $1, $2, $3, $4, $5, NOW(),
          $6, '', $7, $8, '', $9, $10, $11, $12,
          $13, 'completed'
        )
      `,
      [
        note.id,
        demoWorkspaceId,
        note.patientId,
        note.clinicId,
        demoUserId,
        note.chiefComplaint,
        note.pastHistory,
        note.allergies,
        note.assessment,
        note.plan,
        note.instructions,
        note.followUp,
        consultationPayload({
          patientId: note.patientId,
          clinicId: note.clinicId,
          chiefComplaint: note.chiefComplaint,
          pastHistory: note.pastHistory,
          allergies: note.allergies,
          assessment: note.assessment,
          plan: note.plan,
          instructions: note.instructions,
          followUp: note.followUp,
        }).vitals,
      ]
    );

    for (const diagnosis of note.diagnoses) {
      await query(
        `
          INSERT INTO diagnoses (id, note_id, code, name, is_primary)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [diagnosis.id, note.id, diagnosis.code, diagnosis.name, diagnosis.isPrimary]
      );
    }

    for (const medication of note.medications) {
      await query(
        `
          INSERT INTO medications (
            id, note_id, name, name_urdu, generic_name, strength, form, route,
            frequency, frequency_urdu, duration, duration_urdu, instructions, instructions_urdu, diagnosis_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `,
        [
          medication.id,
          note.id,
          medication.name,
          medication.nameUrdu,
          medication.generic,
          medication.strength,
          medication.form,
          medication.route,
          medication.frequency,
          medication.frequencyUrdu,
          medication.duration,
          medication.durationUrdu,
          medication.instructions,
          medication.instructionsUrdu,
          medication.diagnosisId,
        ]
      );
    }
  }

  await query(
    `
      INSERT INTO consultation_drafts (id, patient_id, workspace_id, clinic_id, doctor_user_id, payload, saved_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
    [
      createId('consultation_draft'),
      demoPatient4Id,
      demoWorkspaceId,
      demoClinic1Id,
      demoUserId,
      consultationPayload({
        patientId: demoPatient4Id,
        clinicId: demoClinic1Id,
        chiefComplaint: 'Hypertension review',
        pastHistory: 'Known case of hypertension',
        allergies: 'NKDA',
        assessment: 'Blood pressure not at goal',
        plan: 'Adjust antihypertensive medication',
        instructions: 'Low salt diet advised',
        followUp: 'Follow up in 1 week',
      }),
    ]
  );
}
