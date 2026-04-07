import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Appointment, ClinicalNote, Patient } from '@/data/mockData';
import {
  completeConsultation as completeConsultationRequest,
  createAppointment,
  createPatient,
  fetchAppointments,
  fetchClinicalNotes,
  fetchDrafts,
  fetchPatients,
  persistDraft,
  updateAppointment,
  updateAppointmentStatus as updateAppointmentStatusRequest,
} from '@/lib/api';
import type { ConsultationDraft } from '@/lib/app-types';
import { getLocalDateKey, parseDateKey } from '@/lib/date';
import { useAuth } from '@/contexts/AuthContext';

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
  getConsultationDraft: (patientId: string) => ConsultationDraft | undefined;
  addPatient: (patient: Patient) => Promise<void>;
  addAppointment: (appointment: Appointment) => Promise<void>;
  upsertAppointment: (appointment: Appointment) => Promise<void>;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => Promise<void>;
  applyQueueAction: (appointmentId: string, action: QueueAction) => Promise<void>;
  saveConsultationDraft: (payload: ConsultationPayload) => Promise<void>;
  completeConsultation: (payload: ConsultationPayload) => Promise<ClinicalNote>;
  restoreDemoData: () => void;
  addWalkIn: (data: {
    name: string;
    phone: string;
    age: string;
    gender: string;
    cnic: string;
    address: string;
    bloodGroup: string;
    emergencyContact: string;
    chiefComplaint: string;
  }, clinicId: string) => Promise<string>;
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

  const getConsultationDraft = useCallback((patientId: string) => drafts[patientId], [drafts]);

  const addPatient = useCallback(async (patient: Patient) => {
    const saved = await createPatient(patient);
    setPatients(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
  }, []);

  const addAppointment = useCallback(async (appointment: Appointment) => {
    await createAppointment(appointment);
    setAppointments(prev => sortAppointments([...prev, appointment]));
  }, []);

  const upsertAppointment = useCallback(async (appointment: Appointment) => {
    const exists = appointments.some(item => item.id === appointment.id);
    if (exists) {
      await updateAppointment(appointment);
      setAppointments(prev => sortAppointments(prev.map(item => (item.id === appointment.id ? appointment : item))));
    } else {
      await createAppointment(appointment);
      setAppointments(prev => sortAppointments([...prev, appointment]));
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
    await persistDraft(payload.patientId, draft);
    setDrafts(prev => ({ ...prev, [payload.patientId]: draft }));
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
      delete next[payload.patientId];
      return next;
    });
    setAppointments(prev =>
      sortAppointments(
        prev.map(appointment =>
          appointment.patientId === payload.patientId &&
          appointment.clinicId === payload.clinicId &&
          appointment.status !== 'cancelled' &&
          appointment.status !== 'no-show'
            ? { ...appointment, status: 'completed' }
            : appointment
        )
      )
    );
    return note;
  }, []);

  const addWalkIn = useCallback(async (data: {
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
    const patientId = `p-walkin-${Date.now()}`;
    const mrn = `MRN-${Date.now().toString().slice(-8)}`;
    const newPatient: Patient = {
      id: patientId,
      mrn,
      name: data.name,
      phone: data.phone,
      age: parseInt(data.age, 10) || 0,
      gender: (data.gender as Patient['gender']) || 'Male',
      cnic: data.cnic || '',
      address: data.address || '',
      bloodGroup: data.bloodGroup || '',
      emergencyContact: data.emergencyContact || '',
    };

    const today = getLocalDateKey();
    const clinicAppointments = appointments.filter(appointment => appointment.clinicId === clinicId && appointment.date === today);
    const tokenNumber = clinicAppointments.length > 0 ? Math.max(...clinicAppointments.map(item => item.tokenNumber)) + 1 : 1;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newAppointment: Appointment = {
      id: `apt-walkin-${Date.now()}`,
      patientId,
      clinicId,
      doctorId: user?.id || '',
      date: today,
      time,
      status: 'waiting',
      type: 'new',
      chiefComplaint: data.chiefComplaint || 'Walk-in',
      tokenNumber,
    };

    await createPatient(newPatient);
    await createAppointment(newAppointment);

    setPatients(prev => [newPatient, ...prev]);
    setAppointments(prev => sortAppointments([...prev, newAppointment]));

    return patientId;
  }, [appointments, user?.id]);

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
    addAppointment,
    upsertAppointment,
    updateAppointmentStatus,
    applyQueueAction,
    saveConsultationDraft,
    completeConsultation,
    restoreDemoData,
    addWalkIn,
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
    addAppointment,
    upsertAppointment,
    updateAppointmentStatus,
    applyQueueAction,
    saveConsultationDraft,
    completeConsultation,
    restoreDemoData,
    addWalkIn,
    refreshData,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
