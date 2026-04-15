import { describe, expect, it, vi } from 'vitest';
import {
  completeConsultationEncounter,
  createAppointmentForWorkspace,
  createWalkInEncounter,
  saveConsultationDraftForEncounter,
} from '../../server/workflows.js';

function createClient(responses: Array<{ rowCount?: number; rows?: any[] }>) {
  const query = vi.fn();
  for (const response of responses) {
    query.mockResolvedValueOnce({
      rowCount: response.rowCount ?? response.rows?.length ?? 0,
      rows: response.rows ?? [],
    });
  }
  return { query };
}

describe('server encounter workflows', () => {
  it('completes only the targeted appointment', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'apt_1', patient_id: 'pt_1', clinic_id: 'cl_1', status: 'waiting' }] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);

    await completeConsultationEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      payload: {
        appointmentId: 'apt_1',
        patientId: 'pt_1',
        clinicId: 'cl_1',
        chiefComplaint: 'Fever',
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
      },
    });

    const updateCall = client.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE appointments"));
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toEqual(['apt_1', 'ws_1']);
  });

  it('dedupes medications and lab orders before storing a completed consultation', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'apt_1', patient_id: 'pt_1', clinic_id: 'cl_1', status: 'waiting' }] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
      { rowCount: 1, rows: [] },
    ]);

    await completeConsultationEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      payload: {
        appointmentId: 'apt_1',
        patientId: 'pt_1',
        clinicId: 'cl_1',
        chiefComplaint: 'Fever',
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
        medications: [
          {
            id: 'cat-REG-1',
            name: 'Panadol',
            nameUrdu: '',
            generic: 'Paracetamol',
            strength: '500mg',
            form: 'Tablet',
            route: 'Oral',
            dosePattern: '1+1',
            frequency: 'Morning and night',
            frequencyUrdu: '',
            duration: '5 days',
            durationUrdu: '',
            instructions: 'After meals',
            instructionsUrdu: '',
          },
          {
            id: 'cat-REG-1',
            name: 'Panadol',
            nameUrdu: '',
            generic: 'Paracetamol',
            strength: '500mg',
            form: 'Tablet',
            route: 'Oral',
            dosePattern: '1+1',
            frequency: 'Morning and night',
            frequencyUrdu: '',
            duration: '5 days',
            durationUrdu: '',
            instructions: 'After meals',
            instructionsUrdu: '',
          },
        ],
        labOrders: [
          { id: 'lab-1', testName: 'CBC', category: 'Hematology', priority: 'routine', status: 'ordered', result: '', date: '2026-04-10' },
          { id: 'lab-2', testName: 'CBC', category: 'Hematology', priority: 'routine', status: 'ordered', result: '', date: '2026-04-10' },
        ],
      },
    });

    const medicationInsertCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO medications'));
    const labInsertCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO lab_orders'));
    expect(medicationInsertCalls).toHaveLength(1);
    expect(labInsertCalls).toHaveLength(1);
  });

  it('rejects draft save when appointment patient does not match payload patient', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'apt_1', patient_id: 'pt_other', clinic_id: 'cl_1', status: 'waiting' }] },
    ]);

    await expect(
      saveConsultationDraftForEncounter(client, {
        workspaceId: 'ws_1',
        doctorUserId: 'usr_1',
        appointmentId: 'apt_1',
        payload: {
          appointmentId: 'apt_1',
          patientId: 'pt_1',
          clinicId: 'cl_1',
          chiefComplaint: '',
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
          savedAt: new Date().toISOString(),
        },
      })
    ).rejects.toMatchObject({ code: 'INVALID_PATIENT_REFERENCE' });
  });

  it('rejects appointment creation when patient is outside workspace', async () => {
    const client = createClient([
      { rowCount: 0, rows: [] },
    ]);

    await expect(
      createAppointmentForWorkspace(client, {
        workspaceId: 'ws_1',
        doctorUserId: 'usr_1',
        appointment: {
          id: '',
          patientId: 'pt_1',
          clinicId: 'cl_1',
          doctorId: 'usr_1',
          date: '2026-04-10',
          time: '09:00',
          status: 'scheduled',
          type: 'new',
          chiefComplaint: 'Review',
          tokenNumber: 0,
        },
      })
    ).rejects.toMatchObject({ code: 'INVALID_PATIENT_REFERENCE' });
  });

  it('creates walk-ins with server-generated records and token assignment', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 4 }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_created',
          mrn: 'MRN-12345678',
          name: 'Walk In',
          phone: '0300',
          age: 30,
          gender: 'Male',
          cnic: '',
          address: '',
          blood_group: '',
          emergency_contact: '',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_created',
          patient_id: 'pt_created',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '10:00',
          status: 'waiting',
          type: 'new',
          chief_complaint: 'Walk-in',
          token_number: 4,
        }],
      },
    ]);

    const result = await createWalkInEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        name: 'Walk In',
        phone: '0300',
        age: 30,
        gender: 'Male',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '10:00',
      },
    });

    expect(result.patient.id).toBe('pt_created');
    expect(result.appointment.token_number).toBe(4);
    expect(result.reusedPatient).toBe(false);
  });

  it('creates a new patient when the same CNIC is entered without selecting an existing patient', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 9 }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_created',
          mrn: 'MRN-76543210',
          name: 'Existing Patient',
          phone: '0300',
          age: 30,
          gender: 'Male',
          cnic: '35202-1234567-8',
          address: '',
          blood_group: 'B+',
          emergency_contact: '',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_created',
          patient_id: 'pt_created',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '10:00',
          status: 'waiting',
          type: 'new',
          chief_complaint: 'Walk-in',
          token_number: 9,
        }],
      },
    ]);

    const result = await createWalkInEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        name: 'Existing Patient',
        phone: '0300',
        age: 30,
        gender: 'Male',
        cnic: '35202-1234567-8',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '10:00',
      },
    });

    expect(result.patient.id).toBe('pt_created');
    expect(result.reusedPatient).toBe(false);
    expect(result.matchedBy).toBe(null);
    expect(result.appointment.type).toBe('new');
  });

  it('creates a new patient even if phone and name or name and age match when no patient is explicitly selected', async () => {
    const phoneClient = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 2 }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_created_phone',
          mrn: 'MRN-00000002',
          name: 'Phone Match',
          phone: '03331234567',
          age: 28,
          gender: 'Female',
          cnic: '',
          address: '',
          blood_group: '',
          emergency_contact: '',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_phone',
          patient_id: 'pt_created_phone',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '10:00',
          status: 'waiting',
          type: 'new',
          chief_complaint: 'Walk-in',
          token_number: 2,
        }],
      },
    ]);

    const phoneResult = await createWalkInEncounter(phoneClient, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        name: 'Phone Match',
        phone: '03331234567',
        age: 28,
        gender: 'Female',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '10:00',
      },
    });

    expect(phoneResult.reusedPatient).toBe(false);
    expect(phoneResult.matchedBy).toBe(null);
    expect(phoneResult.appointment.type).toBe('new');

    const nameAgeClient = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 3 }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_created_name_age',
          mrn: 'MRN-00000003',
          name: 'Name Age Match',
          phone: '',
          age: 52,
          gender: 'Male',
          cnic: '',
          address: '',
          blood_group: '',
          emergency_contact: '',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_name_age',
          patient_id: 'pt_created_name_age',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '10:30',
          status: 'waiting',
          type: 'new',
          chief_complaint: 'Walk-in',
          token_number: 3,
        }],
      },
    ]);

    const nameAgeResult = await createWalkInEncounter(nameAgeClient, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        name: 'Name Age Match',
        phone: '',
        age: 52,
        gender: 'Male',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '10:30',
      },
    });

    expect(nameAgeResult.reusedPatient).toBe(false);
    expect(nameAgeResult.matchedBy).toBe(null);
    expect(nameAgeResult.appointment.type).toBe('new');
  });

  it('creates a new patient when the same phone number is used with a different name', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 7 }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_new_phone',
          mrn: 'MRN-00000007',
          name: 'Different Name',
          phone: '03331234567',
          age: 22,
          gender: 'Female',
          cnic: '',
          address: '',
          blood_group: '',
          emergency_contact: '',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_new_phone',
          patient_id: 'pt_new_phone',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '12:00',
          status: 'waiting',
          type: 'new',
          chief_complaint: 'Walk-in',
          token_number: 7,
        }],
      },
    ]);

    const result = await createWalkInEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        name: 'Different Name',
        phone: '03331234567',
        age: 22,
        gender: 'Female',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '12:00',
      },
    });

    expect(result.patient.id).toBe('pt_new_phone');
    expect(result.reusedPatient).toBe(false);
    expect(result.appointment.type).toBe('new');
  });

  it('reuses the explicitly selected patient id for walk-ins', async () => {
    const client = createClient([
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ id: 'cl_1', workspace_id: 'ws_1' }] },
      { rowCount: 1, rows: [{ next_token: 6 }] },
      { rowCount: 1, rows: [{ id: 'pt_selected', workspace_id: 'ws_1' }] },
      {
        rowCount: 1,
        rows: [{
          id: 'pt_selected',
          mrn: 'MRN-00000006',
          name: 'Selected Patient',
          phone: '03001234567',
          age: 35,
          gender: 'Female',
          cnic: '35201-0000000-1',
          address: 'Model Town',
          blood_group: 'A+',
          emergency_contact: '03001230000',
        }],
      },
      {
        rowCount: 1,
        rows: [{
          id: 'apt_selected',
          patient_id: 'pt_selected',
          clinic_id: 'cl_1',
          doctor_user_id: 'usr_1',
          date: '2026-04-10',
          time: '11:00',
          status: 'waiting',
          type: 'follow-up',
          chief_complaint: 'Walk-in',
          token_number: 6,
        }],
      },
    ]);

    const result = await createWalkInEncounter(client, {
      workspaceId: 'ws_1',
      doctorUserId: 'usr_1',
      clinicId: 'cl_1',
      payload: {
        patientId: 'pt_selected',
        name: 'Different Typed Name',
        phone: '03001234567',
        age: 20,
        gender: 'Male',
        cnic: '',
        address: '',
        bloodGroup: '',
        emergencyContact: '',
        chiefComplaint: 'Walk-in',
        date: '2026-04-10',
        time: '11:00',
      },
    });

    expect(result.patient.id).toBe('pt_selected');
    expect(result.reusedPatient).toBe(true);
    expect(result.appointment.type).toBe('follow-up');
  });
});
