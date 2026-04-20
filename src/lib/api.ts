import type {
  AdminDoctorAccount,
  AdminAuditLog,
  AdminOverview,
  AdviceTemplate,
  AdviceTemplatePayload,
  ApprovalRequest,
  AppSettings,
  ConditionLibraryEntry,
  ConditionLibraryPayload,
  ConsultationDraft,
  DiagnosisCatalogPayload,
  DiagnosisSet,
  DiagnosisCatalogEntry,
  DiagnosisSetPayload,
  InvestigationCatalogEntry,
  InvestigationCatalogPayload,
  InvestigationSet,
  InvestigationSetPayload,
  MedicationCatalogEntry,
  MedicationCatalogDetail,
  MedicationCatalogSearchResult,
  MedicationFavorite,
  MedicationLibraryFavorite,
  MedicationPreference,
  ProcedureLibraryEntry,
  ProcedureLibraryPayload,
  SessionPayload,
  SignupPayload,
  ReferralFacilityEntry,
  ReferralFacilityPayload,
  ReferralSpecialtyEntry,
  ReferralSpecialtyPayload,
  TreatmentTemplate,
  TreatmentTemplatePayload,
  WalkInPayload,
  WalkInResult,
} from '@/lib/app-types';
import type { Appointment, CareAction, Clinic, ClinicalNote, Patient } from '@/data/mockData';

const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'my-health/auth-token';
const AUTH_SESSION_TOKEN_KEY = 'my-health/auth-token-session';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getStoredAuthToken() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(AUTH_SESSION_TOKEN_KEY)
    ?? window.localStorage.getItem(AUTH_TOKEN_KEY)
    ?? '';
}

export function setStoredAuthToken(token: string, mode: 'persistent' | 'session' = 'persistent') {
  if (typeof window === 'undefined') return;
  if (mode === 'session') {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.sessionStorage.setItem(AUTH_SESSION_TOKEN_KEY, token);
    return;
  }

  window.sessionStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(body.error || `API request failed: ${response.status}`, response.status, body.code);
  }

  return body as T;
}

export async function signupDoctor(payload: SignupPayload) {
  return request<{ ok: true; message: string }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginWithPassword(email: string, password: string) {
  return request<{ token: string; session: SessionPayload }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function createDemoSession() {
  return request<{ token: string; session: SessionPayload }>('/auth/demo', {
    method: 'POST',
  });
}

export async function fetchCurrentSession() {
  const result = await request<{ data: SessionPayload }>('/auth/me');
  return result.data;
}

export async function logoutSession() {
  await request<{ ok: true }>('/auth/logout', { method: 'POST' });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await request<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchClinics() {
  const result = await request<{ data: Clinic[] }>('/clinics');
  return result.data;
}

export async function createClinic(payload: Omit<Clinic, 'id'>) {
  const result = await request<{ data: Clinic }>('/clinics', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateClinic(clinicId: string, payload: Omit<Clinic, 'id'>) {
  const result = await request<{ data: Clinic }>(`/clinics/${clinicId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function fetchPatients() {
  const result = await request<{ data: Patient[] }>('/patients');
  return result.data;
}

export async function createPatient(patient: Patient) {
  const result = await request<{ data: Patient }>('/patients', {
    method: 'POST',
    body: JSON.stringify(patient),
  });
  return result.data;
}

export async function updatePatient(patient: Patient) {
  const result = await request<{ data: Patient }>(`/patients/${patient.id}`, {
    method: 'PUT',
    body: JSON.stringify(patient),
  });
  return result.data;
}

export async function searchPatients(query: string) {
  const result = await request<{ data: Patient[] }>(`/patients/search?q=${encodeURIComponent(query)}`);
  return result.data;
}

export async function fetchAppointments() {
  const result = await request<{ data: Appointment[] }>('/appointments');
  return result.data;
}

export async function createAppointment(appointment: Appointment) {
  const result = await request<{ data: Appointment }>('/appointments', {
    method: 'POST',
    body: JSON.stringify(appointment),
  });
  return result.data;
}

export async function updateAppointment(appointment: Appointment) {
  const result = await request<{ data: Appointment }>(`/appointments/${appointment.id}`, {
    method: 'PUT',
    body: JSON.stringify(appointment),
  });
  return result.data;
}

export async function updateAppointmentStatus(appointmentId: string, status: Appointment['status']) {
  await request<{ ok: true }>(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchDrafts() {
  const result = await request<{ data: Record<string, ConsultationDraft> }>('/consultation-drafts');
  return result.data;
}

export async function persistDraft(appointmentId: string, payload: ConsultationDraft) {
  await request<{ ok: true }>(`/consultation-drafts/${appointmentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchClinicalNotes(patientId?: string) {
  const path = patientId ? `/clinical-notes?patientId=${encodeURIComponent(patientId)}` : '/clinical-notes';
  const result = await request<{ data: ClinicalNote[] }>(path);
  return result.data;
}

export async function completeConsultation(payload: ConsultationDraft) {
  const result = await request<{ data: ClinicalNote }>('/consultations/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function searchPatientsByPhone(phone: string) {
  const result = await request<{ data: Patient[] }>(`/patients/search-by-phone?phone=${encodeURIComponent(phone)}`);
  return result.data;
}

export async function createWalkIn(payload: WalkInPayload) {
  const result = await request<{ data: WalkInResult }>('/walk-ins', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function fetchSettings() {
  const result = await request<{ data: AppSettings | null }>('/settings');
  return result.data;
}

export async function persistSettings(settings: AppSettings) {
  await request<{ ok: true }>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function fetchAdminOverview() {
  const result = await request<{ data: AdminOverview }>('/admin/overview');
  return result.data;
}

export async function fetchApprovalRequests() {
  const result = await request<{ data: ApprovalRequest[] }>('/admin/approval-requests');
  return result.data;
}

export async function fetchAdminAuditLogs() {
  const result = await request<{ data: AdminAuditLog[] }>('/admin/audit-logs');
  return result.data;
}

export async function searchMedicationCatalog(query: string, limit = 20, cursor = 0) {
  const result = await request<{ data: MedicationCatalogEntry[]; meta: { hasMore: boolean; nextCursor: number | null } }>(
    `/medication-catalog?q=${encodeURIComponent(query)}&limit=${limit}&cursor=${cursor}`
  );
  return {
    entries: result.data,
    hasMore: result.meta.hasMore,
    nextCursor: result.meta.nextCursor,
  } satisfies MedicationCatalogSearchResult;
}

export async function fetchMedicationCatalogDetail(registrationNo: string) {
  const result = await request<{ data: MedicationCatalogDetail }>(`/medication-catalog/${encodeURIComponent(registrationNo)}`);
  return result.data;
}

export async function saveCustomMedication(payload: {
  name: string;
  generic: string;
  strength: string;
  form: string;
  route: string;
}) {
  const result = await request<{ data: MedicationCatalogEntry }>('/custom-medications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function fetchMedicationFavorites() {
  const result = await request<{ data: MedicationFavorite[] }>('/medication-favorites');
  return result.data;
}

export async function fetchMedicationLibraryFavorites() {
  const [favorites, preferences] = await Promise.all([fetchMedicationFavorites(), fetchMedicationPreferences()]);
  return favorites.map(favorite => ({
    favorite,
    preference: preferences.find(item => item.registrationNo === favorite.registrationNo) ?? null,
  })) satisfies MedicationLibraryFavorite[];
}

export async function addMedicationFavorite(registrationNo: string) {
  const result = await request<{ data: MedicationFavorite }>('/medication-favorites', {
    method: 'POST',
    body: JSON.stringify({ registrationNo }),
  });
  return result.data;
}

export async function removeMedicationFavorite(registrationNo: string) {
  await request<{ ok: true }>(`/medication-favorites/${encodeURIComponent(registrationNo)}`, {
    method: 'DELETE',
  });
}

export async function fetchMedicationPreferences() {
  const result = await request<{ data: MedicationPreference[] }>('/medication-preferences');
  return result.data;
}

export async function searchDiagnosisCatalog(query: string, limit = 20) {
  const result = await request<{ data: DiagnosisCatalogEntry[] }>(`/diagnosis-catalog?q=${encodeURIComponent(query)}&limit=${limit}`);
  return result.data;
}

export async function fetchConditionLibrary(query = '', limit = 100) {
  const result = await request<{ data: ConditionLibraryEntry[] }>(`/condition-library?q=${encodeURIComponent(query)}&limit=${limit}`);
  return result.data;
}

export async function createConditionLibraryEntry(payload: ConditionLibraryPayload) {
  const result = await request<{ data: ConditionLibraryEntry }>('/condition-library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateConditionLibraryEntry(id: string, payload: ConditionLibraryPayload) {
  const result = await request<{ data: ConditionLibraryEntry }>(`/condition-library/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteConditionLibraryEntry(id: string) {
  await request<{ ok: true }>(`/condition-library/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchFavoriteDiagnoses() {
  const result = await request<{ data: DiagnosisCatalogEntry[] }>('/diagnosis-catalog/favorites');
  return result.data;
}

export async function fetchRecentDiagnoses() {
  const result = await request<{ data: DiagnosisCatalogEntry[] }>('/diagnosis-catalog/recents');
  return result.data;
}

export async function addFavoriteDiagnosis(catalogId: string) {
  await request<{ ok: true }>('/diagnosis-catalog/favorites', {
    method: 'POST',
    body: JSON.stringify({ catalogId }),
  });
}

export async function removeFavoriteDiagnosis(catalogId: string) {
  await request<{ ok: true }>(`/diagnosis-catalog/favorites/${encodeURIComponent(catalogId)}`, {
    method: 'DELETE',
  });
}

export async function searchInvestigationCatalog(query: string, type: 'lab' | 'radiology', limit = 20) {
  const result = await request<{ data: InvestigationCatalogEntry[] }>(`/investigation-catalog?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
  return result.data;
}

export async function fetchFavoriteInvestigations(type: 'lab' | 'radiology') {
  const result = await request<{ data: InvestigationCatalogEntry[] }>(`/investigation-catalog/favorites?type=${type}`);
  return result.data;
}

export async function fetchRecentInvestigations(type: 'lab' | 'radiology') {
  const result = await request<{ data: InvestigationCatalogEntry[] }>(`/investigation-catalog/recents?type=${type}`);
  return result.data;
}

export async function recordRecentInvestigation(payload: {
  name: string;
  category: string;
  type: 'lab' | 'radiology';
  priority: 'routine' | 'urgent' | 'stat';
  notes: string;
}) {
  await request<{ ok: true }>('/investigation-catalog/recents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function addFavoriteInvestigation(catalogId: string) {
  await request<{ ok: true }>('/investigation-catalog/favorites', {
    method: 'POST',
    body: JSON.stringify({ catalogId }),
  });
}

export async function removeFavoriteInvestigation(catalogId: string) {
  await request<{ ok: true }>(`/investigation-catalog/favorites/${encodeURIComponent(catalogId)}`, {
    method: 'DELETE',
  });
}

export async function searchReferralSpecialties(query: string, limit = 20) {
  const result = await request<{ data: ReferralSpecialtyEntry[] }>(`/referral-specialties?q=${encodeURIComponent(query)}&limit=${limit}`);
  return result.data;
}

export async function fetchFavoriteReferralSpecialties() {
  const result = await request<{ data: ReferralSpecialtyEntry[] }>('/referral-specialties/favorites');
  return result.data;
}

export async function fetchRecentReferralSpecialties() {
  const result = await request<{ data: ReferralSpecialtyEntry[] }>('/referral-specialties/recents');
  return result.data;
}

export async function addFavoriteReferralSpecialty(targetId: string) {
  await request<{ ok: true }>('/referral-specialties/favorites', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function removeFavoriteReferralSpecialty(targetId: string) {
  await request<{ ok: true }>(`/referral-specialties/favorites/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
  });
}

export async function searchReferralFacilities(query: string, limit = 20) {
  const result = await request<{ data: ReferralFacilityEntry[] }>(`/referral-facilities?q=${encodeURIComponent(query)}&limit=${limit}`);
  return result.data;
}

export async function fetchFavoriteReferralFacilities() {
  const result = await request<{ data: ReferralFacilityEntry[] }>('/referral-facilities/favorites');
  return result.data;
}

export async function fetchRecentReferralFacilities() {
  const result = await request<{ data: ReferralFacilityEntry[] }>('/referral-facilities/recents');
  return result.data;
}

export async function addFavoriteReferralFacility(targetId: string) {
  await request<{ ok: true }>('/referral-facilities/favorites', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function removeFavoriteReferralFacility(targetId: string) {
  await request<{ ok: true }>(`/referral-facilities/favorites/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
  });
}

export async function createCareAction(payload: {
  appointmentId: string;
  patientId: string;
  clinicId: string;
  type: 'referral' | 'admission' | 'followup';
  targetType: 'specialty' | 'facility' | 'date';
  targetId: string;
  title: string;
  notes: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  actionDate: string;
}) {
  const result = await request<{ data: CareAction }>('/care-actions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function saveMedicationPreference(payload: {
  medicationKey: string;
  registrationNo?: string;
  payload: Record<string, unknown>;
}) {
  const result = await request<{ data: MedicationPreference }>('/medication-preferences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function fetchTreatmentTemplates() {
  const result = await request<{ data: TreatmentTemplate[] }>('/treatment-templates');
  return result.data;
}

export async function createTreatmentTemplate(payload: TreatmentTemplatePayload) {
  const result = await request<{ data: TreatmentTemplate }>('/treatment-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function importStarterTreatmentTemplates() {
  const result = await request<{ data: TreatmentTemplate[] }>('/treatment-templates/import-starters', {
    method: 'POST',
  });
  return result.data;
}

export async function updateTreatmentTemplate(templateId: string, payload: TreatmentTemplatePayload) {
  const result = await request<{ data: TreatmentTemplate }>(`/treatment-templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteTreatmentTemplate(templateId: string) {
  await request<{ ok: true }>(`/treatment-templates/${templateId}`, {
    method: 'DELETE',
  });
}

export async function fetchDiagnosisSets() {
  const result = await request<{ data: DiagnosisSet[] }>('/diagnosis-sets');
  return result.data;
}

export async function createDiagnosisSet(payload: DiagnosisSetPayload) {
  const result = await request<{ data: DiagnosisSet }>('/diagnosis-sets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateDiagnosisSet(id: string, payload: DiagnosisSetPayload) {
  const result = await request<{ data: DiagnosisSet }>(`/diagnosis-sets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteDiagnosisSet(id: string) {
  await request<{ ok: true }>(`/diagnosis-sets/${id}`, { method: 'DELETE' });
}

export async function fetchInvestigationSets() {
  const result = await request<{ data: InvestigationSet[] }>('/investigation-sets');
  return result.data;
}

export async function createInvestigationSet(payload: InvestigationSetPayload) {
  const result = await request<{ data: InvestigationSet }>('/investigation-sets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateInvestigationSet(id: string, payload: InvestigationSetPayload) {
  const result = await request<{ data: InvestigationSet }>(`/investigation-sets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteInvestigationSet(id: string) {
  await request<{ ok: true }>(`/investigation-sets/${id}`, { method: 'DELETE' });
}

export async function fetchAdviceTemplates() {
  const result = await request<{ data: AdviceTemplate[] }>('/advice-templates');
  return result.data;
}

export async function createAdviceTemplate(payload: AdviceTemplatePayload) {
  const result = await request<{ data: AdviceTemplate }>('/advice-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateAdviceTemplate(id: string, payload: AdviceTemplatePayload) {
  const result = await request<{ data: AdviceTemplate }>(`/advice-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteAdviceTemplate(id: string) {
  await request<{ ok: true }>(`/advice-templates/${id}`, { method: 'DELETE' });
}

export async function fetchProcedureLibrary(query = '', limit = 100) {
  const result = await request<{ data: ProcedureLibraryEntry[] }>(`/procedure-library?q=${encodeURIComponent(query)}&limit=${limit}`);
  return result.data;
}

export async function createProcedureLibraryEntry(payload: ProcedureLibraryPayload) {
  const result = await request<{ data: ProcedureLibraryEntry }>('/procedure-library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function approveDoctor(approvalRequestId: string) {
  await request<{ ok: true }>(`/admin/approval-requests/${approvalRequestId}/approve`, {
    method: 'POST',
  });
}

export async function rejectDoctor(approvalRequestId: string, reason: string) {
  await request<{ ok: true }>(`/admin/approval-requests/${approvalRequestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function fetchAdminDoctors() {
  const result = await request<{ data: AdminDoctorAccount[] }>('/admin/doctors');
  return result.data;
}

export async function updateDoctorAccountStatus(doctorId: string, status: 'active' | 'suspended') {
  await request<{ ok: true }>(`/admin/doctors/${doctorId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function resetDoctorPassword(doctorId: string, newPassword: string) {
  await request<{ ok: true }>(`/admin/doctors/${doctorId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export async function updateWorkspaceSubscription(
  workspaceId: string,
  payload: { planName: string; status: 'trial' | 'active' | 'suspended' | 'cancelled'; trialEndsAt: string | null }
) {
  await request<{ ok: true }>(`/admin/workspaces/${workspaceId}/subscription`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminDiagnosisCatalog() {
  const result = await request<{ data: DiagnosisCatalogEntry[] }>('/admin/diagnosis-catalog');
  return result.data;
}

export async function createAdminDiagnosisCatalogEntry(payload: DiagnosisCatalogPayload) {
  const result = await request<{ data: DiagnosisCatalogEntry }>('/admin/diagnosis-catalog', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateAdminDiagnosisCatalogEntry(id: string, payload: DiagnosisCatalogPayload) {
  const result = await request<{ data: DiagnosisCatalogEntry }>(`/admin/diagnosis-catalog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteAdminDiagnosisCatalogEntry(id: string) {
  await request<{ ok: true }>(`/admin/diagnosis-catalog/${id}`, { method: 'DELETE' });
}

export async function fetchAdminInvestigationCatalog() {
  const result = await request<{ data: InvestigationCatalogEntry[] }>('/admin/investigation-catalog');
  return result.data;
}

export async function createAdminInvestigationCatalogEntry(payload: InvestigationCatalogPayload) {
  const result = await request<{ data: InvestigationCatalogEntry }>('/admin/investigation-catalog', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateAdminInvestigationCatalogEntry(id: string, payload: InvestigationCatalogPayload) {
  const result = await request<{ data: InvestigationCatalogEntry }>(`/admin/investigation-catalog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteAdminInvestigationCatalogEntry(id: string) {
  await request<{ ok: true }>(`/admin/investigation-catalog/${id}`, { method: 'DELETE' });
}

export async function fetchAdminReferralSpecialties() {
  const result = await request<{ data: ReferralSpecialtyEntry[] }>('/admin/referral-specialties');
  return result.data;
}

export async function createAdminReferralSpecialty(payload: ReferralSpecialtyPayload) {
  const result = await request<{ data: ReferralSpecialtyEntry }>('/admin/referral-specialties', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateAdminReferralSpecialty(id: string, payload: ReferralSpecialtyPayload) {
  const result = await request<{ data: ReferralSpecialtyEntry }>(`/admin/referral-specialties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteAdminReferralSpecialty(id: string) {
  await request<{ ok: true }>(`/admin/referral-specialties/${id}`, { method: 'DELETE' });
}

export async function fetchAdminReferralFacilities() {
  const result = await request<{ data: ReferralFacilityEntry[] }>('/admin/referral-facilities');
  return result.data;
}

export async function createAdminReferralFacility(payload: ReferralFacilityPayload) {
  const result = await request<{ data: ReferralFacilityEntry }>('/admin/referral-facilities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateAdminReferralFacility(id: string, payload: ReferralFacilityPayload) {
  const result = await request<{ data: ReferralFacilityEntry }>(`/admin/referral-facilities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function deleteAdminReferralFacility(id: string) {
  await request<{ ok: true }>(`/admin/referral-facilities/${id}`, { method: 'DELETE' });
}
