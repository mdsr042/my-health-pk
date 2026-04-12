const baseUrl = String(process.env.SMOKE_BASE_URL || process.env.APP_URL || '').replace(/\/$/, '');
const doctorEmail = String(process.env.SMOKE_DOCTOR_EMAIL || '').trim();
const doctorPassword = String(process.env.SMOKE_DOCTOR_PASSWORD || '').trim();
const clinicIdOverride = String(process.env.SMOKE_CLINIC_ID || '').trim();

if (!baseUrl || !doctorEmail || !doctorPassword) {
  console.error(
    'Missing required env. Set SMOKE_BASE_URL, SMOKE_DOCTOR_EMAIL, and SMOKE_DOCTOR_PASSWORD before running the smoke flow.'
  );
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${method} ${path}: ${payload.error || text || 'Unknown error'}`);
  }

  return payload;
}

function logStep(step, details = '') {
  process.stdout.write(`${step}${details ? `: ${details}` : ''}\n`);
}

function createCoreMedication(nowIso) {
  return {
    id: `med-smoke-${Date.now()}`,
    name: 'Paracetamol 500mg',
    nameUrdu: 'پیراسیٹامول ۵۰۰ ملی گرام',
    generic: 'Paracetamol',
    strength: '500mg',
    form: 'Tablet',
    route: 'Oral',
    dosePattern: '1+1+1',
    frequency: 'one tablet in morning, one in noon, and one in evening',
    frequencyUrdu: 'صبح 1 گولی، دوپہر 1 گولی، شام 1 گولی',
    duration: '5 days',
    durationUrdu: '۵ دن',
    instructions: 'Take after meals',
    instructionsUrdu: 'کھانے کے بعد لیں',
    diagnosisId: `dx-smoke-${nowIso}`,
  };
}

async function main() {
  const now = new Date();
  const marker = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const smokePhone = `0399${marker.slice(-7)}`;
  const smokeCnic = `${marker.slice(0, 5)}-${marker.slice(5, 12)}-${marker.slice(12, 13) || '1'}`;
  const smokeName = `Smoke Patient ${marker}`;

  logStep('1. Checking health');
  const health = await request('/api/health');
  assert(health.ok === true, 'Health endpoint did not return ok=true');

  logStep('2. Logging in as smoke doctor');
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: doctorEmail, password: doctorPassword },
  });
  assert(login.token, 'Login did not return a token');
  const token = login.token;

  logStep('3. Loading session');
  const me = await request('/api/auth/me', { token });
  const session = me.data;
  assert(session?.user?.role === 'doctor_owner', 'Smoke account is not a doctor_owner');
  const clinicId = clinicIdOverride || session?.clinics?.[0]?.id;
  assert(clinicId, 'No clinic available for smoke flow');

  logStep('4. Creating patient');
  const createPatient = await request('/api/patients', {
    method: 'POST',
    token,
    body: {
      name: smokeName,
      phone: smokePhone,
      age: 39,
      gender: 'Male',
      cnic: smokeCnic,
      address: 'Smoke Flow Street, Lahore',
      bloodGroup: 'B+',
      emergencyContact: smokePhone,
    },
  });
  const patient = createPatient.data;
  assert(patient?.id, 'Patient creation failed');

  logStep('5. Verifying patient lookup');
  const searchByPhone = await request(`/api/patients/search?q=${encodeURIComponent(smokePhone)}`, { token });
  assert(searchByPhone.data.some(item => item.id === patient.id), 'Patient search by phone failed');
  const searchByCnic = await request(`/api/patients/search?q=${encodeURIComponent(smokeCnic)}`, { token });
  assert(searchByCnic.data.some(item => item.id === patient.id), 'Patient search by CNIC failed');

  logStep('6. Reusing patient through walk-in flow');
  const walkIn = await request('/api/walk-ins', {
    method: 'POST',
    token,
    body: {
      clinicId,
      patientId: patient.id,
      name: smokeName,
      phone: smokePhone,
      age: 39,
      gender: 'Male',
      cnic: smokeCnic,
      address: 'Smoke Flow Street, Lahore',
      bloodGroup: 'B+',
      emergencyContact: smokePhone,
      chiefComplaint: 'Smoke consultation follow-up',
      date: today,
      time: '10:15',
    },
  });
  assert(walkIn.data?.reusedPatient === true, 'Walk-in did not reuse the selected patient');
  const walkInAppointment = walkIn.data.appointment;

  logStep('7. Moving patient into consultation queue');
  await request(`/api/appointments/${encodeURIComponent(walkInAppointment.id)}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'in-consultation' },
  });

  const diagnosis = {
    id: `dx-smoke-${marker}`,
    code: 'R50.9',
    name: 'Fever, unspecified',
    isPrimary: true,
  };
  const medication = createCoreMedication(marker);
  const draftPayload = {
    appointmentId: walkInAppointment.id,
    patientId: patient.id,
    clinicId,
    chiefComplaint: 'Smoke consultation follow-up',
    hpi: 'Symptoms improved after prior medication.',
    pastHistory: 'Known follow-up patient.',
    allergies: 'NKDA',
    examination: 'Clinically stable.',
    assessment: 'Improving viral syndrome.',
    plan: 'Continue supportive care.',
    instructions: 'Increase fluids.',
    followUp: 'Review in 5 days if needed.',
    vitals: {
      bp: '120/80',
      pulse: '78',
      temp: '98.6',
      spo2: '98',
      weight: '70',
      height: '170',
      bmi: '24.2',
      respiratoryRate: '18',
    },
    diagnoses: [diagnosis],
    medications: [medication],
    labOrders: [],
    savedAt: new Date().toISOString(),
  };

  logStep('8. Saving consultation draft');
  await request(`/api/consultation-drafts/${encodeURIComponent(walkInAppointment.id)}`, {
    method: 'PUT',
    token,
    body: draftPayload,
  });
  const drafts = await request('/api/consultation-drafts', { token });
  assert(drafts.data[walkInAppointment.id], 'Draft was not persisted');

  logStep('9. Completing consultation and prescription');
  const completed = await request('/api/consultations/complete', {
    method: 'POST',
    token,
    body: draftPayload,
  });
  assert(completed.data?.appointmentId === walkInAppointment.id, 'Consultation did not complete the expected appointment');
  assert((completed.data?.medications || []).length === 1, 'Prescription payload missing from completed consultation');

  logStep('10. Verifying records history');
  const notes = await request(`/api/clinical-notes?patientId=${encodeURIComponent(patient.id)}`, { token });
  const latestNote = notes.data.find(item => item.appointmentId === walkInAppointment.id);
  assert(latestNote, 'Completed note was not visible in patient records');
  assert((latestNote.medications || []).some(item => item.name === medication.name), 'Medication not present in patient records');

  logStep('11. Booking next appointment');
  const nextAppointment = await request('/api/appointments', {
    method: 'POST',
    token,
    body: {
      patientId: patient.id,
      clinicId,
      date: tomorrow,
      time: '09:30',
      status: 'scheduled',
      type: 'follow-up',
      chiefComplaint: 'Smoke follow-up booking',
      tokenNumber: 0,
    },
  });
  assert(nextAppointment.data?.patientId === patient.id, 'Next appointment was not created for the same patient');

  logStep('12. Confirming account usability');
  const meAgain = await request('/api/auth/me', { token });
  assert(meAgain.data?.user?.id === session.user.id, 'Authenticated session became unusable during smoke flow');

  logStep('Smoke flow passed', `${patient.id} / ${walkInAppointment.id}`);
}

main().catch(error => {
  console.error(`Smoke flow failed: ${error.message}`);
  process.exit(1);
});
