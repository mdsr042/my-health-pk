import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Appointment, ClinicalNote, Patient } from '@/data/mockData';
import {
  completeConsultation as completeConsultationRequest,
  createAppointment,
  createWalkIn as createWalkInRequest,
  createPatient,
  fetchAppointments,
  fetchClinicalNotes,
  fetchDrafts,
  fetchPatients,
  persistDraft,
  searchPatients as searchPatientsRequest,
  searchPatientsByPhone as searchPatientsByPhoneRequest,
  updatePatient as updatePatientRequest,
  updateAppointment,
  updateAppointmentStatus as updateAppointmentStatusRequest,
} from '@/lib/api';
import type { ConsultationDraft, WalkInResult } from '@/lib/app-types';
import { getLocalDateKey, parseDateKey } from '@/lib/date';
import { useAuth } from '@/contexts/AuthContext';

interface ConsultationPayload {
  appointmentId: ConsultationDraft['appointmentId'];
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
  procedures: ConsultationDraft['procedures'];
  careActions: ConsultationDraft['careActions'];
}

type QueueAction =
  | 'arrived'
  | 'start'
  | 'return-to-waiting'
  | 'restore-to-waiting'
  | 'complete'
  | 'cancel'
  | 'no-show';

interface DataContextType {
  patients: Patient[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  isLoading: boolean;
  getPatient: (id: string) => Patient | undefined;
  getAppointmentsForClinic: (clinicId: string) => Appointment[];
  getAppointmentsForClinicOnDate: (clinicId: string, date: string) => Appointment[];
  getPatientNotes: (patientId: string) => ClinicalNote[];
  getConsultationDraft: (appointmentId?: string, patientId?: string) => ConsultationDraft | undefined;
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (patient: Patient) => Promise<Patient>;
  addAppointment: (appointment: Appointment) => Promise<void>;
  upsertAppointment: (appointment: Appointment) => Promise<void>;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => Promise<void>;
  applyQueueAction: (appointmentId: string, action: QueueAction) => Promise<void>;
  saveConsultationDraft: (payload: ConsultationPayload) => Promise<void>;
  completeConsultation: (payload: ConsultationPayload) => Promise<ClinicalNote>;
  restoreDemoData: () => void;
  addWalkIn: (data: {
    patientId?: string;
    name: string;
    phone: string;
    age: string;
    gender: string;
    cnic: string;
    address: string;
    bloodGroup: string;
    emergencyContact: string;
    chiefComplaint: string;
  }, clinicId: string) => Promise<WalkInResult>;
  searchPatients: (query: string) => Promise<Patient[]>;
  searchPatientsByPhone: (phone: string) => Promise<Patient[]>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

function sortAppointments(items: Appointment[]) {
  return [...items].sort((a, b) => {
    const dateDiff = parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = a.time.localeCompare(b.time);
    if (timeDiff !== 0) return timeDiff;
    return a.tokenNumber - b.tokenNumber;
  });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ConsultationDraft>>({});
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'doctor_owner') {
      setPatients([]);
      setAppointments([]);
      setNotes([]);
      setDrafts({});
      return;
    }

    setIsLoading(true);
    try {
      const [nextPatients, nextAppointments, nextNotes, nextDrafts] = await Promise.all([
        fetchPatients(),
        fetchAppointments(),
        fetchClinicalNotes(),
        fetchDrafts(),
      ]);

      setPatients(nextPatients);
      setAppointments(sortAppointments(nextAppointments));
      setNotes(nextNotes);
      setDrafts(nextDrafts);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const getPatient = useCallback((id: string) => patients.find(patient => patient.id === id), [patients]);

  const getAppointmentsForClinic = useCallback(
    (clinicId: string) => appointments.filter(appointment => appointment.clinicId === clinicId),
    [appointments]
  );

  const getAppointmentsForClinicOnDate = useCallback(
    (clinicId: string, date: string) =>
      appointments
        .filter(appointment => appointment.clinicId === clinicId && appointment.date === date)
        .sort((a, b) => a.time.localeCompare(b.time) || a.tokenNumber - b.tokenNumber),
    [appointments]
  );

  const getPatientNotes = useCallback(
    (patientId: string) =>
      notes
        .filter(note => note.patientId === patientId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [notes]
  );

  const getConsultationDraft = useCallback((appointmentId?: string, patientId?: string) => {
    if (appointmentId && drafts[appointmentId]) {
      return drafts[appointmentId];
    }

    if (patientId) {
      return Object.values(drafts).find(draft => !draft.appointmentId && draft.patientId === patientId);
    }

    return undefined;
  }, [drafts]);

  const addPatient = useCallback(async (patient: Patient) => {
    const saved = await createPatient(patient);
    setPatients(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
  }, []);

  const updatePatient = useCallback(async (patient: Patient) => {
    const saved = await updatePatientRequest(patient);
    setPatients(prev => prev.map(item => (item.id === saved.id ? saved : item)));
    return saved;
  }, []);

  const addAppointment = useCallback(async (appointment: Appointment) => {
    const saved = await createAppointment(appointment);
    setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== saved.id), saved]));
  }, []);

  const upsertAppointment = useCallback(async (appointment: Appointment) => {
    const exists = appointments.some(item => item.id === appointment.id);
    if (exists) {
      const saved = await updateAppointment(appointment);
      setAppointments(prev => sortAppointments(prev.map(item => (item.id === appointment.id ? saved : item))));
    } else {
      const saved = await createAppointment(appointment);
      setAppointments(prev => sortAppointments([...prev, saved]));
    }
  }, [appointments]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, status: Appointment['status']) => {
    await updateAppointmentStatusRequest(appointmentId, status);
    setAppointments(prev => {
      const target = prev.find(appointment => appointment.id === appointmentId);
      if (!target) return prev;

      return sortAppointments(
        prev.map(appointment => {
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
        })
      );
    });
  }, []);

  const applyQueueAction = useCallback(async (appointmentId: string, action: QueueAction) => {
    const targetStatus: Appointment['status'] =
      action === 'start'
        ? 'in-consultation'
        : action === 'complete'
          ? 'completed'
          : action === 'cancel'
            ? 'cancelled'
            : action === 'no-show'
              ? 'no-show'
              : 'waiting';

    await updateAppointmentStatus(appointmentId, targetStatus);
  }, [updateAppointmentStatus]);

  const saveConsultationDraft = useCallback(async (payload: ConsultationPayload) => {
    const draft: ConsultationDraft = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    await persistDraft(payload.appointmentId, draft);
    setDrafts(prev => ({ ...prev, [payload.appointmentId]: draft }));
  }, []);

  const completeConsultation = useCallback(async (payload: ConsultationPayload) => {
    const draftPayload: ConsultationDraft = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    const note = await completeConsultationRequest(draftPayload);
    setNotes(prev => [note, ...prev.filter(item => item.id !== note.id)]);
    setDrafts(prev => {
      const next = { ...prev };
      delete next[payload.appointmentId];
      return next;
    });
    setAppointments(prev =>
      sortAppointments(
        prev.map(appointment =>
          appointment.id === payload.appointmentId
            ? { ...appointment, status: 'completed' }
            : appointment
        )
      )
    );
    return note;
  }, []);

  const addWalkIn = useCallback(async (data: {
    patientId?: string;
    name: string;
    phone: string;
    age: string;
    gender: string;
    cnic: string;
    address: string;
    bloodGroup: string;
    emergencyContact: string;
    chiefComplaint: string;
  }, clinicId: string) => {
    const today = getLocalDateKey();
    const saved = await createWalkInRequest({
      clinicId,
      patientId: data.patientId || undefined,
      name: data.name,
      phone: data.phone,
      age: parseInt(data.age, 10) || 0,
      gender: (data.gender as Patient['gender']) || 'Male',
      cnic: data.cnic || '',
      address: data.address || '',
      bloodGroup: data.bloodGroup || '',
      emergencyContact: data.emergencyContact || '',
      chiefComplaint: data.chiefComplaint || 'Walk-in',
      date: today,
    });

    setPatients(prev => [saved.patient, ...prev.filter(item => item.id !== saved.patient.id)]);
    setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== saved.appointment.id), saved.appointment]));

    return saved;
  }, []);

  const searchPatientsByPhone = useCallback(async (phone: string) => {
    if (!phone.trim()) return [];
    return searchPatientsByPhoneRequest(phone.trim());
  }, []);

  const searchPatients = useCallback(async (query: string) => {
    if (!query.trim()) return [];
    return searchPatientsRequest(query.trim());
  }, []);

  const restoreDemoData = useCallback(() => {
    setPatients([]);
    setAppointments([]);
    setNotes([]);
    setDrafts({});
  }, []);

  const value = useMemo<DataContextType>(() => ({
    patients,
    appointments,
    notes,
    isLoading,
    getPatient,
    getAppointmentsForClinic,
    getAppointmentsForClinicOnDate,
    getPatientNotes,
    getConsultationDraft,
    addPatient,
    updatePatient,
    addAppointment,
    upsertAppointment,
    updateAppointmentStatus,
    applyQueueAction,
    saveConsultationDraft,
    completeConsultation,
    restoreDemoData,
    addWalkIn,
    searchPatients,
    searchPatientsByPhone,
    refreshData,
  }), [
    patients,
    appointments,
    notes,
    isLoading,
    getPatient,
    getAppointmentsForClinic,
    getAppointmentsForClinicOnDate,
    getPatientNotes,
    getConsultationDraft,
    addPatient,
    updatePatient,
    addAppointment,
    upsertAppointment,
    updateAppointmentStatus,
    applyQueueAction,
    saveConsultationDraft,
    completeConsultation,
    restoreDemoData,
    addWalkIn,
    searchPatients,
    searchPatientsByPhone,
    refreshData,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
