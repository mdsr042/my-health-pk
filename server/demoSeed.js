import bcrypt from 'bcryptjs';
import { createId } from './id.js';

const DEMO_TTL_HOURS = Number(process.env.DEMO_TTL_HOURS || 24);

function getDateKey(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDraftPayload({
  appointmentId = '',
  patientId,
  clinicId,
  chiefComplaint,
  hpi,
  pastHistory,
  allergies,
  examination,
  assessment,
  plan,
  instructions,
  followUp,
  diagnoses = [],
  medications = [],
  labOrders = [],
  vitals = {},
}) {
  return {
    appointmentId,
    patientId,
    clinicId,
    chiefComplaint,
    hpi,
    pastHistory,
    allergies,
    examination,
    assessment,
    plan,
    instructions,
    followUp,
    vitals: {
      bp: '128/82',
      pulse: '78',
      temp: '98.4',
      spo2: '98',
      weight: '74',
      height: '170',
      bmi: '25.6',
      respiratoryRate: '18',
      ...vitals,
    },
    diagnoses,
    medications,
    labOrders,
    savedAt: new Date().toISOString(),
  };
}

function createDemoTemplate() {
  const clinic1Id = createId('clinic');
  const clinic2Id = createId('clinic');
  const clinic3Id = createId('clinic');

  const patient1Id = createId('patient');
  const patient2Id = createId('patient');
  const patient3Id = createId('patient');
  const patient4Id = createId('patient');
  const patient5Id = createId('patient');
  const patient6Id = createId('patient');
  const patient7Id = createId('patient');
  const patient8Id = createId('patient');

  const diagnosis1Id = createId('diagnosis');
  const diagnosis2Id = createId('diagnosis');
  const diagnosis3Id = createId('diagnosis');
  const diagnosis4Id = createId('diagnosis');
  const diagnosis5Id = createId('diagnosis');

  const today = getDateKey(0);
  const yesterday = getDateKey(-1);
  const twoDaysAgo = getDateKey(-2);
  const fourDaysAgo = getDateKey(-4);
  const eightDaysAgo = getDateKey(-8);
  const startOfMonth = getDateKey(-12);

  const clinics = [
    {
      id: clinic1Id,
      name: 'Demo Medical Center',
      location: 'Johar Town',
      city: 'Lahore',
      phone: '042-35431200',
      timings: '9:00 AM - 2:00 PM',
      specialties: ['General Medicine', 'Cardiology', 'Dermatology'],
      logo: '🏥',
    },
    {
      id: clinic2Id,
      name: 'Demo Family Clinic',
      location: 'Gulberg III',
      city: 'Lahore',
      phone: '042-35762100',
      timings: '4:00 PM - 9:00 PM',
      specialties: ['Family Medicine', 'Pediatrics'],
      logo: '🏨',
    },
    {
      id: clinic3Id,
      name: 'Demo Diagnostics Point',
      location: 'DHA Phase 4',
      city: 'Lahore',
      phone: '042-37111122',
      timings: '10:00 AM - 6:00 PM',
      specialties: ['Endocrinology', 'Diagnostics'],
      logo: '🩺',
    },
  ];

  const patients = [
    {
      id: patient1Id,
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
      id: patient2Id,
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
      id: patient3Id,
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
      id: patient4Id,
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
      id: patient5Id,
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
    {
      id: patient6Id,
      mrn: 'MRN-DEMO-006',
      name: 'Maryam Khalid',
      phone: '0308-1122334',
      age: 14,
      gender: 'Female',
      cnic: '',
      address: 'Bahria Town, Lahore',
      bloodGroup: 'O-',
      emergencyContact: '0308-9988776',
    },
    {
      id: patient7Id,
      mrn: 'MRN-DEMO-007',
      name: 'Saeed Iqbal',
      phone: '0320-9988776',
      age: 51,
      gender: 'Male',
      cnic: '35206-2233445-6',
      address: 'Wapda Town, Lahore',
      bloodGroup: 'B-',
      emergencyContact: '0321-5566778',
    },
    {
      id: patient8Id,
      mrn: 'MRN-DEMO-008',
      name: 'Hina Tariq',
      phone: '0336-4455667',
      age: 39,
      gender: 'Female',
      cnic: '35207-3344556-7',
      address: 'Askari, Lahore',
      bloodGroup: 'A+',
      emergencyContact: '0335-2233445',
    },
  ];

  const appointments = [
    [createId('appointment'), clinic1Id, patient1Id, today, '09:15', 'completed', 'follow-up', 'Diabetes follow-up', 1],
    [createId('appointment'), clinic1Id, patient2Id, today, '09:30', 'completed', 'new', 'Chronic headache', 2],
    [createId('appointment'), clinic1Id, patient3Id, today, '09:45', 'in-consultation', 'new', 'Chest pain and shortness of breath', 3],
    [createId('appointment'), clinic1Id, patient4Id, today, '10:00', 'waiting', 'follow-up', 'Hypertension review', 4],
    [createId('appointment'), clinic1Id, patient5Id, today, '10:15', 'scheduled', 'new', 'Joint pain and stiffness', 5],
    [createId('appointment'), clinic2Id, patient6Id, today, '04:00 PM', 'waiting', 'follow-up', 'Fever and sore throat', 1],
    [createId('appointment'), clinic2Id, patient7Id, today, '04:30 PM', 'cancelled', 'follow-up', 'Routine BP check', 2],
    [createId('appointment'), clinic3Id, patient8Id, today, '11:20', 'no-show', 'new', 'Thyroid review', 1],
    [createId('appointment'), clinic1Id, patient4Id, yesterday, '09:40', 'completed', 'follow-up', 'Hypertension review', 1],
    [createId('appointment'), clinic2Id, patient6Id, twoDaysAgo, '05:10 PM', 'completed', 'new', 'Upper respiratory infection', 1],
    [createId('appointment'), clinic3Id, patient8Id, fourDaysAgo, '11:10', 'completed', 'follow-up', 'Hypothyroidism management', 1],
    [createId('appointment'), clinic1Id, patient5Id, eightDaysAgo, '10:05', 'completed', 'follow-up', 'Knee osteoarthritis', 1],
    [createId('appointment'), clinic1Id, patient1Id, startOfMonth, '09:00', 'completed', 'follow-up', 'Monthly diabetes review', 1],
  ];

  const notes = [
    {
      id: createId('clinical_note'),
      appointmentId: appointments[0][0],
      patientId: patient1Id,
      clinicId: clinic1Id,
      date: today,
      chiefComplaint: 'Diabetes follow-up',
      hpi: 'Home glucose readings remain between 150-180 mg/dL despite compliance.',
      pastHistory: 'Type 2 diabetes mellitus and hypertension for 6 years',
      allergies: 'NKDA',
      examination: 'Patient comfortable. No pedal edema. Chest clear.',
      assessment: 'Type 2 diabetes mellitus with fair control',
      plan: 'Increase Metformin dose and continue lifestyle changes',
      instructions: 'Take medicine after meals and monitor fasting glucose',
      followUp: 'Review in 2 weeks with sugar chart',
      vitals: { bp: '132/84', pulse: '80', spo2: '98', weight: '84', temp: '98.5' },
      diagnoses: [
        { id: diagnosis1Id, code: 'E11', name: 'Type 2 diabetes mellitus', isPrimary: true },
      ],
      medications: [
        {
          id: createId('medication'),
          name: 'Metformin',
          nameUrdu: '',
          generic: 'Metformin',
          strength: '850 mg',
          form: 'Tablet',
          route: 'Oral',
          frequency: '1 tablet twice daily',
          frequencyUrdu: '',
          duration: '14 days',
          durationUrdu: '',
          instructions: 'After meals',
          instructionsUrdu: '',
          diagnosisId: diagnosis1Id,
        },
      ],
      labOrders: [
        {
          id: createId('lab_order'),
          testName: 'HbA1c',
          category: 'Chemistry',
          priority: 'routine',
          status: 'ordered',
          result: '',
          date: today,
        },
      ],
    },
    {
      id: createId('clinical_note'),
      appointmentId: appointments[1][0],
      patientId: patient2Id,
      clinicId: clinic1Id,
      date: today,
      chiefComplaint: 'Chronic headache',
      hpi: 'Headache worse by the end of work day, no red flag symptoms.',
      pastHistory: 'No significant chronic illness',
      allergies: 'NKDA',
      examination: 'Neuro exam grossly intact. Neck mildly tense.',
      assessment: 'Tension type headache',
      plan: 'Symptomatic treatment and hydration advice',
      instructions: 'Return if vomiting, weakness, or visual changes develop',
      followUp: 'PRN review',
      vitals: { bp: '118/76', pulse: '74', spo2: '99', temp: '98.2' },
      diagnoses: [
        { id: diagnosis2Id, code: 'G44.2', name: 'Tension headache', isPrimary: true },
      ],
      medications: [
        {
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
          diagnosisId: diagnosis2Id,
        },
      ],
      labOrders: [],
    },
    {
      id: createId('clinical_note'),
      appointmentId: appointments[8][0],
      patientId: patient4Id,
      clinicId: clinic1Id,
      date: yesterday,
      chiefComplaint: 'Hypertension review',
      hpi: 'Missed medication for 3 days last week.',
      pastHistory: 'Known hypertension',
      allergies: 'NKDA',
      examination: 'No distress. CVS S1 S2 normal.',
      assessment: 'Essential hypertension not at goal',
      plan: 'Resume regular medication and reduce salt intake',
      instructions: 'Check BP at home for next 7 days',
      followUp: 'Follow up in 1 week',
      vitals: { bp: '150/94', pulse: '86', spo2: '97', temp: '98.4' },
      diagnoses: [
        { id: diagnosis3Id, code: 'I10', name: 'Essential hypertension', isPrimary: true },
      ],
      medications: [
        {
          id: createId('medication'),
          name: 'Amlodipine',
          nameUrdu: '',
          generic: 'Amlodipine',
          strength: '5 mg',
          form: 'Tablet',
          route: 'Oral',
          frequency: '1 tablet once daily',
          frequencyUrdu: '',
          duration: '30 days',
          durationUrdu: '',
          instructions: 'Take at the same time daily',
          instructionsUrdu: '',
          diagnosisId: diagnosis3Id,
        },
      ],
      labOrders: [],
    },
    {
      id: createId('clinical_note'),
      appointmentId: appointments[9][0],
      patientId: patient6Id,
      clinicId: clinic2Id,
      date: twoDaysAgo,
      chiefComplaint: 'Fever and sore throat',
      hpi: 'Fever for 2 days with painful swallowing.',
      pastHistory: 'No chronic illness',
      allergies: 'Penicillin allergy',
      examination: 'Tonsils enlarged with erythema.',
      assessment: 'Acute pharyngitis',
      plan: 'Supportive treatment and antibiotics considering allergy history',
      instructions: 'Increase fluids and use warm saline gargles',
      followUp: 'Review if fever persists',
      vitals: { bp: '108/68', pulse: '96', spo2: '99', temp: '100.4' },
      diagnoses: [
        { id: diagnosis4Id, code: 'J02.9', name: 'Acute pharyngitis', isPrimary: true },
      ],
      medications: [
        {
          id: createId('medication'),
          name: 'Azithromycin',
          nameUrdu: '',
          generic: 'Azithromycin',
          strength: '500 mg',
          form: 'Tablet',
          route: 'Oral',
          frequency: '1 tablet once daily',
          frequencyUrdu: '',
          duration: '3 days',
          durationUrdu: '',
          instructions: 'Take 1 hour before meals',
          instructionsUrdu: '',
          diagnosisId: diagnosis4Id,
        },
      ],
      labOrders: [
        {
          id: createId('lab_order'),
          testName: 'CBC',
          category: 'Hematology',
          priority: 'routine',
          status: 'resulted',
          result: 'Mild leukocytosis',
          date: twoDaysAgo,
        },
      ],
    },
    {
      id: createId('clinical_note'),
      appointmentId: appointments[10][0],
      patientId: patient8Id,
      clinicId: clinic3Id,
      date: fourDaysAgo,
      chiefComplaint: 'Hypothyroidism follow-up',
      hpi: 'Energy improved, weight stable.',
      pastHistory: 'Known hypothyroidism',
      allergies: 'NKDA',
      examination: 'No thyromegaly. Clinically stable.',
      assessment: 'Primary hypothyroidism on treatment',
      plan: 'Continue current dose and repeat TSH after 6 weeks',
      instructions: 'Take medicine on empty stomach',
      followUp: 'Review with TSH report',
      vitals: { bp: '116/72', pulse: '72', spo2: '99', temp: '98.1' },
      diagnoses: [
        { id: diagnosis5Id, code: 'E03.9', name: 'Hypothyroidism', isPrimary: true },
      ],
      medications: [
        {
          id: createId('medication'),
          name: 'Levothyroxine',
          nameUrdu: '',
          generic: 'Levothyroxine',
          strength: '50 mcg',
          form: 'Tablet',
          route: 'Oral',
          frequency: '1 tablet once daily',
          frequencyUrdu: '',
          duration: '42 days',
          durationUrdu: '',
          instructions: 'Before breakfast',
          instructionsUrdu: '',
          diagnosisId: diagnosis5Id,
        },
      ],
      labOrders: [
        {
          id: createId('lab_order'),
          testName: 'TSH',
          category: 'Endocrinology',
          priority: 'routine',
          status: 'ordered',
          result: '',
          date: fourDaysAgo,
        },
      ],
    },
  ];

  const draftDiagnoses = [
    { id: createId('diagnosis'), code: 'M17.9', name: 'Knee osteoarthritis', isPrimary: true },
  ];
  const draftMedications = [
    {
      id: createId('medication'),
      name: 'Diclofenac Gel',
      nameUrdu: '',
      generic: 'Diclofenac',
      strength: '1%',
      form: 'Gel',
      route: 'Topical',
      frequency: 'Apply twice daily',
      frequencyUrdu: '',
      duration: '10 days',
      durationUrdu: '',
      instructions: 'Apply over both knees',
      instructionsUrdu: '',
      diagnosisId: draftDiagnoses[0].id,
    },
  ];
  const draftLabOrders = [
    {
      id: createId('lab_order'),
      testName: 'X-Ray Knee AP/Lateral',
      category: 'Radiology',
      priority: 'routine',
      status: 'ordered',
      result: '',
      date: today,
    },
  ];

  const draft = {
    appointmentId: appointments[4][0],
    patientId: patient5Id,
    clinicId: clinic1Id,
    payload: buildDraftPayload({
      appointmentId: appointments[4][0],
      patientId: patient5Id,
      clinicId: clinic1Id,
      chiefComplaint: 'Joint pain and stiffness',
      hpi: 'Pain in both knees worse in morning and after walking.',
      pastHistory: 'Known osteoarthritis',
      allergies: 'NKDA',
      examination: 'Crepitus present in both knees',
      assessment: 'Probable worsening knee osteoarthritis',
      plan: 'Pain control, knee x-ray, and exercise counselling',
      instructions: 'Avoid prolonged stair climbing and start quadriceps exercises',
      followUp: 'Review after imaging',
      diagnoses: draftDiagnoses,
      medications: draftMedications,
      labOrders: draftLabOrders,
      vitals: { bp: '138/86', pulse: '82', spo2: '97', temp: '98.3' },
    }),
  };

  const settings = {
    notifications: true,
    soundAlerts: true,
    autoSave: true,
    language: 'en',
    prescriptionLang: 'bilingual',
    theme: 'light',
    compactMode: false,
    sidebarCollapsed: true,
    clinicOverrides: {},
    managedClinics: [],
  };

  return {
    clinics,
    patients,
    appointments,
    notes,
    draft,
    settings,
  };
}

async function insertDemoWorkspaceData(client, userId, workspaceId, doctorProfileId, workspaceMemberId, subscriptionId, settingsId, template, workspaceName, demoEmail) {
  await client.query(
    `
      INSERT INTO users (id, email, password_hash, role, status, is_demo)
      VALUES ($1, $2, $3, 'doctor_owner', 'active', TRUE)
    `,
    [userId, demoEmail, await bcrypt.hash(createId('user'), 10)]
  );

  await client.query(
    `
      INSERT INTO doctor_profiles (id, user_id, full_name, phone, pmc_number, specialization, qualifications, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      doctorProfileId,
      userId,
      'Dr. Demo User',
      '0300-0000000',
      'PMC-DEMO-001',
      'Internal Medicine',
      'MBBS, FCPS (Medicine)',
      'Ephemeral demo doctor account generated for Try Demo',
    ]
  );

  await client.query(
    `
      INSERT INTO workspaces (id, owner_user_id, name, city, status, is_demo, demo_expires_at)
      VALUES ($1, $2, $3, $4, 'active', TRUE, NOW() + ($5 || ' hour')::INTERVAL)
    `,
    [workspaceId, userId, workspaceName, 'Lahore', String(DEMO_TTL_HOURS)]
  );

  await client.query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES ($1, $2, $3, 'owner')
    `,
    [workspaceMemberId, workspaceId, userId]
  );

  await client.query(
    `
      INSERT INTO subscriptions (id, workspace_id, plan_name, status, trial_ends_at)
      VALUES ($1, $2, 'Demo', 'active', NULL)
    `,
    [subscriptionId, workspaceId]
  );

  await client.query(
    `
      INSERT INTO workspace_settings (id, workspace_id, data)
      VALUES ($1, $2, $3)
    `,
    [settingsId, workspaceId, template.settings]
  );

  for (const clinic of template.clinics) {
    await client.query(
      `
        INSERT INTO clinics (id, workspace_id, name, location, city, phone, timings, specialties, logo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        clinic.id,
        workspaceId,
        clinic.name,
        clinic.location,
        clinic.city,
        clinic.phone,
        clinic.timings,
        JSON.stringify(clinic.specialties),
        clinic.logo,
      ]
    );
  }

  for (const patient of template.patients) {
    await client.query(
      `
        INSERT INTO patients (
          id, workspace_id, mrn, name, phone, age, gender, cnic, address, blood_group, emergency_contact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        patient.id,
        workspaceId,
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

  for (const appointment of template.appointments) {
    await client.query(
      `
        INSERT INTO appointments (
          id, workspace_id, clinic_id, patient_id, doctor_user_id, date, time, status, type, chief_complaint, token_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        appointment[0],
        workspaceId,
        appointment[1],
        appointment[2],
        userId,
        appointment[3],
        appointment[4],
        appointment[5],
        appointment[6],
        appointment[7],
        appointment[8],
      ]
    );
  }

  for (const note of template.notes) {
    await client.query(
      `
        INSERT INTO clinical_notes (
          id, appointment_id, workspace_id, patient_id, clinic_id, doctor_user_id, date,
          chief_complaint, hpi, past_history, allergies, examination, assessment,
          plan, instructions, follow_up, vitals, status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::timestamptz,
          $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'completed'
        )
      `,
      [
        note.id,
        note.appointmentId || null,
        workspaceId,
        note.patientId,
        note.clinicId,
        userId,
        `${note.date}T09:00:00Z`,
        note.chiefComplaint,
        note.hpi,
        note.pastHistory,
        note.allergies,
        note.examination,
        note.assessment,
        note.plan,
        note.instructions,
        note.followUp,
        note.vitals,
      ]
    );

    for (const diagnosis of note.diagnoses) {
      await client.query(
        `
          INSERT INTO diagnoses (id, note_id, code, name, is_primary)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [diagnosis.id, note.id, diagnosis.code, diagnosis.name, diagnosis.isPrimary]
      );
    }

    for (const medication of note.medications) {
      await client.query(
        `
          INSERT INTO medications (
            id, note_id, name, name_urdu, generic_name, strength, form, route, dose_pattern,
            frequency, frequency_urdu, duration, duration_urdu, instructions, instructions_urdu, diagnosis_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          medication.dosePattern || '',
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

    for (const order of note.labOrders) {
      await client.query(
        `
          INSERT INTO lab_orders (id, note_id, test_name, category, priority, status, result, date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [order.id, note.id, order.testName, order.category, order.priority, order.status, order.result, order.date]
      );
    }
  }

  await client.query(
    `
      INSERT INTO consultation_drafts (id, appointment_id, patient_id, workspace_id, clinic_id, doctor_user_id, payload, saved_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `,
    [
      createId('consultation_draft'),
      template.draft.appointmentId,
      template.draft.patientId,
      workspaceId,
      template.draft.clinicId,
      userId,
      template.draft.payload,
    ]
  );
}

export async function cleanupExpiredDemoSessions({ query }) {
  await query(`
    DELETE FROM users u
    USING workspaces w
    WHERE u.id = w.owner_user_id
      AND u.is_demo = TRUE
      AND w.is_demo = TRUE
      AND (w.demo_expires_at IS NULL OR w.demo_expires_at <= NOW())
  `);

  await query(`
    DELETE FROM users u
    WHERE u.is_demo = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM workspaces w
        WHERE w.owner_user_id = u.id
      )
  `);
}

export async function createEphemeralDemoSession(client) {
  const template = createDemoTemplate();
  const userId = createId('user');
  const doctorProfileId = createId('doctor_profile');
  const workspaceId = createId('workspace');
  const workspaceMemberId = createId('workspace_member');
  const subscriptionId = createId('subscription');
  const settingsId = createId('workspace_setting');
  const demoEmail = `demo+${userId}@myhealth.pk`;
  const workspaceName = 'My Health Demo Practice';

  await insertDemoWorkspaceData(
    client,
    userId,
    workspaceId,
    doctorProfileId,
    workspaceMemberId,
    subscriptionId,
    settingsId,
    template,
    workspaceName,
    demoEmail
  );

  return { userId };
}
