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
  });
});
