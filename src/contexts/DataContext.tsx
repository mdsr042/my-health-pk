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
import { useDesktop } from '@/contexts/DesktopContext';
import { enqueueDesktopMutation, getCachedDesktopBootstrap, getDesktopRuntimeInfoSync, isDesktopRuntime, updateDesktopBootstrapSnapshot } from '@/lib/desktop';

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

function createDesktopMutationId() {
  return `mutation_${crypto.randomUUID()}`;
}

function buildDraftBaseVersion(payload: ConsultationPayload | ConsultationDraft) {
  return JSON.stringify({
    appointmentId: payload.appointmentId,
    patientId: payload.patientId,
    clinicId: payload.clinicId,
    chiefComplaint: payload.chiefComplaint,
    hpi: payload.hpi,
    pastHistory: payload.pastHistory,
    allergies: payload.allergies,
    examination: payload.examination,
    assessment: payload.assessment,
    plan: payload.plan,
    instructions: payload.instructions,
    followUp: payload.followUp,
    vitals: payload.vitals,
    diagnoses: payload.diagnoses,
    medications: payload.medications,
    labOrders: payload.labOrders,
    procedures: payload.procedures,
    careActions: payload.careActions,
    savedAt: payload.savedAt ?? '',
  });
}

function createOfflinePatientSearchResults(patients: Patient[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return patients.filter(patient =>
    patient.name.toLowerCase().includes(normalized)
    || patient.mrn.toLowerCase().includes(normalized)
    || (patient.phone || '').toLowerCase().includes(normalized)
    || (patient.cnic || '').toLowerCase().includes(normalized)
  ).slice(0, 25);
}

function createOfflinePhoneSearchResults(patients: Patient[], phone: string) {
  const normalized = phone.trim();
  if (!normalized) return [];
  return patients.filter(patient => (patient.phone || '').includes(normalized)).slice(0, 25);
}

function createOfflineMrn(patients: Patient[]) {
  const suffix = String(Date.now()).slice(-8);
  let candidate = `MRN-${suffix}`;
  let counter = 1;
  const used = new Set(patients.map(patient => patient.mrn));
  while (used.has(candidate)) {
    candidate = `MRN-${suffix}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function areJsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildPendingEntitySet(items: Array<{ entity_type: string; entity_id: string }>) {
  return new Set(items.map(item => `${item.entity_type}:${item.entity_id}`));
}

function mergePatientsFromBootstrap(local: Patient[], remote: Patient[], pendingEntities: Set<string>) {
  const merged = new Map(remote.map(patient => [patient.id, patient]));
  for (const patient of local) {
    if (pendingEntities.has(`patient:${patient.id}`) || !merged.has(patient.id)) {
      merged.set(patient.id, patient);
    }
  }
  return Array.from(merged.values());
}

function mergeAppointmentsFromBootstrap(local: Appointment[], remote: Appointment[], pendingEntities: Set<string>) {
  const merged = new Map(remote.map(appointment => [appointment.id, appointment]));
  for (const appointment of local) {
    if (pendingEntities.has(`appointment:${appointment.id}`) || !merged.has(appointment.id)) {
      merged.set(appointment.id, appointment);
    }
  }
  return sortAppointments(Array.from(merged.values()));
}

function mergeNotesFromBootstrap(
  local: ClinicalNote[],
  remote: ClinicalNote[],
  pendingConsultationIds: Set<string>
) {
  const remoteById = new Map(remote.map(note => [note.id, note]));
  const remoteByAppointment = new Map(
    remote
      .filter(note => note.appointmentId)
      .map(note => [note.appointmentId as string, note])
  );
  const merged: ClinicalNote[] = [...remote];

  for (const note of local) {
    if (note.id.startsWith('clinote_local_')) {
      const appointmentId = note.appointmentId || '';
      if (appointmentId && remoteByAppointment.has(appointmentId)) continue;
      if (appointmentId && !pendingConsultationIds.has(appointmentId)) continue;
      merged.push(note);
      continue;
    }

    if (!remoteById.has(note.id)) {
      merged.push(note);
    }
  }

  return merged.sort((a, b) => `${b.date} ${b.appointmentId || ''}`.localeCompare(`${a.date} ${a.appointmentId || ''}`));
}

function mergeDraftsFromBootstrap(
  local: Record<string, ConsultationDraft>,
  remote: Record<string, ConsultationDraft>,
  pendingEntities: Set<string>,
  canonicalNotes: ClinicalNote[]
) {
  const next = { ...remote };
  const canonicalAppointments = new Set(canonicalNotes.map(note => note.appointmentId).filter(Boolean));

  for (const [appointmentId, draft] of Object.entries(local)) {
    if (canonicalAppointments.has(appointmentId)) {
      delete next[appointmentId];
      continue;
    }

    if (pendingEntities.has(`consultation_draft:${appointmentId}`) || !next[appointmentId]) {
      next[appointmentId] = draft;
    }
  }

  for (const appointmentId of canonicalAppointments) {
    if (appointmentId) {
      delete next[appointmentId];
    }
  }

  return next;
}

async function enqueueDesktopEntityMutation(
  workspaceId: string,
  entityType: string,
  entityId: string,
  operationType: string,
  payload: Record<string, unknown>
) {
  if (!isDesktopRuntime() || !workspaceId) return;
  const runtime = getDesktopRuntimeInfoSync();
  if (!runtime.deviceId) return;

  await enqueueDesktopMutation({
    mutationId: createDesktopMutationId(),
    deviceId: runtime.deviceId,
    workspaceId,
    entityType,
    entityId,
    operationType,
    payload,
    createdLocalAt: new Date().toISOString(),
    status: 'pending',
  });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, workspace, doctorClinics } = useAuth();
  const { runtime, issues } = useDesktop();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ConsultationDraft>>({});
  const [isLoading, setIsLoading] = useState(false);
  const pendingEntitySet = useMemo(() => buildPendingEntitySet(issues.pending), [issues.pending]);
  const pendingConsultationIds = useMemo(
    () => new Set(
      issues.pending
        .filter(item => item.entity_type === 'consultation' && item.operation_type === 'complete')
        .map(item => item.entity_id)
    ),
    [issues.pending]
  );

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
      if (isDesktopRuntime()) {
        await updateDesktopBootstrapSnapshot({
          generatedAt: new Date().toISOString(),
          patients: nextPatients,
          appointments: sortAppointments(nextAppointments),
          notes: nextNotes,
          drafts: nextDrafts,
          clinics: doctorClinics,
          settings: null,
        });
      }
    } catch (error) {
      if (isDesktopRuntime()) {
        const cached = await getCachedDesktopBootstrap();
        if (cached.bootstrap) {
          setPatients(cached.bootstrap.patients ?? []);
          setAppointments(sortAppointments(cached.bootstrap.appointments ?? []));
          setNotes(cached.bootstrap.notes ?? []);
          setDrafts(cached.bootstrap.drafts ?? {});
          return;
        }
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [doctorClinics, isAuthenticated, user?.role]);

  useEffect(() => {
    void refreshData().catch(() => undefined);
  }, [refreshData]);

  useEffect(() => {
    if (!isDesktopRuntime() || !isAuthenticated || user?.role !== 'doctor_owner') return;
    void updateDesktopBootstrapSnapshot({
      generatedAt: new Date().toISOString(),
      patients,
      appointments,
      notes,
      drafts,
      clinics: doctorClinics,
      settings: null,
    });
  }, [appointments, doctorClinics, drafts, isAuthenticated, notes, patients, user?.role]);

  useEffect(() => {
    if (!isDesktopRuntime() || !isAuthenticated || user?.role !== 'doctor_owner' || runtime.locked || !runtime.lastSuccessfulSyncAt) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const cached = await getCachedDesktopBootstrap();
      if (cancelled || !cached.bootstrap) return;

      const mergedPatients = mergePatientsFromBootstrap(patients, cached.bootstrap.patients ?? [], pendingEntitySet);
      const mergedAppointments = mergeAppointmentsFromBootstrap(appointments, cached.bootstrap.appointments ?? [], pendingEntitySet);
      const mergedNotes = mergeNotesFromBootstrap(notes, cached.bootstrap.notes ?? [], pendingConsultationIds);
      const mergedDrafts = mergeDraftsFromBootstrap(drafts, cached.bootstrap.drafts ?? {}, pendingEntitySet, mergedNotes);

      setPatients(prev => (areJsonEqual(prev, mergedPatients) ? prev : mergedPatients));
      setAppointments(prev => (areJsonEqual(prev, mergedAppointments) ? prev : mergedAppointments));
      setNotes(prev => (areJsonEqual(prev, mergedNotes) ? prev : mergedNotes));
      setDrafts(prev => (areJsonEqual(prev, mergedDrafts) ? prev : mergedDrafts));
    })();

    return () => {
      cancelled = true;
    };
  }, [
    appointments,
    drafts,
    isAuthenticated,
    notes,
    patients,
    pendingConsultationIds,
    pendingEntitySet,
    runtime.lastSuccessfulSyncAt,
    runtime.locked,
    user?.role,
  ]);

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
    if (isDesktopRuntime()) {
      setPatients(prev => [patient, ...prev.filter(item => item.id !== patient.id)]);
      await enqueueDesktopEntityMutation(workspace?.id || '', 'patient', patient.id, 'create', patient as unknown as Record<string, unknown>);
    }

    try {
      const saved = await createPatient(patient);
      setPatients(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
    }
  }, [workspace?.id]);

  const updatePatient = useCallback(async (patient: Patient) => {
    if (isDesktopRuntime()) {
      setPatients(prev => prev.map(item => (item.id === patient.id ? patient : item)));
      await enqueueDesktopEntityMutation(workspace?.id || '', 'patient', patient.id, 'update', patient as unknown as Record<string, unknown>);
    }

    try {
      const saved = await updatePatientRequest(patient);
      setPatients(prev => prev.map(item => (item.id === saved.id ? saved : item)));
      return saved;
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
      return patient;
    }
  }, [workspace?.id]);

  const addAppointment = useCallback(async (appointment: Appointment) => {
    if (isDesktopRuntime()) {
      setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== appointment.id), appointment]));
      await enqueueDesktopEntityMutation(workspace?.id || '', 'appointment', appointment.id, 'create', appointment as unknown as Record<string, unknown>);
    }

    try {
      const saved = await createAppointment(appointment);
      setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== saved.id), saved]));
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
    }
  }, [workspace?.id]);

  const upsertAppointment = useCallback(async (appointment: Appointment) => {
    const exists = appointments.some(item => item.id === appointment.id);
    if (isDesktopRuntime()) {
      setAppointments(prev => sortAppointments(exists ? prev.map(item => (item.id === appointment.id ? appointment : item)) : [...prev, appointment]));
      await enqueueDesktopEntityMutation(
        workspace?.id || '',
        'appointment',
        appointment.id,
        exists ? 'update' : 'create',
        appointment as unknown as Record<string, unknown>
      );
    }

    if (exists) {
      try {
        const saved = await updateAppointment(appointment);
        setAppointments(prev => sortAppointments(prev.map(item => (item.id === appointment.id ? saved : item))));
      } catch (error) {
        if (!isDesktopRuntime()) throw error;
      }
    } else {
      try {
        const saved = await createAppointment(appointment);
        setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== saved.id), saved]));
      } catch (error) {
        if (!isDesktopRuntime()) throw error;
      }
    }
  }, [appointments, workspace?.id]);

  const updateAppointmentStatus = useCallback(async (appointmentId: string, status: Appointment['status']) => {
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

    if (isDesktopRuntime()) {
      await enqueueDesktopEntityMutation(workspace?.id || '', 'appointment', appointmentId, 'status_update', { status });
    }

    try {
      await updateAppointmentStatusRequest(appointmentId, status);
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
    }
  }, [workspace?.id]);

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
    const previousDraft = drafts[payload.appointmentId];
    const draft: ConsultationDraft = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    setDrafts(prev => ({ ...prev, [payload.appointmentId]: draft }));
    if (isDesktopRuntime()) {
      const runtimeInfo = getDesktopRuntimeInfoSync();
      await enqueueDesktopMutation({
        mutationId: createDesktopMutationId(),
        deviceId: runtimeInfo.deviceId,
        workspaceId: workspace?.id || '',
        entityType: 'consultation_draft',
        entityId: payload.appointmentId,
        operationType: 'upsert',
        payload: draft as unknown as Record<string, unknown>,
        baseVersion: previousDraft ? buildDraftBaseVersion(previousDraft) : '',
        createdLocalAt: new Date().toISOString(),
        status: 'pending',
      });
    }
    try {
      await persistDraft(payload.appointmentId, draft);
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
    }
  }, [drafts, workspace?.id]);

  const completeConsultation = useCallback(async (payload: ConsultationPayload) => {
    const draftPayload: ConsultationDraft = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    const optimisticNote: ClinicalNote = {
      id: `clinote_local_${crypto.randomUUID()}`,
      appointmentId: draftPayload.appointmentId,
      patientId: draftPayload.patientId,
      clinicId: draftPayload.clinicId,
      doctorId: user?.id || 'doctor',
      date: new Date().toISOString().slice(0, 10),
      chiefComplaint: draftPayload.chiefComplaint,
      hpi: draftPayload.hpi,
      pastHistory: draftPayload.pastHistory,
      allergies: draftPayload.allergies,
      examination: draftPayload.examination,
      assessment: draftPayload.assessment,
      plan: draftPayload.plan,
      instructions: draftPayload.instructions,
      followUp: draftPayload.followUp,
      vitals: draftPayload.vitals,
      diagnoses: draftPayload.diagnoses,
      medications: draftPayload.medications,
      labOrders: draftPayload.labOrders,
      procedures: draftPayload.procedures,
      careActions: draftPayload.careActions,
      status: 'completed',
    };

    setNotes(prev => [optimisticNote, ...prev.filter(item => item.id !== optimisticNote.id)]);
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
    if (isDesktopRuntime()) {
      await enqueueDesktopEntityMutation(workspace?.id || '', 'consultation', payload.appointmentId, 'complete', draftPayload as unknown as Record<string, unknown>);
    }

    try {
      const note = await completeConsultationRequest(draftPayload);
      setNotes(prev => [note, ...prev.filter(item => item.id !== note.id && item.id !== optimisticNote.id)]);
      return note;
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
      return optimisticNote;
    }
  }, [user?.id, workspace?.id]);

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
    const localPatient: Patient = {
      id: data.patientId || `patient_${crypto.randomUUID()}`,
      mrn: createOfflineMrn(patients),
      name: data.name,
      phone: data.phone,
      age: parseInt(data.age, 10) || 0,
      gender: (data.gender as Patient['gender']) || 'Male',
      cnic: data.cnic || '',
      address: data.address || '',
      bloodGroup: data.bloodGroup || '',
      emergencyContact: data.emergencyContact || '',
    };

    const localAppointment: Appointment = {
      id: `appt_${crypto.randomUUID()}`,
      patientId: localPatient.id,
      clinicId,
      doctorId: user?.id || 'doctor',
      date: today,
      time: new Date().toTimeString().slice(0, 5),
      status: 'waiting',
      type: 'new',
      chiefComplaint: data.chiefComplaint || 'Walk-in',
      tokenNumber: getAppointmentsForClinicOnDate(clinicId, today).length + 1,
    };

    if (isDesktopRuntime()) {
      setPatients(prev => [localPatient, ...prev.filter(item => item.id !== localPatient.id)]);
      setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== localAppointment.id), localAppointment]));
      await enqueueDesktopEntityMutation(workspace?.id || '', 'walk_in', localAppointment.id, 'create', {
        clinicId,
        patient: localPatient,
        appointment: localAppointment,
        chiefComplaint: data.chiefComplaint || 'Walk-in',
      });
    }

    try {
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

      setPatients(prev => [saved.patient, ...prev.filter(item => item.id !== saved.patient.id && item.id !== localPatient.id)]);
      setAppointments(prev => sortAppointments([...prev.filter(item => item.id !== saved.appointment.id && item.id !== localAppointment.id), saved.appointment]));
      return saved;
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
      return {
        patient: localPatient,
        appointment: localAppointment,
        reusedPatient: Boolean(data.patientId),
        matchedBy: data.patientId ? 'selected' : null,
      } as WalkInResult;
    }
  }, [getAppointmentsForClinicOnDate, patients, user?.id, workspace?.id]);

  const searchPatientsByPhone = useCallback(async (phone: string) => {
    if (!phone.trim()) return [];
    try {
      return await searchPatientsByPhoneRequest(phone.trim());
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
      return createOfflinePhoneSearchResults(patients, phone);
    }
  }, [patients]);

  const searchPatients = useCallback(async (query: string) => {
    if (!query.trim()) return [];
    try {
      return await searchPatientsRequest(query.trim());
    } catch (error) {
      if (!isDesktopRuntime()) throw error;
      return createOfflinePatientSearchResults(patients, query);
    }
  }, [patients]);

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
