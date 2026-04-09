import type {
  Appointment,
  ClinicalNote,
  Clinic,
  Diagnosis,
  Doctor,
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

export type PlatformRole = 'platform_admin' | 'doctor_owner';
export type AccountStatus = 'pending' | 'active' | 'rejected' | 'suspended';
export type WorkspaceStatus = 'pending' | 'active' | 'rejected' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

export interface AuthUser {
  id: string;
  email: string;
  role: PlatformRole;
  status: AccountStatus;
  isDemo?: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  city: string;
  status: WorkspaceStatus;
  subscription?: {
    planName: string;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
  } | null;
}

export interface DoctorSessionProfile extends Doctor {}

export interface SessionPayload {
  user: AuthUser;
  doctor: DoctorSessionProfile | null;
  workspace: WorkspaceSummary | null;
  clinics: Clinic[];
  settings: AppSettings | null;
}

export interface SignupPayload {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  pmcNumber: string;
  specialization: string;
  qualifications: string;
  clinicName: string;
  city: string;
  notes: string;
}

export interface ApprovalRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  clinicName: string;
  city: string;
  notes: string;
  rejectionReason: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    status: AccountStatus;
  };
  doctor: {
    name: string;
    phone: string;
    pmcNumber: string;
    specialization: string;
  };
  workspace: {
    id: string;
    name: string;
  };
}

export interface AdminDoctorAccount {
  id: string;
  email: string;
  status: AccountStatus;
  name: string;
  phone: string;
  pmcNumber: string;
  specialization: string;
  workspace: {
    id: string;
    name: string;
    city: string;
    status: WorkspaceStatus;
  };
  subscription: {
    planName: string;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
  };
  usage: {
    clinics: number;
    patients: number;
    appointments: number;
  };
}

export interface AdminOverview {
  pendingApprovals: number;
  activeDoctors: number;
  suspendedDoctors: number;
  workspaces: number;
  clinics: number;
  patients: number;
  appointments: number;
}
