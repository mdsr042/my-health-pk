import type {
  AdminDoctorAccount,
  AdminAuditLog,
  AdminOverview,
  ApprovalRequest,
  AppSettings,
  ConsultationDraft,
  SessionPayload,
  SignupPayload,
} from '@/lib/app-types';
import type { Appointment, Clinic, ClinicalNote, Patient } from '@/data/mockData';

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

export async function createWalkIn(payload: {
  clinicId: string;
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
}) {
  const result = await request<{ data: { patient: Patient; appointment: Appointment } }>('/walk-ins', {
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

export async function updateWorkspaceSubscription(
  workspaceId: string,
  payload: { planName: string; status: 'trial' | 'active' | 'suspended' | 'cancelled'; trialEndsAt: string | null }
) {
  await request<{ ok: true }>(`/admin/workspaces/${workspaceId}/subscription`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
