import type {
  Appointment,
  ClinicalNote,
  Clinic,
  Diagnosis,
  LabOrder,
  Medication,
  Patient,
  Vitals,
} from '@/data/mockData';

export interface ConsultationDraft {
  patientId: string;
  clinicId: string;
  chiefComplaint: string;
  hpi: string;
  pastHistory: string;
  allergies: string;
  examination: string;
  assessment: string;
  plan: string;
  instructions: string;
  followUp: string;
  vitals: Vitals;
  diagnoses: Diagnosis[];
  medications: Medication[];
  labOrders: LabOrder[];
  savedAt: string;
}

export interface AppStateSnapshot {
  patients: Patient[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  drafts: Record<string, ConsultationDraft>;
}

export interface ClinicOverride {
  name: string;
  location: string;
  city: string;
  phone: string;
  timings: string;
  specialties: Clinic['specialties'];
  logo: string;
}

export interface AppSettings {
  notifications: boolean;
  soundAlerts: boolean;
  autoSave: boolean;
  language: string;
  prescriptionLang: string;
  theme: string;
  compactMode: boolean;
  clinicOverrides: Record<Clinic['id'], ClinicOverride>;
  managedClinics: Clinic[];
}
