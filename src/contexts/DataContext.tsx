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
import { getLocalDateKey, parseDateKey } from '@/lib/date';

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

const VALID_APPOINTMENT_STATUSES: Appointment['status'][] = [
  'scheduled',
  'waiting',
  'in-consultation',
  'completed',
  'cancelled',
];

function byNewestDate<T extends { date?: string; savedAt?: string }>(a: T, b: T) {
  const aDate = a.date ? parseDateKey(a.date).getTime() : new Date(a.savedAt ?? 0).getTime();
  const bDate = b.date ? parseDateKey(b.date).getTime() : new Date(b.savedAt ?? 0).getTime();
  return bDate - aDate;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const unique = new Map<string, T>();

  items.forEach(item => {
    if (item?.id) {
      unique.set(item.id, item);
    }
  });

  return [...unique.values()];
}

function normalizeDiagnoses(diagnoses: ConsultationDraft['diagnoses']) {
  const unique = dedupeById(diagnoses.filter(dx => dx?.id && dx.name));
  let sawPrimary = false;

  return unique.map(dx => {
    if (dx.isPrimary && !sawPrimary) {
      sawPrimary = true;
      return dx;
    }

    if (dx.isPrimary && sawPrimary) {
      return { ...dx, isPrimary: false };
    }

    return dx;
  });
}

function normalizeMedications(medications: ConsultationDraft['medications']) {
  return dedupeById(
    medications.filter(med => med?.id && med.name && med.frequency && med.duration)
  );
}

function normalizeLabOrders(labOrders: ConsultationDraft['labOrders']) {
  return dedupeById(
    labOrders.filter(order => order?.id && order.testName && order.category)
  ).sort(byNewestDate);
}

function sanitizeConsultationPayload(payload: ConsultationPayload): ConsultationPayload {
  return {
    ...payload,
    chiefComplaint: payload.chiefComplaint.trim(),
    hpi: payload.hpi.trim(),
    pastHistory: payload.pastHistory.trim(),
    allergies: payload.allergies.trim(),
    examination: payload.examination.trim(),
    assessment: payload.assessment.trim(),
    plan: payload.plan.trim(),
    instructions: payload.instructions.trim(),
    followUp: payload.followUp.trim(),
    diagnoses: normalizeDiagnoses(payload.diagnoses),
    medications: normalizeMedications(payload.medications),
    labOrders: normalizeLabOrders(payload.labOrders),
  };
}

function normalizeAppointments(appointments: Appointment[], validPatientIds: Set<string>) {
  const cleaned = dedupeById(
    appointments.filter(
      appointment =>
        appointment?.id &&
        validPatientIds.has(appointment.patientId) &&
        VALID_APPOINTMENT_STATUSES.includes(appointment.status)
    )
  ).sort((a, b) => {
    const dateDiff = parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;

    const timeA = a.time ?? '';
    const timeB = b.time ?? '';
    if (timeA !== timeB) return timeA.localeCompare(timeB);

    return a.tokenNumber - b.tokenNumber;
  });

  const activeByClinic = new Map<string, string>();

  return cleaned.map(appointment => {
    if (appointment.status !== 'in-consultation') return appointment;

    const clinicKey = `${appointment.clinicId}:${appointment.date}`;
    if (!activeByClinic.has(clinicKey)) {
      activeByClinic.set(clinicKey, appointment.id);
      return appointment;
    }

    return { ...appointment, status: 'waiting' };
  });
}

function normalizeNotes(notes: ClinicalNote[], validPatientIds: Set<string>) {
  return dedupeById(
    notes.filter(note => note?.id && validPatientIds.has(note.patientId))
  )
    .map(note => ({
      ...note,
      diagnoses: normalizeDiagnoses(note.diagnoses),
      medications: normalizeMedications(note.medications),
      labOrders: normalizeLabOrders(note.labOrders),
    }))
    .sort(byNewestDate);
}

function normalizeDrafts(
  drafts: Record<string, ConsultationDraft>,
  validPatientIds: Set<string>
) {
  return Object.fromEntries(
    Object.entries(drafts)
      .filter(([patientId, draft]) => validPatientIds.has(patientId) && Boolean(draft))
      .map(([patientId, draft]) => [
        patientId,
        {
          ...sanitizeConsultationPayload(draft),
          savedAt: draft.savedAt ?? new Date().toISOString(),
        },
      ])
  );
}

function normalizeSnapshot(snapshot: AppStateSnapshot): AppStateSnapshot {
  const patients = dedupeById(snapshot.patients.filter(patient => patient?.id && patient.name));
  const validPatientIds = new Set(patients.map(patient => patient.id));
  const appointments = normalizeAppointments(snapshot.appointments, validPatientIds);
  const notes = normalizeNotes(snapshot.notes, validPatientIds);
  const drafts = normalizeDrafts(snapshot.drafts, validPatientIds);

  return { patients, appointments, notes, drafts };
}

const PATIENTS_STORAGE_KEY = 'my-health/patients';
const APPOINTMENTS_STORAGE_KEY = 'my-health/appointments';
const NOTES_STORAGE_KEY = 'my-health/notes';
const DRAFTS_STORAGE_KEY = 'my-health/consultation-drafts';

const INITIAL_SNAPSHOT: AppStateSnapshot = {
  patients: [...initialPatients],
  appointments: [...initialAppointments],
  notes: [...initialNotes],
  drafts: {},
};

interface DataContextType {
  patients: Patient[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  getPatient: (id: string) => Patient | undefined;
  getAppointmentsForClinic: (clinicId: string) => Appointment[];
  getAppointmentsForClinicOnDate: (clinicId: string, date: string) => Appointment[];
  getPatientNotes: (patientId: string) => ClinicalNote[];
  getConsultationDraft: (patientId: string) => ConsultationDraft | undefined;
  addPatient: (patient: Patient) => void;
  addAppointment: (appointment: Appointment) => void;
  upsertAppointment: (appointment: Appointment) => void;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => void;
  saveConsultationDraft: (payload: ConsultationPayload) => void;
  completeConsultation: (payload: ConsultationPayload) => ClinicalNote;
  restoreDemoData: () => void;
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
        .sort((a, b) => parseDateKey(b.date).getTime() - parseDateKey(a.date).getTime()),
    [notes]
  );

  const getConsultationDraft = useCallback(
    (patientId: string) => drafts[patientId],
    [drafts]
  );

  const getAppointmentsForClinicOnDate = useCallback(
    (clinicId: string, date: string) =>
      appointments
        .filter(appointment => appointment.clinicId === clinicId && appointment.date === date)
        .sort((a, b) => {
          const timeCompare = a.time.localeCompare(b.time);
          if (timeCompare !== 0) return timeCompare;
          return a.tokenNumber - b.tokenNumber;
        }),
    [appointments]
  );

  const addPatient = useCallback((patient: Patient) => {
    setPatients(prev => dedupeById([...prev, patient]));
  }, []);

  const addAppointment = useCallback((appointment: Appointment) => {
    setAppointments(prev => {
      const validPatientIds = new Set(patients.map(patient => patient.id));
      return normalizeAppointments([...prev, appointment], validPatientIds);
    });
  }, [patients]);

  const upsertAppointment = useCallback((appointment: Appointment) => {
    setAppointments(prev => {
      const validPatientIds = new Set(patients.map(patient => patient.id));
      const exists = prev.some(item => item.id === appointment.id);
      const next = exists
        ? prev.map(item => (item.id === appointment.id ? appointment : item))
        : [...prev, appointment];
      return normalizeAppointments(next, validPatientIds);
    });
  }, [patients]);

  const updateAppointmentStatus = useCallback((appointmentId: string, status: Appointment['status']) => {
    setAppointments(prev => {
      const validPatientIds = new Set(patients.map(patient => patient.id));
      const target = prev.find(appointment => appointment.id === appointmentId);

      if (!target) return prev;

      const next = prev.map(appointment => {
        if (appointment.id === appointmentId) {
          return { ...appointment, status };
        }

        if (
          status === 'in-consultation' &&
          appointment.id !== appointmentId &&
          appointment.clinicId === target.clinicId &&
          appointment.date === target.date &&
          appointment.status === 'in-consultation'
        ) {
          return { ...appointment, status: 'waiting' };
        }

        return appointment;
      });

      return normalizeAppointments(next, validPatientIds);
    });
  }, [patients]);

  const saveConsultationDraft = useCallback((payload: ConsultationPayload) => {
    const nextDraft = sanitizeConsultationPayload(payload);
    setDrafts(prev => ({
      ...prev,
      [payload.patientId]: {
        ...nextDraft,
        savedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const completeConsultation = useCallback((payload: ConsultationPayload) => {
    const nextPayload = sanitizeConsultationPayload(payload);
    const note: ClinicalNote = {
      id: `note-${Date.now()}`,
      doctorId: doctor.id,
      date: new Date().toISOString(),
      status: 'completed',
      ...nextPayload,
    };

    setNotes(prev => normalizeNotes([note, ...prev], new Set(patients.map(patient => patient.id))));
    setDrafts(prev => {
      const next = { ...prev };
      delete next[nextPayload.patientId];
      return next;
    });
    setAppointments(prev => {
      const validPatientIds = new Set(patients.map(patient => patient.id));
      const nextAppointments = prev.map(appointment => {
        if (
          appointment.patientId === nextPayload.patientId &&
          appointment.clinicId === nextPayload.clinicId &&
          appointment.status !== 'completed' &&
          appointment.status !== 'cancelled'
        ) {
          return { ...appointment, status: 'completed' };
        }

        return appointment;
      });

      return normalizeAppointments(nextAppointments, validPatientIds);
    });

    return note;
  }, [patients]);

  const addWalkIn = useCallback((data: {
    name: string; phone: string; age: string; gender: string;
    cnic: string; address: string; bloodGroup: string;
    emergencyContact: string; chiefComplaint: string;
  }, clinicId: string): string => {
    const patientId = `p-walkin-${Date.now()}`;
    const mrn = `MRN-${Date.now().toString().slice(-8)}`;
    const today = getLocalDateKey();

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

    setPatients(prev => dedupeById([...prev, newPatient]));

    setAppointments(prev => {
      const clinicApts = prev.filter(a => a.clinicId === clinicId && a.date === today);
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
      return normalizeAppointments([...prev, newAppointment], new Set([...patients.map(patient => patient.id), patientId]));
    });

    return patientId;
  }, [patients]);

  const restoreDemoData = useCallback(() => {
    const snapshot = normalizeSnapshot(INITIAL_SNAPSHOT);
    setPatients(snapshot.patients);
    setAppointments(snapshot.appointments);
    setNotes(snapshot.notes);
    setDrafts(snapshot.drafts);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const localSnapshot: AppStateSnapshot = normalizeSnapshot({ patients, appointments, notes, drafts });

      try {
        const remoteState = await fetchAppState();
        if (cancelled) return;

        if (remoteState) {
          const normalized = normalizeSnapshot(remoteState);
          setPatients(normalized.patients);
          setAppointments(normalized.appointments);
          setNotes(normalized.notes);
          setDrafts(normalized.drafts);
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
    writeStorage(PATIENTS_STORAGE_KEY, dedupeById(patients));
  }, [patients]);

  useEffect(() => {
    writeStorage(
      APPOINTMENTS_STORAGE_KEY,
      normalizeAppointments(appointments, new Set(patients.map(patient => patient.id)))
    );
  }, [appointments, patients]);

  useEffect(() => {
    writeStorage(NOTES_STORAGE_KEY, normalizeNotes(notes, new Set(patients.map(patient => patient.id))));
  }, [notes, patients]);

  useEffect(() => {
    writeStorage(DRAFTS_STORAGE_KEY, normalizeDrafts(drafts, new Set(patients.map(patient => patient.id))));
  }, [drafts, patients]);

  useEffect(() => {
    if (!isRemoteReady) return;

    const snapshot: AppStateSnapshot = normalizeSnapshot({ patients, appointments, notes, drafts });
    void persistAppState(snapshot).catch(() => {
      // Local storage remains the fallback when the API is not reachable.
    });
  }, [appointments, drafts, isRemoteReady, notes, patients]);

  return (
    <DataContext.Provider value={{
      patients, appointments, notes, getPatient, getAppointmentsForClinic,
      getAppointmentsForClinicOnDate,
      getPatientNotes, getConsultationDraft, addPatient, addAppointment,
      upsertAppointment, updateAppointmentStatus, saveConsultationDraft,
      completeConsultation, restoreDemoData, addWalkIn,
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
