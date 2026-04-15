import type {
  Appointment,
  ClinicalNote,
  Clinic,
  Diagnosis,
  Doctor,
  LabOrder,
  Medication,
  Patient,
  CareAction,
  Vitals,
} from '@/data/mockData';

export interface ConsultationDraft {
  appointmentId: string;
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
  careActions: CareAction[];
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
  sidebarCollapsed: boolean;
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

export interface AdminAuditLog {
  id: string;
  action: string;
  createdAt: string;
  actorUserId: string | null;
  targetUserId: string | null;
  workspaceId: string | null;
  details: Record<string, unknown>;
}

export interface MedicationCatalogEntry {
  registrationNo: string;
  brandName: string;
  genericName: string;
  companyName: string;
  strengthText: string;
  dosageForm: string;
  route: string;
}

export interface MedicationCatalogDetail extends MedicationCatalogEntry {
  rawDisplayName: string;
  genericName: string;
  companyName: string;
  source: string;
  sourceUrl: string;
}

export interface MedicationCatalogSearchResult {
  entries: MedicationCatalogEntry[];
  hasMore: boolean;
  nextCursor: number | null;
}

export interface MedicationFavorite {
  id: string;
  registrationNo: string;
  createdAt: string;
  medicine: MedicationCatalogEntry;
}

export interface MedicationPreference {
  id: string;
  medicationKey: string;
  registrationNo: string;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
}

export interface DiagnosisCatalogEntry {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ConditionLibraryEntry {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConditionLibraryPayload {
  code: string;
  name: string;
  aliases: string[];
}

export interface DiagnosisCatalogPayload {
  code: string;
  name: string;
  isActive: boolean;
}

export interface InvestigationCatalogEntry {
  id: string;
  name: string;
  category: string;
  type: 'lab' | 'radiology';
  isActive: boolean;
  defaultPriority?: 'routine' | 'urgent' | 'stat';
  defaultNotes?: string;
}

export interface InvestigationCatalogPayload {
  name: string;
  category: string;
  type: 'lab' | 'radiology';
  isActive: boolean;
}

export interface ReferralSpecialtyEntry {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ReferralSpecialtyPayload {
  name: string;
  isActive: boolean;
}

export interface ReferralFacilityEntry {
  id: string;
  name: string;
  city: string;
  phone: string;
  isActive: boolean;
}

export interface ReferralFacilityPayload {
  name: string;
  city: string;
  phone: string;
  isActive: boolean;
}

export interface TreatmentTemplateDiagnosis {
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface TreatmentTemplateMedication {
  name: string;
  nameUrdu: string;
  generic: string;
  strength: string;
  form: string;
  route: string;
  languageMode: 'en' | 'ur' | 'bilingual';
  dosePattern: string;
  frequency: string;
  frequencyUrdu: string;
  duration: string;
  durationUrdu: string;
  instructions: string;
  instructionsUrdu: string;
}

export interface TreatmentTemplateLabOrder {
  testName: string;
  category: string;
  priority: 'routine' | 'urgent' | 'stat';
}

export interface TreatmentTemplate {
  id: string;
  name: string;
  conditionLabel: string;
  chiefComplaint: string;
  instructions: string;
  followUp: string;
  diagnoses: TreatmentTemplateDiagnosis[];
  medications: TreatmentTemplateMedication[];
  labOrders: TreatmentTemplateLabOrder[];
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentTemplatePayload {
  name: string;
  conditionLabel: string;
  chiefComplaint: string;
  instructions: string;
  followUp: string;
  diagnoses: TreatmentTemplateDiagnosis[];
  medications: TreatmentTemplateMedication[];
  labOrders: TreatmentTemplateLabOrder[];
}

export interface DiagnosisSet {
  id: string;
  name: string;
  diagnoses: TreatmentTemplateDiagnosis[];
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosisSetPayload {
  name: string;
  diagnoses: TreatmentTemplateDiagnosis[];
}

export interface InvestigationSet {
  id: string;
  name: string;
  labOrders: TreatmentTemplateLabOrder[];
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationSetPayload {
  name: string;
  labOrders: TreatmentTemplateLabOrder[];
}

export interface AdviceTemplate {
  id: string;
  name: string;
  languageMode: 'en' | 'ur' | 'bilingual';
  instructions: string;
  followUp: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdviceTemplatePayload {
  name: string;
  languageMode: 'en' | 'ur' | 'bilingual';
  instructions: string;
  followUp: string;
}

export interface MedicationLibraryFavorite {
  favorite: MedicationFavorite;
  preference: MedicationPreference | null;
}

export interface WalkInResult {
  patient: Patient;
  appointment: Appointment;
  reusedPatient: boolean;
  matchedBy: 'selected' | 'cnic' | 'phone' | 'name_age' | null;
}

export interface WalkInPayload {
  clinicId: string;
  patientId?: string;
  name: string;
  phone: string;
  age: number;
  gender: Patient['gender'];
  cnic: string;
  address: string;
  bloodGroup: string;
  emergencyContact: string;
  chiefComplaint: string;
  date: string;
  time?: string;
}
