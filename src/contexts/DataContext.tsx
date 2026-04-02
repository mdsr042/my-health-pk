import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  patients as initialPatients,
  appointments as initialAppointments,
  previousNotes as initialNotes,
  doctor,
  type Patient,
  type Appointment,
  type ClinicalNote,
} from '@/data/mockData';
import { readStorage, writeStorage } from '@/lib/storage';
import { bootstrapAppState, fetchAppState, persistAppState } from '@/lib/api';
import type { AppStateSnapshot, ConsultationDraft } from '@/lib/app-types';

interface ConsultationPayload {
  patientId: ConsultationDraft['patientId'];
  clinicId: ConsultationDraft['clinicId'];
  chiefComplaint: ConsultationDraft['chiefComplaint'];
  hpi: ConsultationDraft['hpi'];
  pastHistory: ConsultationDraft['pastHistory'];
  allergies: ConsultationDraft['allergies'];
  examination: ConsultationDraft['examination'];
  assessment: ConsultationDraft['assessment'];
  plan: ConsultationDraft['plan'];
  instructions: ConsultationDraft['instructions'];
  followUp: ConsultationDraft['followUp'];
  vitals: ConsultationDraft['vitals'];
  diagnoses: ConsultationDraft['diagnoses'];
  medications: ConsultationDraft['medications'];
  labOrders: ConsultationDraft['labOrders'];
}

const PATIENTS_STORAGE_KEY = 'my-health/patients';
const APPOINTMENTS_STORAGE_KEY = 'my-health/appointments';
const NOTES_STORAGE_KEY = 'my-health/notes';
const DRAFTS_STORAGE_KEY = 'my-health/consultation-drafts';

interface DataContextType {
  patients: Patient[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  getPatient: (id: string) => Patient | undefined;
  getAppointmentsForClinic: (clinicId: string) => Appointment[];
  getPatientNotes: (patientId: string) => ClinicalNote[];
  getConsultationDraft: (patientId: string) => ConsultationDraft | undefined;
  addPatient: (patient: Patient) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => void;
  saveConsultationDraft: (payload: ConsultationPayload) => void;
  completeConsultation: (payload: ConsultationPayload) => ClinicalNote;
  addWalkIn: (data: {
    name: string; phone: string; age: string; gender: string;
    cnic: string; address: string; bloodGroup: string;
    emergencyContact: string; chiefComplaint: string;
  }, clinicId: string) => string;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(() =>
    readStorage<Patient[]>(PATIENTS_STORAGE_KEY, [...initialPatients])
  );
  const [appointments, setAppointments] = useState<Appointment[]>(() =>
    readStorage<Appointment[]>(APPOINTMENTS_STORAGE_KEY, [...initialAppointments])
  );
  const [notes, setNotes] = useState<ClinicalNote[]>(() =>
    readStorage<ClinicalNote[]>(NOTES_STORAGE_KEY, [...initialNotes])
  );
  const [drafts, setDrafts] = useState<Record<string, ConsultationDraft>>(() =>
    readStorage<Record<string, ConsultationDraft>>(DRAFTS_STORAGE_KEY, {})
  );
  const [isRemoteReady, setIsRemoteReady] = useState(false);

  const getPatient = useCallback((id: string) => patients.find(p => p.id === id), [patients]);

  const getAppointmentsForClinic = useCallback(
    (clinicId: string) => appointments.filter(a => a.clinicId === clinicId),
    [appointments]
  );

  const getPatientNotes = useCallback(
    (patientId: string) =>
      notes
        .filter(note => note.patientId === patientId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [notes]
  );

  const getConsultationDraft = useCallback(
    (patientId: string) => drafts[patientId],
    [drafts]
  );

  const addPatient = useCallback((patient: Patient) => {
    setPatients(prev => [...prev, patient]);
  }, []);

  const addAppointment = useCallback((appointment: Appointment) => {
    setAppointments(prev => [...prev, appointment]);
  }, []);

  const updateAppointmentStatus = useCallback((appointmentId: string, status: Appointment['status']) => {
    setAppointments(prev =>
      prev.map(a => a.id === appointmentId ? { ...a, status } : a)
    );
  }, []);

  const saveConsultationDraft = useCallback((payload: ConsultationPayload) => {
    setDrafts(prev => ({
      ...prev,
      [payload.patientId]: {
        ...payload,
        savedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const completeConsultation = useCallback((payload: ConsultationPayload) => {
    const note: ClinicalNote = {
      id: `note-${Date.now()}`,
      doctorId: doctor.id,
      date: new Date().toISOString(),
      status: 'completed',
      ...payload,
    };

    setNotes(prev => [note, ...prev]);
    setDrafts(prev => {
      const next = { ...prev };
      delete next[payload.patientId];
      return next;
    });

    return note;
  }, []);

  const addWalkIn = useCallback((data: {
    name: string; phone: string; age: string; gender: string;
    cnic: string; address: string; bloodGroup: string;
    emergencyContact: string; chiefComplaint: string;
  }, clinicId: string): string => {
    const patientId = `p-walkin-${Date.now()}`;
    const mrn = `MRN-${Date.now().toString().slice(-8)}`;
    const today = new Date().toISOString().split('T')[0];

    const newPatient: Patient = {
      id: patientId,
      mrn,
      name: data.name,
      phone: data.phone,
      age: parseInt(data.age) || 0,
      gender: data.gender as 'Male' | 'Female',
      cnic: data.cnic || '',
      address: data.address || '',
      bloodGroup: data.bloodGroup || '',
      emergencyContact: data.emergencyContact || '',
    };

    setPatients(prev => {
      const clinicApts = appointments.filter(a => a.clinicId === clinicId);
      return [...prev, newPatient];
    });

    setAppointments(prev => {
      const clinicApts = prev.filter(a => a.clinicId === clinicId);
      const nextToken = clinicApts.length > 0 ? Math.max(...clinicApts.map(a => a.tokenNumber)) + 1 : 1;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const newAppointment: Appointment = {
        id: `apt-walkin-${Date.now()}`,
        patientId,
        clinicId,
        doctorId: 'doc-1',
        date: today,
        time: timeStr,
        status: 'waiting',
        type: 'new',
        chiefComplaint: data.chiefComplaint || 'Walk-in',
        tokenNumber: nextToken,
      };
      return [...prev, newAppointment];
    });

    return patientId;
  }, [appointments]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const localSnapshot: AppStateSnapshot = { patients, appointments, notes, drafts };

      try {
        const remoteState = await fetchAppState();
        if (cancelled) return;

        if (remoteState) {
          setPatients(remoteState.patients);
          setAppointments(remoteState.appointments);
          setNotes(remoteState.notes);
          setDrafts(remoteState.drafts);
        } else {
          await bootstrapAppState(localSnapshot);
        }
      } catch {
        // Keep the local fallback state when the API is unavailable.
      } finally {
        if (!cancelled) {
          setIsRemoteReady(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStorage(PATIENTS_STORAGE_KEY, patients);
  }, [patients]);

  useEffect(() => {
    writeStorage(APPOINTMENTS_STORAGE_KEY, appointments);
  }, [appointments]);

  useEffect(() => {
    writeStorage(NOTES_STORAGE_KEY, notes);
  }, [notes]);

  useEffect(() => {
    writeStorage(DRAFTS_STORAGE_KEY, drafts);
  }, [drafts]);

  useEffect(() => {
    if (!isRemoteReady) return;

    const snapshot: AppStateSnapshot = { patients, appointments, notes, drafts };
    void persistAppState(snapshot).catch(() => {
      // Local storage remains the fallback when the API is not reachable.
    });
  }, [appointments, drafts, isRemoteReady, notes, patients]);

  return (
    <DataContext.Provider value={{
      patients, appointments, notes, getPatient, getAppointmentsForClinic,
      getPatientNotes, getConsultationDraft, addPatient, addAppointment,
      updateAppointmentStatus, saveConsultationDraft, completeConsultation, addWalkIn,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
