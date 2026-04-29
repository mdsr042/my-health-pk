import type {
  Appointment,
  ClinicalNote,
  Clinic,
  Diagnosis,
  Doctor,
  LabOrder,
  Medication,
  Patient,
  Procedure,
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
  procedures: Procedure[];
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

export interface DesktopBootstrapSnapshot {
  generatedAt: string;
  patients: Patient[];
  appointments: Appointment[];
  notes: ClinicalNote[];
  drafts: Record<string, ConsultationDraft>;
  clinics: Clinic[];
  settings: AppSettings | null;
  attachments?: DesktopAttachmentTransfer[];
}

export interface DesktopRuntimeInfo {
  isDesktop: boolean;
  deviceId: string;
  pinConfigured: boolean;
  locked: boolean;
  syncStatus: 'idle' | 'syncing' | 'up_to_date' | 'offline' | 'attention' | 'web';
  lastSuccessfulSyncAt: string;
  backupOverdue: boolean;
  pendingMutations: number;
  failedMutations: number;
  pendingBundles: number;
  failedBundles: number;
  completedBundles: number;
  oldestPendingAt: string;
  rebuildRequired?: boolean;
  rebuildReason?: string;
  entitlement: {
    status: 'valid' | 'valid_but_recheck_due' | 'grace' | 'restricted' | 'locked' | 'trial' | 'active' | 'suspended' | 'cancelled' | 'unknown';
    planName: string;
    trialEndsAt: string | null;
    entitlementValidUntil: string | null;
    graceDeadline: string | null;
    lastCheckedAt: string | null;
    lockMessage: string;
  } | null;
}

export interface DesktopSyncIssueSummary {
  pending: Array<{
    mutation_id: string;
    entity_type: string;
    entity_id: string;
    operation_type: string;
    created_local_at: string;
    status: string;
    retry_count: number;
    last_error_code: string;
    last_error_message: string;
  }>;
  deadLetters: Array<{
    id: string;
    mutation_id: string;
    reason_code: string;
    reason_message: string;
    created_at: string;
  }>;
  conflicts: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    conflict_type: string;
    mutation_id?: string;
    bundle_id?: string;
    details_json: string;
    local_summary?: string;
    server_summary?: string;
    local_snapshot?: Record<string, unknown> | null;
    server_snapshot?: Record<string, unknown> | null;
    server_base_version?: string;
    resolution_status?: 'pending' | 'resolved';
    chosen_action?: string;
    resolution_reason?: string;
    created_at: string;
    resolved_at: string;
  }>;
}

export interface DesktopDiagnosticsExportResult {
  ok: boolean;
  code?: string;
  message?: string;
  filePath?: string;
}

export interface DesktopPreflightReport {
  ok: boolean;
  checks: Array<{
    check: string;
    ok: boolean;
    message: string;
  }>;
}

export interface DesktopAttachmentTransfer {
  id: string;
  attachmentId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  patientId?: string;
  appointmentId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  localPath: string;
  remoteKey?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed' | 'retryable';
  createdAt?: string;
  updatedAt?: string;
}

export interface DesktopOutboxMutation {
  mutationId: string;
  bundleId: string;
  bundleType: 'patient_master' | 'encounter' | 'attachment_metadata' | 'mutation';
  rootEntityId: string;
  deviceId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  baseVersion?: string;
  createdLocalAt?: string;
  status?: string;
  retryCount?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  nextRetryAt?: string;
  processedAt?: string;
}

export interface DesktopSyncBundle {
  bundleId: string;
  bundleType: DesktopOutboxMutation['bundleType'];
  rootEntityId: string;
  deviceId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  status?: 'pending' | 'syncing' | 'completed' | 'retryable' | 'conflict' | 'dead_letter';
  itemCount?: number;
  committedItemCount?: number;
  createdAt?: string;
  mutations: DesktopOutboxMutation[];
}

export interface DesktopSyncBundleResult {
  bundleId: string;
  bundleType: DesktopOutboxMutation['bundleType'] | string;
  rootEntityId: string;
  status: 'accepted' | 'accepted_already_processed' | 'conflict' | 'validation_rejected' | 'permission_rejected' | 'entitlement_rejected' | 'retryable_failure';
  committedMutationCount: number;
  canonicalBundle?: Record<string, unknown> | null;
  serverSnapshot?: Record<string, unknown> | null;
  localSnapshot?: Record<string, unknown> | null;
  serverBaseVersion?: string;
  conflictType?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DesktopSyncMutationResult {
  mutationId: string;
  bundleId?: string;
  status: 'accepted' | 'accepted_already_processed' | 'conflict' | 'validation_rejected' | 'permission_rejected' | 'entitlement_rejected' | 'retryable_failure';
  entityType: string;
  entityId: string;
  canonicalEntity?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  localSnapshot?: Record<string, unknown> | null;
  serverSnapshot?: Record<string, unknown> | null;
  serverBaseVersion?: string;
  conflictType?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DesktopSyncPullChanges {
  patients: Patient[];
  appointments: Appointment[];
  drafts: Record<string, ConsultationDraft>;
  notes: ClinicalNote[];
  attachments: DesktopAttachmentTransfer[];
}

export interface DesktopSyncCompatibility {
  apiVersion: string;
  mode: 'additive';
  requiredMinDesktopVersion: string;
  clientVersion: string;
  compatible: boolean;
  reason: string;
}

export interface DesktopSyncPullResult {
  apiVersion?: string;
  compatibility?: DesktopSyncCompatibility;
  serverTime?: string;
  checkpoint: string;
  changes: DesktopSyncPullChanges;
  entitlement: DesktopRuntimeInfo['entitlement'];
  checkpointStatus?: 'ok' | 'unknown_checkpoint' | 'expired_checkpoint' | 'rebuild_required';
  rebuildRequired?: boolean;
  snapshot?: DesktopBootstrapSnapshot | null;
}

export interface DesktopDeviceRegistrationPayload {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
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
  qualifications?: string;
  notes?: string;
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

export interface AdminPatientRecord {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  age: number;
  gender: Patient['gender'];
  cnic: string;
  address: string;
  bloodGroup: string;
  emergencyContact: string;
  workspace: {
    id: string;
    name: string;
    city: string;
  };
  doctor: {
    id: string;
    name: string;
    email: string;
  };
  lastClinic: {
    id: string;
    name: string;
  } | null;
  totalAppointments: number;
  lastAppointmentDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDoctorProfileUpdatePayload {
  email: string;
  fullName: string;
  phone: string;
  pmcNumber: string;
  specialization: string;
  qualifications: string;
  notes: string;
  workspaceName: string;
  workspaceCity: string;
}

export interface AdminClinicRecord {
  id: string;
  name: string;
  location: string;
  city: string;
  phone: string;
  timings: string;
  specialties: string[];
  logo: string;
  isActive: boolean;
  workspace: {
    id: string;
    name: string;
    city: string;
  };
  doctor: {
    id: string;
    name: string;
  };
  patientCount: number;
  appointmentCount: number;
  recentAppointmentDate: string | null;
}

export interface AdminClinicUpdatePayload {
  name: string;
  location: string;
  city: string;
  phone: string;
  timings: string;
  specialties: string[];
  logo: string;
  isActive: boolean;
}

export interface AdminPatientUpdatePayload {
  name: string;
  phone: string;
  age: number;
  gender: Patient['gender'];
  cnic: string;
  address: string;
  bloodGroup: string;
  emergencyContact: string;
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

export type AdminOfflineSyncHealth = 'healthy' | 'attention' | 'offline' | 'inactive';

export interface AdminOfflineDoctorStat {
  doctor: {
    id: string;
    name: string;
    email: string;
  };
  workspace: {
    id: string;
    name: string;
    city: string;
  };
  devices: {
    total: number;
    active: number;
    revoked: number;
    lastSeenAt: string | null;
  };
  sync: {
    lastBundleProcessedAt: string | null;
    lastMutationProcessedAt: string | null;
    lastSyncedAt: string | null;
    bundlesProcessed: number;
    mutationsProcessed: number;
  };
  outcomes: {
    conflicts: number;
    retryableFailures: number;
    validationRejected: number;
    permissionRejected: number;
    entitlementRejected: number;
    accepted: number;
    acceptedAlreadyProcessed: number;
  };
  deviceEntries: Array<{
    deviceId: string;
    deviceName: string;
    platform: string;
    appVersion: string;
    status: 'active' | 'revoked' | string;
    lastSeenAt: string | null;
    revokedAt: string | null;
  }>;
  health: AdminOfflineSyncHealth;
}

export interface AdminOfflineSyncStats {
  generatedAt: string;
  rollout: {
    decision: 'GO' | 'NO_GO';
    reasons: string[];
    thresholds: {
      conflicts: number;
      retryableFailures: number;
      doctorsWithAttention: number;
      doctorsOffline: number;
    };
  };
  summary: {
    doctors: number;
    workspaces: number;
    totalDevices: number;
    activeDevices: number;
    revokedDevices: number;
    doctorsWithConflicts: number;
    doctorsWithAttention: number;
    doctorsOffline: number;
    bundlesProcessed: number;
    mutationsProcessed: number;
    conflicts: number;
    retryableFailures: number;
    validationRejected: number;
    permissionRejected: number;
    entitlementRejected: number;
    accepted: number;
    acceptedAlreadyProcessed: number;
    lastSyncedAt: string | null;
  };
  doctors: AdminOfflineDoctorStat[];
}

export interface MedicationCatalogEntry {
  registrationNo: string;
  brandName: string;
  genericName: string;
  companyName: string;
  strengthText: string;
  dosageForm: string;
  route: string;
  sourceType?: 'drap' | 'custom';
  customMedicationId?: string;
}

export interface MedicationCatalogDetail extends MedicationCatalogEntry {
  rawDisplayName: string;
  genericName: string;
  companyName: string;
  source: string;
  sourceUrl: string;
  detailAvailability: 'base_only' | 'enriched';
  enrichmentStatus: 'missing' | 'partial' | 'complete';
  sourceUpdatedAt: string | null;
  enrichment: MedicationCatalogEnrichment | null;
}

export interface MedicationCatalogEnrichment {
  registrationNo: string;
  lookupKey: string;
  therapeuticCategory: string;
  drugCategory: string;
  tradePrice: string;
  packInfo: string;
  indications: string;
  dosage: string;
  administration: string;
  contraindications: string;
  precautions: string;
  adverseEffects: string;
  alternativesSummary: string;
  sourceName: string;
  sourceUpdatedAt: string | null;
  enrichmentStatus: 'missing' | 'partial' | 'complete';
}

export interface MedicationEnrichmentImportItem {
  registrationNo: string;
  brandName: string;
  genericName: string;
  strengthText: string;
  dosageForm: string;
  therapeuticCategory: string;
  drugCategory: string;
  tradePrice: string;
  packInfo: string;
  indications: string;
  dosage: string;
  administration: string;
  contraindications: string;
  precautions: string;
  adverseEffects: string;
  alternativesSummary: string;
  sourceName: string;
  sourceUpdatedAt: string | null;
  enrichmentStatus: 'missing' | 'partial' | 'complete';
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

export interface ProcedureLibraryEntry {
  id: string;
  name: string;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureLibraryPayload {
  name: string;
  category: string;
  notes: string;
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
  injectionRouteType?: 'IM' | 'IV' | 'SC' | '';
  languageMode: 'en' | 'ur' | 'bilingual';
  dosePattern: string;
  prescriptionLine?: string;
  prescriptionLineUrdu?: string;
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
  matchedBy: 'selected' | null;
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
