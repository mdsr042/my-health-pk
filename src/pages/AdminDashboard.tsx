import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  approveDoctor,
  createAdminDiagnosisCatalogEntry,
  createAdminInvestigationCatalogEntry,
  createAdminReferralFacility,
  createAdminReferralSpecialty,
  deleteAdminDiagnosisCatalogEntry,
  deleteAdminInvestigationCatalogEntry,
  deleteAdminReferralFacility,
  deleteAdminReferralSpecialty,
  fetchAdminAuditLogs,
  fetchAdminClinics,
  fetchAdminDiagnosisCatalog,
  fetchAdminDoctorPatients,
  fetchAdminDoctors,
  fetchAdminInvestigationCatalog,
  fetchAdminOfflineSyncStats,
  fetchAdminOverview,
  fetchAdminPatients,
  fetchAdminReferralFacilities,
  fetchAdminReferralSpecialties,
  fetchApprovalRequests,
  rejectDoctor,
  revokeAdminOfflineDevice,
  resetDoctorPassword,
  updateAdminClinic,
  updateAdminDoctorProfile,
  updateAdminPatient,
  updateAdminDiagnosisCatalogEntry,
  updateAdminInvestigationCatalogEntry,
  updateAdminReferralFacility,
  updateAdminReferralSpecialty,
  updateDoctorAccountStatus,
  updateWorkspaceSubscription,
} from '@/lib/api';
import type {
  AdminAuditLog,
  AdminClinicRecord,
  AdminClinicUpdatePayload,
  AdminDoctorAccount,
  AdminOfflineDoctorStat,
  AdminOfflineSyncStats,
  AdminDoctorProfileUpdatePayload,
  AdminOverview,
  AdminPatientRecord,
  AdminPatientUpdatePayload,
  ApprovalRequest,
  DiagnosisCatalogEntry,
  DiagnosisCatalogPayload,
  InvestigationCatalogEntry,
  InvestigationCatalogPayload,
  ReferralFacilityEntry,
  ReferralFacilityPayload,
  ReferralSpecialtyEntry,
  ReferralSpecialtyPayload,
} from '@/lib/app-types';
import { ActivitySquare, ArrowRightLeft, Building2, ClipboardCheck, FlaskConical, HardDriveDownload, MapPinned, ShieldCheck, Stethoscope, Users } from 'lucide-react';

type AdminView = 'overview' | 'doctors' | 'patients' | 'clinics' | 'approvals' | 'subscriptions' | 'offline' | 'catalogs' | 'audit';

const emptyOverview: AdminOverview = {
  pendingApprovals: 0,
  activeDoctors: 0,
  suspendedDoctors: 0,
  workspaces: 0,
  clinics: 0,
  patients: 0,
  appointments: 0,
};

const emptyDiagnosisDraft: DiagnosisCatalogPayload = {
  code: '',
  name: '',
  isActive: true,
};

const emptyInvestigationDraft: InvestigationCatalogPayload = {
  name: '',
  category: '',
  type: 'lab',
  isActive: true,
};

const emptyReferralSpecialtyDraft: ReferralSpecialtyPayload = {
  name: '',
  isActive: true,
};

const emptyReferralFacilityDraft: ReferralFacilityPayload = {
  name: '',
  city: '',
  phone: '',
  isActive: true,
};

const adminViews: Array<{ key: AdminView; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'patients', label: 'Patients' },
  { key: 'clinics', label: 'Clinics' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'offline', label: 'Doctor Sync' },
  { key: 'catalogs', label: 'Catalogs' },
  { key: 'audit', label: 'Audit' },
];

function formatStatusLabel(value: string) {
  return value
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateLabel(value: string | null) {
  if (!value) return 'No visits yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTimeLabel(value: string | null, fallback = 'Never synced') {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-PK', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAuditLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatAuditValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || typeof value === 'undefined' || value === '') return 'N/A';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function getAccountStatusBadgeClass(status: AdminDoctorAccount['status'] | ApprovalRequest['status']) {
  switch (status) {
    case 'active':
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'rejected':
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function getSubscriptionStatusBadgeClass(status: AdminDoctorAccount['subscription']['status']) {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'trial':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'cancelled':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function getClinicStatusBadgeClass(isActive: boolean) {
  return isActive
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-100 text-slate-700';
}

function getOfflineHealthBadgeClass(health: AdminOfflineDoctorStat['health']) {
  switch (health) {
    case 'healthy':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'attention':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'offline':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'inactive':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function getRolloutDecisionBadgeClass(decision: 'GO' | 'NO_GO') {
  return decision === 'GO'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

function getPatientActivity(record: AdminPatientRecord) {
  if (record.totalAppointments === 0) {
    return {
      label: 'New',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  if (record.lastAppointmentDate) {
    const lastVisit = new Date(record.lastAppointmentDate);
    const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 30) {
      return {
        label: 'Recent',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    }
  }

  return {
    label: 'Inactive',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  };
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [doctors, setDoctors] = useState<AdminDoctorAccount[]>([]);
  const [patients, setPatients] = useState<AdminPatientRecord[]>([]);
  const [clinics, setClinics] = useState<AdminClinicRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [offlineStats, setOfflineStats] = useState<AdminOfflineSyncStats | null>(null);
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<DiagnosisCatalogEntry[]>([]);
  const [investigationCatalog, setInvestigationCatalog] = useState<InvestigationCatalogEntry[]>([]);
  const [referralSpecialties, setReferralSpecialties] = useState<ReferralSpecialtyEntry[]>([]);
  const [referralFacilities, setReferralFacilities] = useState<ReferralFacilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [adminView, setAdminView] = useState<AdminView>('overview');

  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [doctorStatusFilter, setDoctorStatusFilter] = useState('all');
  const [doctorSubscriptionFilter, setDoctorSubscriptionFilter] = useState('all');
  const [doctorWorkspaceFilter, setDoctorWorkspaceFilter] = useState('all');
  const [doctorCityFilter, setDoctorCityFilter] = useState('all');

  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientWorkspaceFilter, setPatientWorkspaceFilter] = useState('all');
  const [patientDoctorFilter, setPatientDoctorFilter] = useState('all');
  const [patientClinicFilter, setPatientClinicFilter] = useState('all');
  const [patientActivityFilter, setPatientActivityFilter] = useState('all');

  const [clinicSearchQuery, setClinicSearchQuery] = useState('');
  const [clinicWorkspaceFilter, setClinicWorkspaceFilter] = useState('all');
  const [clinicDoctorFilter, setClinicDoctorFilter] = useState('all');
  const [clinicStatusFilter, setClinicStatusFilter] = useState('all');

  const [approvalStatusFilter, setApprovalStatusFilter] = useState('all');
  const [approvalSearchQuery, setApprovalSearchQuery] = useState('');

  const [subscriptionSearchQuery, setSubscriptionSearchQuery] = useState('');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');

  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  const [offlineSearchQuery, setOfflineSearchQuery] = useState('');
  const [offlineWorkspaceFilter, setOfflineWorkspaceFilter] = useState('all');
  const [offlineDoctorFilter, setOfflineDoctorFilter] = useState('all');
  const [offlineHealthFilter, setOfflineHealthFilter] = useState('all');
  const [revokingDeviceId, setRevokingDeviceId] = useState('');

  const [planDrafts, setPlanDrafts] = useState<Record<string, { planName: string; status: AdminDoctorAccount['subscription']['status']; trialEndsAt: string }>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const [diagnosisDraft, setDiagnosisDraft] = useState<DiagnosisCatalogPayload>(emptyDiagnosisDraft);
  const [investigationDraft, setInvestigationDraft] = useState<InvestigationCatalogPayload>(emptyInvestigationDraft);
  const [referralSpecialtyDraft, setReferralSpecialtyDraft] = useState<ReferralSpecialtyPayload>(emptyReferralSpecialtyDraft);
  const [referralFacilityDraft, setReferralFacilityDraft] = useState<ReferralFacilityPayload>(emptyReferralFacilityDraft);
  const [editingDiagnosisId, setEditingDiagnosisId] = useState<string | null>(null);
  const [editingInvestigationId, setEditingInvestigationId] = useState<string | null>(null);
  const [editingReferralSpecialtyId, setEditingReferralSpecialtyId] = useState<string | null>(null);
  const [editingReferralFacilityId, setEditingReferralFacilityId] = useState<string | null>(null);

  const [selectedDoctor, setSelectedDoctor] = useState<AdminDoctorAccount | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<AdminPatientRecord | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<AdminClinicRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [doctorProfileDraft, setDoctorProfileDraft] = useState<AdminDoctorProfileUpdatePayload | null>(null);
  const [patientDraft, setPatientDraft] = useState<AdminPatientUpdatePayload | null>(null);
  const [clinicDraft, setClinicDraft] = useState<AdminClinicUpdatePayload | null>(null);
  const [doctorPatients, setDoctorPatients] = useState<AdminPatientRecord[]>([]);
  const [doctorPatientsLoading, setDoctorPatientsLoading] = useState(false);
  const [doctorPatientSearch, setDoctorPatientSearch] = useState('');
  const [doctorPatientClinicFilter, setDoctorPatientClinicFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [
        nextOverview,
        nextApprovals,
        nextDoctors,
        nextPatients,
        nextClinics,
        nextAuditLogs,
        nextOfflineStats,
        nextDiagnosisCatalog,
        nextInvestigationCatalog,
        nextReferralSpecialties,
        nextReferralFacilities,
      ] = await Promise.all([
        fetchAdminOverview(),
        fetchApprovalRequests(),
        fetchAdminDoctors(),
        fetchAdminPatients({ limit: 500 }),
        fetchAdminClinics({ limit: 500 }),
        fetchAdminAuditLogs({ limit: 150 }),
        fetchAdminOfflineSyncStats({ limit: 500 }),
        fetchAdminDiagnosisCatalog(),
        fetchAdminInvestigationCatalog(),
        fetchAdminReferralSpecialties(),
        fetchAdminReferralFacilities(),
      ]);

      setOverview(nextOverview);
      setApprovalRequests(nextApprovals);
      setDoctors(nextDoctors);
      setPatients(nextPatients);
      setClinics(nextClinics);
      setAuditLogs(nextAuditLogs);
      setOfflineStats(nextOfflineStats);
      setDiagnosisCatalog(nextDiagnosisCatalog);
      setInvestigationCatalog(nextInvestigationCatalog);
      setReferralSpecialties(nextReferralSpecialties);
      setReferralFacilities(nextReferralFacilities);
      setPlanDrafts(
        Object.fromEntries(
          nextDoctors.map(doctor => [
            doctor.workspace.id,
            {
              planName: doctor.subscription.planName,
              status: doctor.subscription.status,
              trialEndsAt: doctor.subscription.trialEndsAt ? doctor.subscription.trialEndsAt.slice(0, 10) : '',
            },
          ])
        )
      );
      setBootstrapped(true);
    } finally {
      setLoading(false);
    }
  };

  const loadOfflineStats = async (overrides?: { workspaceId?: string; doctorId?: string; status?: string; q?: string; limit?: number }) => {
    const next = await fetchAdminOfflineSyncStats({
      workspaceId: overrides?.workspaceId ?? (offlineWorkspaceFilter === 'all' ? undefined : offlineWorkspaceFilter),
      doctorId: overrides?.doctorId ?? (offlineDoctorFilter === 'all' ? undefined : offlineDoctorFilter),
      status: overrides?.status ?? (offlineHealthFilter === 'all' ? undefined : offlineHealthFilter),
      q: overrides?.q ?? (offlineSearchQuery.trim() || undefined),
      limit: overrides?.limit ?? 500,
    });
    setOfflineStats(next);
    return next;
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    const timeout = window.setTimeout(() => {
      void fetchAdminPatients({
        workspaceId: patientWorkspaceFilter === 'all' ? undefined : patientWorkspaceFilter,
        doctorId: patientDoctorFilter === 'all' ? undefined : patientDoctorFilter,
        clinicId: patientClinicFilter === 'all' ? undefined : patientClinicFilter,
        activity: patientActivityFilter === 'all' ? undefined : patientActivityFilter,
        q: patientSearchQuery.trim() || undefined,
        limit: 500,
      }).then(setPatients);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [bootstrapped, patientWorkspaceFilter, patientDoctorFilter, patientClinicFilter, patientActivityFilter, patientSearchQuery]);

  useEffect(() => {
    if (!bootstrapped) return;
    const timeout = window.setTimeout(() => {
      void loadOfflineStats();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [bootstrapped, offlineDoctorFilter, offlineHealthFilter, offlineSearchQuery, offlineWorkspaceFilter]);

  const handleRevokeDevice = async (deviceId: string, doctorName: string) => {
    if (!window.confirm(`Revoke desktop device ${deviceId} for ${doctorName}? This will block future desktop sync for that device.`)) {
      return;
    }

    setRevokingDeviceId(deviceId);
    try {
      await revokeAdminOfflineDevice(deviceId, 'Revoked from online admin sync console');
      toast.success('Desktop device revoked');
      await loadOfflineStats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke desktop device.');
    } finally {
      setRevokingDeviceId('');
    }
  };

  useEffect(() => {
    if (!selectedDoctor) {
      setDoctorProfileDraft(null);
      setDoctorPatients([]);
      setDoctorPatientSearch('');
      setDoctorPatientClinicFilter('all');
      return;
    }

    setDoctorProfileDraft({
      email: selectedDoctor.email,
      fullName: selectedDoctor.name,
      phone: selectedDoctor.phone,
      pmcNumber: selectedDoctor.pmcNumber,
      specialization: selectedDoctor.specialization,
      qualifications: selectedDoctor.qualifications ?? '',
      notes: selectedDoctor.notes ?? '',
      workspaceName: selectedDoctor.workspace.name,
      workspaceCity: selectedDoctor.workspace.city,
    });
  }, [selectedDoctor]);

  useEffect(() => {
    if (!selectedDoctor) return;
    setDoctorPatientsLoading(true);
    void fetchAdminDoctorPatients(selectedDoctor.id, {
      clinicId: doctorPatientClinicFilter === 'all' ? undefined : doctorPatientClinicFilter,
      q: doctorPatientSearch.trim() || undefined,
      limit: 300,
    })
      .then(setDoctorPatients)
      .finally(() => setDoctorPatientsLoading(false));
  }, [selectedDoctor, doctorPatientClinicFilter, doctorPatientSearch]);

  useEffect(() => {
    if (!selectedPatient) {
      setPatientDraft(null);
      return;
    }

    setPatientDraft({
      name: selectedPatient.name,
      phone: selectedPatient.phone,
      age: selectedPatient.age,
      gender: selectedPatient.gender,
      cnic: selectedPatient.cnic,
      address: selectedPatient.address,
      bloodGroup: selectedPatient.bloodGroup,
      emergencyContact: selectedPatient.emergencyContact,
    });
  }, [selectedPatient]);

  useEffect(() => {
    if (!selectedClinic) {
      setClinicDraft(null);
      return;
    }

    setClinicDraft({
      name: selectedClinic.name,
      location: selectedClinic.location,
      city: selectedClinic.city,
      phone: selectedClinic.phone,
      timings: selectedClinic.timings,
      specialties: selectedClinic.specialties,
      logo: selectedClinic.logo,
      isActive: selectedClinic.isActive,
    });
  }, [selectedClinic]);

  const workspaceOptions = useMemo(
    () => doctors
      .map(doctor => doctor.workspace)
      .filter((workspace, index, list) => list.findIndex(item => item.id === workspace.id) === index)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [doctors]
  );

  const doctorCities = useMemo(
    () => [...new Set(doctors.map(doctor => doctor.workspace.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [doctors]
  );

  const filteredDoctors = useMemo(() => {
    const query = doctorSearchQuery.trim().toLowerCase();
    return doctors.filter(doctor => {
      if (doctorStatusFilter !== 'all' && doctor.status !== doctorStatusFilter) return false;
      if (doctorSubscriptionFilter !== 'all' && doctor.subscription.status !== doctorSubscriptionFilter) return false;
      if (doctorWorkspaceFilter !== 'all' && doctor.workspace.id !== doctorWorkspaceFilter) return false;
      if (doctorCityFilter !== 'all' && doctor.workspace.city !== doctorCityFilter) return false;
      if (!query) return true;
      return doctor.name.toLowerCase().includes(query)
        || doctor.email.toLowerCase().includes(query)
        || doctor.workspace.name.toLowerCase().includes(query)
        || doctor.pmcNumber.toLowerCase().includes(query);
    });
  }, [doctorCityFilter, doctorSearchQuery, doctorStatusFilter, doctorSubscriptionFilter, doctorWorkspaceFilter, doctors]);

  const filteredApprovals = useMemo(() => {
    const query = approvalSearchQuery.trim().toLowerCase();
    return approvalRequests.filter(request => {
      if (approvalStatusFilter !== 'all' && request.status !== approvalStatusFilter) return false;
      if (!query) return true;
      return request.doctor.name.toLowerCase().includes(query)
        || request.user.email.toLowerCase().includes(query)
        || request.workspace.name.toLowerCase().includes(query)
        || request.city.toLowerCase().includes(query);
    });
  }, [approvalRequests, approvalSearchQuery, approvalStatusFilter]);

  const filteredClinics = useMemo(() => {
    const query = clinicSearchQuery.trim().toLowerCase();
    return clinics.filter(clinic => {
      if (clinicWorkspaceFilter !== 'all' && clinic.workspace.id !== clinicWorkspaceFilter) return false;
      if (clinicDoctorFilter !== 'all' && clinic.doctor.id !== clinicDoctorFilter) return false;
      if (clinicStatusFilter === 'active' && !clinic.isActive) return false;
      if (clinicStatusFilter === 'inactive' && clinic.isActive) return false;
      if (!query) return true;
      return clinic.name.toLowerCase().includes(query)
        || clinic.city.toLowerCase().includes(query)
        || clinic.workspace.name.toLowerCase().includes(query)
        || clinic.doctor.name.toLowerCase().includes(query)
        || clinic.phone.toLowerCase().includes(query);
    });
  }, [clinicDoctorFilter, clinicSearchQuery, clinicStatusFilter, clinicWorkspaceFilter, clinics]);

  const filteredSubscriptions = useMemo(() => {
    const query = subscriptionSearchQuery.trim().toLowerCase();
    return doctors.filter(doctor => {
      if (subscriptionStatusFilter !== 'all' && doctor.subscription.status !== subscriptionStatusFilter) return false;
      if (!query) return true;
      return doctor.name.toLowerCase().includes(query)
        || doctor.workspace.name.toLowerCase().includes(query)
        || doctor.email.toLowerCase().includes(query);
    });
  }, [doctors, subscriptionSearchQuery, subscriptionStatusFilter]);

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearchQuery.trim().toLowerCase();
    if (!query) return auditLogs;
    return auditLogs.filter(log =>
      formatAuditLabel(log.action).toLowerCase().includes(query)
      || JSON.stringify(log.details).toLowerCase().includes(query)
      || String(log.workspaceId ?? '').toLowerCase().includes(query)
      || String(log.targetUserId ?? '').toLowerCase().includes(query)
    );
  }, [auditLogs, auditSearchQuery]);

  const offlineRows = offlineStats?.doctors ?? [];
  const offlineSummary = offlineStats?.summary ?? {
    doctors: 0,
    workspaces: 0,
    totalDevices: 0,
    activeDevices: 0,
    revokedDevices: 0,
    doctorsWithConflicts: 0,
    doctorsWithAttention: 0,
    doctorsOffline: 0,
    bundlesProcessed: 0,
    mutationsProcessed: 0,
    conflicts: 0,
    retryableFailures: 0,
    validationRejected: 0,
    permissionRejected: 0,
    entitlementRejected: 0,
    accepted: 0,
    acceptedAlreadyProcessed: 0,
    lastSyncedAt: null,
  };
  const offlineRollout = offlineStats?.rollout ?? {
    decision: 'GO' as const,
    reasons: [] as string[],
    thresholds: {
      conflicts: 0,
      retryableFailures: 5,
      doctorsWithAttention: 10,
      doctorsOffline: 5,
    },
  };

  const selectedDoctorClinics = useMemo(
    () => selectedDoctor ? clinics.filter(clinic => clinic.doctor.id === selectedDoctor.id) : [],
    [clinics, selectedDoctor]
  );

  const selectedDoctorAudit = useMemo(
    () => selectedDoctor
      ? auditLogs.filter(log => log.targetUserId === selectedDoctor.id || log.workspaceId === selectedDoctor.workspace.id).slice(0, 8)
      : [],
    [auditLogs, selectedDoctor]
  );

  const selectedPatientAudit = useMemo(
    () => selectedPatient
      ? auditLogs.filter(log => String(log.details?.patientId ?? '') === selectedPatient.id).slice(0, 8)
      : [],
    [auditLogs, selectedPatient]
  );

  const selectedClinicAudit = useMemo(
    () => selectedClinic
      ? auditLogs.filter(log => String(log.details?.clinicId ?? '') === selectedClinic.id || log.workspaceId === selectedClinic.workspace.id).slice(0, 8)
      : [],
    [auditLogs, selectedClinic]
  );

  const pendingApprovals = approvalRequests.filter(request => request.status === 'pending');

  const kpis = [
    { label: 'Pending Approvals', value: overview.pendingApprovals, icon: ClipboardCheck },
    { label: 'Active Doctors', value: overview.activeDoctors, icon: Users },
    { label: 'Workspaces', value: overview.workspaces, icon: Building2 },
    { label: 'Appointments', value: overview.appointments, icon: ActivitySquare },
    { label: 'Clinics', value: overview.clinics, icon: MapPinned },
    { label: 'Patients', value: overview.patients, icon: ShieldCheck },
  ];

  const handleApprove = async (approvalRequestId: string) => {
    await approveDoctor(approvalRequestId);
    toast.success('Doctor approved');
    await load();
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    await rejectDoctor(rejectTarget.id, rejectReason.trim() || 'Rejected by platform admin');
    toast.success('Signup request rejected');
    setRejectTarget(null);
    setRejectReason('');
    await load();
  };

  const handleStatusChange = async (doctorId: string, status: 'active' | 'suspended') => {
    await updateDoctorAccountStatus(doctorId, status);
    toast.success(status === 'active' ? 'Doctor reactivated' : 'Doctor suspended');
    await load();
  };

  const handleSaveDoctorProfile = async () => {
    if (!selectedDoctor || !doctorProfileDraft) return;
    await updateAdminDoctorProfile(selectedDoctor.id, doctorProfileDraft);
    toast.success('Doctor profile updated');
    await load();
    setSelectedDoctor(null);
  };

  const handleSavePatient = async () => {
    if (!selectedPatient || !patientDraft) return;
    const updated = await updateAdminPatient(selectedPatient.id, patientDraft);
    toast.success('Patient demographics updated');
    setPatients(prev => prev.map(item => item.id === updated.id ? updated : item));
    setSelectedPatient(updated);
    void fetchAdminAuditLogs({ limit: 150 }).then(setAuditLogs);
  };

  const handleSaveClinic = async () => {
    if (!selectedClinic || !clinicDraft) return;
    const updated = await updateAdminClinic(selectedClinic.id, clinicDraft);
    toast.success('Clinic profile updated');
    setClinics(prev => prev.map(item => item.id === updated.id ? updated : item));
    setSelectedClinic(updated);
    void fetchAdminAuditLogs({ limit: 150 }).then(setAuditLogs);
  };

  const updatePlanDraft = (workspaceId: string, field: 'planName' | 'status' | 'trialEndsAt', value: string) => {
    setPlanDrafts(prev => ({
      ...prev,
      [workspaceId]: {
        ...prev[workspaceId],
        [field]: value,
      },
    }));
  };

  const handleSavePlan = async (doctor: AdminDoctorAccount) => {
    const draft = planDrafts[doctor.workspace.id];
    if (!draft) return;

    await updateWorkspaceSubscription(doctor.workspace.id, {
      planName: draft.planName,
      status: draft.status,
      trialEndsAt: draft.trialEndsAt || null,
    });
    toast.success('Subscription updated');
    await load();
  };

  const handleResetPassword = async (doctorId: string) => {
    const nextPassword = (passwordDrafts[doctorId] || '').trim();
    if (!nextPassword) {
      toast.error('Enter a new password first');
      return;
    }

    await resetDoctorPassword(doctorId, nextPassword);
    setPasswordDrafts(prev => ({ ...prev, [doctorId]: '' }));
    toast.success('Doctor password reset');
    await load();
  };

  const resetDiagnosisEditor = () => {
    setEditingDiagnosisId(null);
    setDiagnosisDraft(emptyDiagnosisDraft);
  };

  const resetInvestigationEditor = () => {
    setEditingInvestigationId(null);
    setInvestigationDraft(emptyInvestigationDraft);
  };

  const resetReferralSpecialtyEditor = () => {
    setEditingReferralSpecialtyId(null);
    setReferralSpecialtyDraft(emptyReferralSpecialtyDraft);
  };

  const resetReferralFacilityEditor = () => {
    setEditingReferralFacilityId(null);
    setReferralFacilityDraft(emptyReferralFacilityDraft);
  };

  const handleSaveDiagnosisCatalog = async () => {
    if (!diagnosisDraft.name.trim() || !diagnosisDraft.code.trim()) {
      toast.error('Diagnosis code and name are required');
      return;
    }

    if (editingDiagnosisId) {
      await updateAdminDiagnosisCatalogEntry(editingDiagnosisId, diagnosisDraft);
      toast.success('Diagnosis catalog entry updated');
    } else {
      await createAdminDiagnosisCatalogEntry(diagnosisDraft);
      toast.success('Diagnosis catalog entry created');
    }
    resetDiagnosisEditor();
    await load();
  };

  const handleSaveInvestigationCatalog = async () => {
    if (!investigationDraft.name.trim() || !investigationDraft.category.trim()) {
      toast.error('Investigation name and category are required');
      return;
    }

    if (editingInvestigationId) {
      await updateAdminInvestigationCatalogEntry(editingInvestigationId, investigationDraft);
      toast.success('Investigation catalog entry updated');
    } else {
      await createAdminInvestigationCatalogEntry(investigationDraft);
      toast.success('Investigation catalog entry created');
    }
    resetInvestigationEditor();
    await load();
  };

  const handleSaveReferralSpecialty = async () => {
    if (!referralSpecialtyDraft.name.trim()) {
      toast.error('Referral specialty name is required');
      return;
    }

    if (editingReferralSpecialtyId) {
      await updateAdminReferralSpecialty(editingReferralSpecialtyId, referralSpecialtyDraft);
      toast.success('Referral specialty updated');
    } else {
      await createAdminReferralSpecialty(referralSpecialtyDraft);
      toast.success('Referral specialty created');
    }
    resetReferralSpecialtyEditor();
    await load();
  };

  const handleSaveReferralFacility = async () => {
    if (!referralFacilityDraft.name.trim() || !referralFacilityDraft.city.trim()) {
      toast.error('Facility name and city are required');
      return;
    }

    if (editingReferralFacilityId) {
      await updateAdminReferralFacility(editingReferralFacilityId, referralFacilityDraft);
      toast.success('Referral facility updated');
    } else {
      await createAdminReferralFacility(referralFacilityDraft);
      toast.success('Referral facility created');
    }
    resetReferralFacilityEditor();
    await load();
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Platform Operations</h1>
          <p className="text-sm text-muted-foreground">Run approvals, doctor operations, subscriptions, clinics, and patient oversight from one admin console.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {adminViews.map(item => (
            <Button
              key={item.key}
              size="sm"
              variant={adminView === item.key ? 'default' : 'outline'}
              onClick={() => setAdminView(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {(adminView === 'overview' || adminView === 'doctors' || adminView === 'patients' || adminView === 'clinics' || adminView === 'approvals' || adminView === 'subscriptions' || adminView === 'offline') && (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
          {kpis.map(kpi => (
            <StatCard key={kpi.label} icon={kpi.icon} label={kpi.label} value={kpi.value} />
          ))}
        </div>
      )}

      {adminView === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm xl:col-span-2">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Approval Queue</h2>
                  <p className="text-xs text-muted-foreground">Latest doctor signup requests waiting for review.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAdminView('approvals')}>Open Approvals</Button>
              </div>
              {pendingApprovals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending approvals.</p>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.slice(0, 4).map(request => (
                    <div key={request.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{request.doctor.name}</p>
                          <p className="text-xs text-muted-foreground">{request.user.email} • {request.city}</p>
                          <p className="text-xs text-muted-foreground mt-1">{request.clinicName}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setRejectTarget(request); setRejectReason(request.rejectionReason || ''); }}>Reject</Button>
                          <Button size="sm" onClick={() => void handleApprove(request.id)}>Approve</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Subscription Watchlist</h2>
                  <p className="text-xs text-muted-foreground">Accounts needing commercial attention.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAdminView('subscriptions')}>Open</Button>
              </div>
              <div className="space-y-3">
                {doctors
                  .filter(doctor => doctor.subscription.status !== 'active')
                  .slice(0, 5)
                  .map(doctor => (
                    <div key={doctor.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{doctor.name}</p>
                          <p className="text-xs text-muted-foreground">{doctor.workspace.name}</p>
                        </div>
                        <Badge variant="outline" className={getSubscriptionStatusBadgeClass(doctor.subscription.status)}>
                          {formatStatusLabel(doctor.subscription.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm xl:col-span-2">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Top Clinics</h2>
                  <p className="text-xs text-muted-foreground">Quick view of operational clinic footprint and recent activity.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAdminView('clinics')}>Open Clinics</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clinics.slice(0, 6).map(clinic => (
                  <div key={clinic.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{clinic.name}</p>
                        <p className="text-xs text-muted-foreground">{clinic.doctor.name} • {clinic.workspace.name}</p>
                      </div>
                      <Badge variant="outline" className={getClinicStatusBadgeClass(clinic.isActive)}>
                        {clinic.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                      <div className="rounded-md bg-muted/40 px-3 py-2">Patients: <span className="font-medium text-foreground">{clinic.patientCount}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Visits: <span className="font-medium text-foreground">{clinic.appointmentCount}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Recent Audit</h2>
                  <p className="text-xs text-muted-foreground">Latest admin mutations across the platform.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAdminView('audit')}>Open Audit</Button>
              </div>
              <div className="space-y-3">
                {auditLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{formatAuditLabel(log.action)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {adminView === 'approvals' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Approval Requests</h2>
              <p className="text-xs text-muted-foreground">Review pending, approved, and rejected doctor onboarding history.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px] gap-3">
              <Input value={approvalSearchQuery} onChange={event => setApprovalSearchQuery(event.target.value)} placeholder="Search by doctor, email, workspace, or city" />
              <Select value={approvalStatusFilter} onValueChange={setApprovalStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {filteredApprovals.map(request => (
                <div key={request.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{request.doctor.name}</p>
                        <Badge variant="outline" className={getAccountStatusBadgeClass(request.status)}>{formatStatusLabel(request.status)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{request.user.email} • {request.doctor.phone}</p>
                      <p className="text-xs text-muted-foreground">{request.workspace.name} • {request.city}</p>
                      <p className="text-xs text-muted-foreground mt-1">{request.doctor.specialization} • PMC {request.doctor.pmcNumber}</p>
                      {request.notes && <p className="text-sm text-muted-foreground mt-3">{request.notes}</p>}
                      {request.rejectionReason && <p className="text-xs text-rose-600 mt-2">Reason: {request.rejectionReason}</p>}
                    </div>
                    {request.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setRejectTarget(request); setRejectReason(''); }}>Reject</Button>
                        <Button size="sm" onClick={() => void handleApprove(request.id)}>Approve</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredApprovals.length === 0 && <p className="text-sm text-muted-foreground">No approval requests match this filter.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'doctors' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Doctor Accounts</h2>
              <p className="text-xs text-muted-foreground">Manage role status, workspace context, linked clinics, patients, and quick account actions.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_180px_200px_180px] gap-3">
              <Input value={doctorSearchQuery} onChange={event => setDoctorSearchQuery(event.target.value)} placeholder="Search by doctor, workspace, email, or PMC" />
              <Select value={doctorStatusFilter} onValueChange={setDoctorStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={doctorSubscriptionFilter} onValueChange={setDoctorSubscriptionFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={doctorWorkspaceFilter} onValueChange={setDoctorWorkspaceFilter}>
                <SelectTrigger><SelectValue placeholder="All workspaces" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  {workspaceOptions.map(workspace => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={doctorCityFilter} onValueChange={setDoctorCityFilter}>
                <SelectTrigger><SelectValue placeholder="All cities" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {doctorCities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              {filteredDoctors.map(doctor => (
                <div key={doctor.id} className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
                        <Badge variant="outline" className={getAccountStatusBadgeClass(doctor.status)}>{formatStatusLabel(doctor.status)}</Badge>
                        <Badge variant="outline" className={getSubscriptionStatusBadgeClass(doctor.subscription.status)}>{formatStatusLabel(doctor.subscription.status)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{doctor.email} • {doctor.phone}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialization} • PMC {doctor.pmcNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">{doctor.workspace.name}, {doctor.workspace.city}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedDoctor(doctor)}>Open Details</Button>
                      {doctor.status === 'active' ? (
                        <Button variant="outline" size="sm" onClick={() => void handleStatusChange(doctor.id, 'suspended')}>Suspend</Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void handleStatusChange(doctor.id, 'active')}>Reactivate</Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                    <div className="rounded-md bg-muted/40 px-3 py-2">Clinics: <span className="font-medium text-foreground">{doctor.usage.clinics}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Patients: <span className="font-medium text-foreground">{doctor.usage.patients}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Appointments: <span className="font-medium text-foreground">{doctor.usage.appointments}</span></div>
                  </div>
                </div>
              ))}
              {filteredDoctors.length === 0 && <p className="text-sm text-muted-foreground">No doctor accounts match this filter.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'patients' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Patient Directory</h2>
              <p className="text-xs text-muted-foreground">Review and maintain non-clinical patient demographics with doctor, clinic, workspace, and activity filters.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px] gap-3">
              <Input value={patientSearchQuery} onChange={event => setPatientSearchQuery(event.target.value)} placeholder="Search by patient, MRN, phone, CNIC, doctor, or workspace" />
              <Select value={patientWorkspaceFilter} onValueChange={value => { setPatientWorkspaceFilter(value); setPatientClinicFilter('all'); }}>
                <SelectTrigger><SelectValue placeholder="All workspaces" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  {workspaceOptions.map(workspace => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={patientDoctorFilter} onValueChange={value => { setPatientDoctorFilter(value); setPatientClinicFilter('all'); }}>
                <SelectTrigger><SelectValue placeholder="All doctors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {doctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={patientClinicFilter} onValueChange={setPatientClinicFilter}>
                <SelectTrigger><SelectValue placeholder="All clinics" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  {clinics
                    .filter(clinic => patientDoctorFilter === 'all' || clinic.doctor.id === patientDoctorFilter)
                    .filter(clinic => patientWorkspaceFilter === 'all' || clinic.workspace.id === patientWorkspaceFilter)
                    .map(clinic => (
                      <SelectItem key={clinic.id} value={clinic.id}>{clinic.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={patientActivityFilter} onValueChange={setPatientActivityFilter}>
                <SelectTrigger><SelectValue placeholder="All activity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activity</SelectItem>
                  <SelectItem value="recent">Recent Visits</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="new">No Visits Yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{patients.length}</span> patient records
            </div>
            <div className="space-y-3">
              {patients.map(patient => {
                const activity = getPatientActivity(patient);
                return (
                  <div key={patient.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{patient.name}</p>
                          <Badge variant="outline" className="text-[10px] border-sky-200 bg-sky-50 text-sky-700">{patient.mrn}</Badge>
                          <Badge variant="outline" className={activity.className}>{activity.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{patient.phone || 'No phone'}{patient.cnic ? ` • ${patient.cnic}` : ''}</p>
                        <p className="text-xs text-muted-foreground">Doctor: {patient.doctor.name} • Workspace: {patient.workspace.name}</p>
                        <p className="text-xs text-muted-foreground">Last clinic: {patient.lastClinic?.name || 'Not assigned yet'}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Appointments: <span className="font-medium text-foreground">{patient.totalAppointments}</span></p>
                        <p className="mt-1">Last visit: <span className="font-medium text-foreground">{formatDateLabel(patient.lastAppointmentDate)}</span></p>
                        <Button className="mt-3" size="sm" variant="outline" onClick={() => setSelectedPatient(patient)}>Open Details</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {patients.length === 0 && <p className="text-sm text-muted-foreground">No patients match this filter.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'clinics' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Clinic Operations</h2>
              <p className="text-xs text-muted-foreground">Manage clinic metadata, operational status, and linked doctor/workspace performance.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_200px_200px_180px] gap-3">
              <Input value={clinicSearchQuery} onChange={event => setClinicSearchQuery(event.target.value)} placeholder="Search by clinic, city, phone, doctor, or workspace" />
              <Select value={clinicWorkspaceFilter} onValueChange={setClinicWorkspaceFilter}>
                <SelectTrigger><SelectValue placeholder="All workspaces" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workspaces</SelectItem>
                  {workspaceOptions.map(workspace => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={clinicDoctorFilter} onValueChange={setClinicDoctorFilter}>
                <SelectTrigger><SelectValue placeholder="All doctors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {doctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={clinicStatusFilter} onValueChange={setClinicStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredClinics.map(clinic => (
                <div key={clinic.id} className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{clinic.name}</p>
                        <Badge variant="outline" className={getClinicStatusBadgeClass(clinic.isActive)}>
                          {clinic.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{clinic.doctor.name} • {clinic.workspace.name}</p>
                      <p className="text-xs text-muted-foreground">{clinic.city} • {clinic.phone || 'No phone'}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedClinic(clinic)}>Open Details</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="rounded-md bg-muted/40 px-3 py-2">Patients: <span className="font-medium text-foreground">{clinic.patientCount}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Visits: <span className="font-medium text-foreground">{clinic.appointmentCount}</span></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Last appointment: <span className="font-medium text-foreground">{formatDateLabel(clinic.recentAppointmentDate)}</span></p>
                </div>
              ))}
              {filteredClinics.length === 0 && <p className="text-sm text-muted-foreground">No clinics match this filter.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'subscriptions' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Subscription Management</h2>
              <p className="text-xs text-muted-foreground">Update subscription plans, trial deadlines, and commercial account state separate from doctor profile editing.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3">
              <Input value={subscriptionSearchQuery} onChange={event => setSubscriptionSearchQuery(event.target.value)} placeholder="Search by doctor, workspace, or email" />
              <Select value={subscriptionStatusFilter} onValueChange={setSubscriptionStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              {filteredSubscriptions.map(doctor => {
                const planDraft = planDrafts[doctor.workspace.id];
                return (
                  <div key={doctor.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
                          <Badge variant="outline" className={getSubscriptionStatusBadgeClass(doctor.subscription.status)}>
                            {formatStatusLabel(doctor.subscription.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{doctor.workspace.name} • {doctor.email}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setSelectedDoctor(doctor)}>Open Doctor</Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Plan</Label>
                        <Input value={planDraft?.planName ?? ''} onChange={event => updatePlanDraft(doctor.workspace.id, 'planName', event.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <Select value={planDraft?.status ?? 'trial'} onValueChange={value => updatePlanDraft(doctor.workspace.id, 'status', value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Trial Ends</Label>
                        <Input type="date" value={planDraft?.trialEndsAt ?? ''} onChange={event => updatePlanDraft(doctor.workspace.id, 'trialEndsAt', event.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <Button className="w-full" onClick={() => void handleSavePlan(doctor)}>Save Subscription</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSubscriptions.length === 0 && <p className="text-sm text-muted-foreground">No subscriptions match this filter.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'offline' && (
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <HardDriveDownload className="w-4 h-4 text-primary" />
                  Doctor Offline Sync Monitoring
                </h2>
                <p className="text-xs text-muted-foreground">Admin stays online. This module monitors doctor desktop offline usage, sync throughput, conflicts, and last sync state.</p>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px_220px_180px] gap-3">
                <Input value={offlineSearchQuery} onChange={event => setOfflineSearchQuery(event.target.value)} placeholder="Search doctor, email, workspace, or city" />
                <Select value={offlineWorkspaceFilter} onValueChange={value => { setOfflineWorkspaceFilter(value); setOfflineDoctorFilter('all'); }}>
                  <SelectTrigger><SelectValue placeholder="All workspaces" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Workspaces</SelectItem>
                    {workspaceOptions.map(workspace => (
                      <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={offlineDoctorFilter} onValueChange={setOfflineDoctorFilter}>
                  <SelectTrigger><SelectValue placeholder="All doctors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Doctors</SelectItem>
                    {doctors
                      .filter(doctor => offlineWorkspaceFilter === 'all' || doctor.workspace.id === offlineWorkspaceFilter)
                      .map(doctor => (
                        <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={offlineHealthFilter} onValueChange={setOfflineHealthFilter}>
                  <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Health</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="attention">Attention</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">
                Last refresh: <span className="font-medium text-foreground">{formatDateTimeLabel(offlineStats?.generatedAt ?? null, 'Not loaded yet')}</span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Pilot rollout signal</p>
                    <p className="text-xs text-muted-foreground">This stays in the online admin console only. Doctors use the desktop app; admins do not.</p>
                  </div>
                  <Badge variant="outline" className={getRolloutDecisionBadgeClass(offlineRollout.decision)}>
                    {offlineRollout.decision === 'GO' ? 'Go' : 'Pause Rollout'}
                  </Badge>
                </div>
                {offlineRollout.reasons.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {offlineRollout.reasons.map(reason => (
                      <p key={reason} className="text-xs text-rose-700">{reason}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-emerald-700">Current conflict and offline signals are within pilot rollout thresholds.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Doctors in Scope</p>
                <p className="text-2xl font-bold text-foreground">{offlineSummary.doctors}</p>
                <p className="text-xs text-muted-foreground">{offlineSummary.workspaces} workspaces</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Connected Devices</p>
                <p className="text-2xl font-bold text-foreground">{offlineSummary.activeDevices}</p>
                <p className="text-xs text-muted-foreground">Total {offlineSummary.totalDevices} • Revoked {offlineSummary.revokedDevices}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Sync Throughput</p>
                <p className="text-2xl font-bold text-foreground">{offlineSummary.bundlesProcessed + offlineSummary.mutationsProcessed}</p>
                <p className="text-xs text-muted-foreground">Bundles {offlineSummary.bundlesProcessed} • Mutations {offlineSummary.mutationsProcessed}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Risk Signals</p>
                <p className="text-2xl font-bold text-foreground">{offlineSummary.conflicts}</p>
                <p className="text-xs text-muted-foreground">Attention {offlineSummary.doctorsWithAttention} • Offline {offlineSummary.doctorsOffline}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Doctor Sync Status</h3>
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                  Latest global sync: {formatDateTimeLabel(offlineSummary.lastSyncedAt)}
                </Badge>
              </div>
              <div className="space-y-3">
                {offlineRows.map(item => (
                  <div key={item.doctor.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.doctor.name}</p>
                          <Badge variant="outline" className={getOfflineHealthBadgeClass(item.health)}>{formatStatusLabel(item.health)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{item.doctor.email}</p>
                        <p className="text-xs text-muted-foreground">{item.workspace.name} • {item.workspace.city}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Last synced: <span className="font-medium text-foreground">{formatDateTimeLabel(item.sync.lastSyncedAt)}</span></p>
                        <p className="mt-1">Last seen device: <span className="font-medium text-foreground">{formatDateTimeLabel(item.devices.lastSeenAt, 'Never online')}</span></p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-4 text-xs text-muted-foreground">
                      <div className="rounded-md bg-muted/40 px-3 py-2">Devices <span className="font-medium text-foreground">{item.devices.total}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Active <span className="font-medium text-foreground">{item.devices.active}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Bundles <span className="font-medium text-foreground">{item.sync.bundlesProcessed}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Mutations <span className="font-medium text-foreground">{item.sync.mutationsProcessed}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Conflicts <span className="font-medium text-foreground">{item.outcomes.conflicts}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Retryable <span className="font-medium text-foreground">{item.outcomes.retryableFailures}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Validation <span className="font-medium text-foreground">{item.outcomes.validationRejected}</span></div>
                      <div className="rounded-md bg-muted/40 px-3 py-2">Permission <span className="font-medium text-foreground">{item.outcomes.permissionRejected}</span></div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-foreground">Desktop devices</p>
                      {item.deviceEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No registered desktop devices yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {item.deviceEntries.map(device => (
                            <div key={device.deviceId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                              <div className="text-xs">
                                <p className="font-medium text-foreground">{device.deviceName || device.deviceId}</p>
                                <p className="text-muted-foreground">{device.deviceId}</p>
                                <p className="text-muted-foreground">{device.platform} • {device.appVersion || 'unknown version'}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={device.status === 'revoked' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                                  {formatStatusLabel(device.status)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Seen {formatDateTimeLabel(device.lastSeenAt, 'Never')}
                                </span>
                                {device.status !== 'revoked' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={revokingDeviceId === device.deviceId}
                                    onClick={() => void handleRevokeDevice(device.deviceId, item.doctor.name)}
                                  >
                                    {revokingDeviceId === device.deviceId ? 'Revoking...' : 'Revoke Device'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {offlineRows.length === 0 && <p className="text-sm text-muted-foreground">No offline sync records match these filters.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {adminView === 'catalogs' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Clinical Master Catalogs</h2>
              <p className="text-xs text-muted-foreground">Maintain shared reference data without crossing into doctor-authored clinical content.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Diagnosis Catalog</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-3">
                  <Input placeholder="Code" value={diagnosisDraft.code} onChange={event => setDiagnosisDraft(prev => ({ ...prev, code: event.target.value }))} />
                  <Input placeholder="Diagnosis name" value={diagnosisDraft.name} onChange={event => setDiagnosisDraft(prev => ({ ...prev, name: event.target.value }))} />
                  <div className="flex items-center justify-between rounded-md border border-border px-3">
                    <Label className="text-xs">Active</Label>
                    <Switch checked={diagnosisDraft.isActive} onCheckedChange={checked => setDiagnosisDraft(prev => ({ ...prev, isActive: checked }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleSaveDiagnosisCatalog()}>{editingDiagnosisId ? 'Update Entry' : 'Add Entry'}</Button>
                  {editingDiagnosisId && <Button variant="outline" size="sm" onClick={resetDiagnosisEditor}>Cancel</Button>}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {diagnosisCatalog.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.code || 'No code'}</p>
                        </div>
                        <Badge variant="outline" className={entry.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700'}>
                          {entry.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => { setEditingDiagnosisId(entry.id); setDiagnosisDraft({ code: entry.code, name: entry.name, isActive: entry.isActive }); }}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => void deleteAdminDiagnosisCatalogEntry(entry.id).then(() => { toast.success('Diagnosis catalog entry deleted'); resetDiagnosisEditor(); return load(); })}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Investigation Catalog</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Investigation name" value={investigationDraft.name} onChange={event => setInvestigationDraft(prev => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="Category" value={investigationDraft.category} onChange={event => setInvestigationDraft(prev => ({ ...prev, category: event.target.value }))} />
                  <Select value={investigationDraft.type} onValueChange={value => setInvestigationDraft(prev => ({ ...prev, type: value as InvestigationCatalogPayload['type'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lab">Lab</SelectItem>
                      <SelectItem value="radiology">Radiology</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between rounded-md border border-border px-3">
                    <Label className="text-xs">Active</Label>
                    <Switch checked={investigationDraft.isActive} onCheckedChange={checked => setInvestigationDraft(prev => ({ ...prev, isActive: checked }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleSaveInvestigationCatalog()}>{editingInvestigationId ? 'Update Entry' : 'Add Entry'}</Button>
                  {editingInvestigationId && <Button variant="outline" size="sm" onClick={resetInvestigationEditor}>Cancel</Button>}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {investigationCatalog.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.category} • {entry.type}</p>
                        </div>
                        <Badge variant="outline" className={entry.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700'}>
                          {entry.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => { setEditingInvestigationId(entry.id); setInvestigationDraft({ name: entry.name, category: entry.category, type: entry.type, isActive: entry.isActive }); }}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => void deleteAdminInvestigationCatalogEntry(entry.id).then(() => { toast.success('Investigation catalog entry deleted'); resetInvestigationEditor(); return load(); })}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Referral Specialties</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                  <Input placeholder="Specialty name" value={referralSpecialtyDraft.name} onChange={event => setReferralSpecialtyDraft(prev => ({ ...prev, name: event.target.value }))} />
                  <div className="flex items-center justify-between rounded-md border border-border px-3">
                    <Label className="text-xs">Active</Label>
                    <Switch checked={referralSpecialtyDraft.isActive} onCheckedChange={checked => setReferralSpecialtyDraft(prev => ({ ...prev, isActive: checked }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleSaveReferralSpecialty()}>{editingReferralSpecialtyId ? 'Update Entry' : 'Add Entry'}</Button>
                  {editingReferralSpecialtyId && <Button variant="outline" size="sm" onClick={resetReferralSpecialtyEditor}>Cancel</Button>}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {referralSpecialties.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-border px-3 py-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.isActive ? 'Visible to doctors' : 'Hidden from doctors'}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditingReferralSpecialtyId(entry.id); setReferralSpecialtyDraft({ name: entry.name, isActive: entry.isActive }); }}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => void deleteAdminReferralSpecialty(entry.id).then(() => { toast.success('Referral specialty deleted'); resetReferralSpecialtyEditor(); return load(); })}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <MapPinned className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Referral Facilities</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Facility name" value={referralFacilityDraft.name} onChange={event => setReferralFacilityDraft(prev => ({ ...prev, name: event.target.value }))} />
                  <Input placeholder="City" value={referralFacilityDraft.city} onChange={event => setReferralFacilityDraft(prev => ({ ...prev, city: event.target.value }))} />
                  <Input placeholder="Phone" value={referralFacilityDraft.phone} onChange={event => setReferralFacilityDraft(prev => ({ ...prev, phone: event.target.value }))} />
                  <div className="flex items-center justify-between rounded-md border border-border px-3">
                    <Label className="text-xs">Active</Label>
                    <Switch checked={referralFacilityDraft.isActive} onCheckedChange={checked => setReferralFacilityDraft(prev => ({ ...prev, isActive: checked }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleSaveReferralFacility()}>{editingReferralFacilityId ? 'Update Entry' : 'Add Entry'}</Button>
                  {editingReferralFacilityId && <Button variant="outline" size="sm" onClick={resetReferralFacilityEditor}>Cancel</Button>}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {referralFacilities.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.city}{entry.phone ? ` • ${entry.phone}` : ''}</p>
                        </div>
                        <Badge variant="outline" className={entry.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700'}>
                          {entry.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => { setEditingReferralFacilityId(entry.id); setReferralFacilityDraft({ name: entry.name, city: entry.city, phone: entry.phone, isActive: entry.isActive }); }}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => void deleteAdminReferralFacility(entry.id).then(() => { toast.success('Referral facility deleted'); resetReferralFacilityEditor(); return load(); })}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {adminView === 'audit' && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Audit Trail</h2>
              <p className="text-xs text-muted-foreground">Every admin mutation is tracked with target, workspace context, and change details.</p>
            </div>
            <Input value={auditSearchQuery} onChange={event => setAuditSearchQuery(event.target.value)} placeholder="Search by action, entity id, workspace, or change details" />
            <div className="space-y-3">
              {filteredAuditLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatAuditLabel(log.action)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Actor: {log.actorUserId || 'system'} {log.targetUserId ? `• Target: ${log.targetUserId}` : ''} {log.workspaceId ? `• Workspace: ${log.workspaceId}` : ''}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                    {Object.entries(log.details ?? {}).map(([key, value]) => (
                      <div key={key} className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{formatStatusLabel(key)}:</span> {formatAuditValue(value)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredAuditLogs.length === 0 && <p className="text-sm text-muted-foreground">No audit entries match this search.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(rejectTarget)} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Signup Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-foreground">{rejectTarget?.doctor.name}</p>
              <p className="text-xs text-muted-foreground">{rejectTarget?.user.email}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Explain why the request is being rejected" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button onClick={() => void handleReject()}>Reject Request</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedDoctor)} onOpenChange={open => !open && setSelectedDoctor(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Doctor Details</DialogTitle>
          </DialogHeader>
          {!selectedDoctor || !doctorProfileDraft ? (
            <p className="text-sm text-muted-foreground">Loading doctor details...</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Account & Workspace</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Full Name</Label>
                      <Input value={doctorProfileDraft.fullName} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, fullName: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input value={doctorProfileDraft.email} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, email: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={doctorProfileDraft.phone} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, phone: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">PMC Number</Label>
                      <Input value={doctorProfileDraft.pmcNumber} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, pmcNumber: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Specialization</Label>
                      <Input value={doctorProfileDraft.specialization} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, specialization: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Qualifications</Label>
                      <Input value={doctorProfileDraft.qualifications} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, qualifications: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={doctorProfileDraft.notes} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, notes: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Workspace Name</Label>
                      <Input value={doctorProfileDraft.workspaceName} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, workspaceName: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Workspace City</Label>
                      <Input value={doctorProfileDraft.workspaceCity} onChange={event => setDoctorProfileDraft(prev => prev ? { ...prev, workspaceCity: event.target.value } : prev)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveDoctorProfile()}>Save Doctor Details</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={getAccountStatusBadgeClass(selectedDoctor.status)}>{formatStatusLabel(selectedDoctor.status)}</Badge>
                    <Badge variant="outline" className={getSubscriptionStatusBadgeClass(selectedDoctor.subscription.status)}>{formatStatusLabel(selectedDoctor.subscription.status)}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reset Password</Label>
                      <Input
                        type="password"
                        value={passwordDrafts[selectedDoctor.id] ?? ''}
                        onChange={event => setPasswordDrafts(prev => ({ ...prev, [selectedDoctor.id]: event.target.value }))}
                        placeholder="Temporary password"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" onClick={() => void handleResetPassword(selectedDoctor.id)}>Reset Password</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div className="rounded-md bg-muted/40 px-3 py-2">Clinics: <span className="font-medium text-foreground">{selectedDoctor.usage.clinics}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Patients: <span className="font-medium text-foreground">{selectedDoctor.usage.patients}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Appointments: <span className="font-medium text-foreground">{selectedDoctor.usage.appointments}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Trial Ends: <span className="font-medium text-foreground">{formatDateLabel(selectedDoctor.subscription.trialEndsAt)}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDoctor.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => void handleStatusChange(selectedDoctor.id, 'suspended')}>Suspend Doctor</Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => void handleStatusChange(selectedDoctor.id, 'active')}>Reactivate Doctor</Button>
                    )}
                    <Button size="sm" onClick={() => { setAdminView('subscriptions'); setSelectedDoctor(null); }}>Open Subscription Controls</Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Linked Clinics</h3>
                  <div className="space-y-2">
                    {selectedDoctorClinics.map(clinic => (
                      <button key={clinic.id} type="button" className="w-full text-left rounded-md border border-border px-3 py-2 hover:border-primary" onClick={() => setSelectedClinic(clinic)}>
                        <p className="text-sm font-medium text-foreground">{clinic.name}</p>
                        <p className="text-xs text-muted-foreground">{clinic.workspace.city} • {clinic.patientCount} patients</p>
                      </button>
                    ))}
                    {selectedDoctorClinics.length === 0 && <p className="text-sm text-muted-foreground">No clinics linked yet.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3 xl:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Doctor Patients</h3>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 w-full xl:w-auto">
                      <Input value={doctorPatientSearch} onChange={event => setDoctorPatientSearch(event.target.value)} placeholder="Search patient by name, MRN, phone, or CNIC" />
                      <Select value={doctorPatientClinicFilter} onValueChange={setDoctorPatientClinicFilter}>
                        <SelectTrigger><SelectValue placeholder="All clinics" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Clinics</SelectItem>
                          {selectedDoctorClinics.map(clinic => (
                            <SelectItem key={clinic.id} value={clinic.id}>{clinic.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {doctorPatientsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading patients...</p>
                  ) : doctorPatients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No patients found for this doctor.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {doctorPatients.map(patient => (
                        <button key={patient.id} type="button" className="w-full text-left rounded-md border border-border px-3 py-2 hover:border-primary" onClick={() => setSelectedPatient(patient)}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{patient.name} <span className="text-xs text-muted-foreground">({patient.mrn})</span></p>
                              <p className="text-xs text-muted-foreground">{patient.phone || 'No phone'} • {patient.lastClinic?.name || 'No clinic yet'}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">{formatDateLabel(patient.lastAppointmentDate)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Audit History</h3>
                {selectedDoctorAudit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No audit entries for this doctor yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDoctorAudit.map(log => (
                      <div key={log.id} className="rounded-md border border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground">{formatAuditLabel(log.action)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedPatient)} onOpenChange={open => !open && setSelectedPatient(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Patient Details</DialogTitle>
          </DialogHeader>
          {!selectedPatient || !patientDraft ? (
            <p className="text-sm text-muted-foreground">Loading patient details...</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Demographics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input value={patientDraft.name} onChange={event => setPatientDraft(prev => prev ? { ...prev, name: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={patientDraft.phone} onChange={event => setPatientDraft(prev => prev ? { ...prev, phone: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Age</Label>
                      <Input type="number" value={patientDraft.age} onChange={event => setPatientDraft(prev => prev ? { ...prev, age: Number(event.target.value || 0) } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gender</Label>
                      <Select value={patientDraft.gender} onValueChange={value => setPatientDraft(prev => prev ? { ...prev, gender: value as AdminPatientUpdatePayload['gender'] } : prev)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">CNIC</Label>
                      <Input value={patientDraft.cnic} onChange={event => setPatientDraft(prev => prev ? { ...prev, cnic: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Blood Group</Label>
                      <Input value={patientDraft.bloodGroup} onChange={event => setPatientDraft(prev => prev ? { ...prev, bloodGroup: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Address</Label>
                      <Textarea value={patientDraft.address} onChange={event => setPatientDraft(prev => prev ? { ...prev, address: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Emergency Contact</Label>
                      <Input value={patientDraft.emergencyContact} onChange={event => setPatientDraft(prev => prev ? { ...prev, emergencyContact: event.target.value } : prev)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleSavePatient()}>Save Patient Details</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Operational Context</h3>
                  <div className="space-y-2 text-sm">
                    <p className="text-foreground"><span className="text-muted-foreground">MRN:</span> {selectedPatient.mrn}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Doctor:</span> {selectedPatient.doctor.name}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Workspace:</span> {selectedPatient.workspace.name}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Last Clinic:</span> {selectedPatient.lastClinic?.name || 'No clinic yet'}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Appointments:</span> {selectedPatient.totalAppointments}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Last Visit:</span> {formatDateLabel(selectedPatient.lastAppointmentDate)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      const doctor = doctors.find(item => item.id === selectedPatient.doctor.id);
                      if (doctor) {
                        setSelectedDoctor(doctor);
                        setSelectedPatient(null);
                      }
                    }}>
                      Open Doctor
                    </Button>
                    {selectedPatient.lastClinic && (
                      <Button variant="outline" size="sm" onClick={() => {
                        const clinic = clinics.find(item => item.id === selectedPatient.lastClinic?.id);
                        if (clinic) {
                          setSelectedClinic(clinic);
                          setSelectedPatient(null);
                        }
                      }}>
                        Open Clinic
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Audit History</h3>
                {selectedPatientAudit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No patient audit entries yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedPatientAudit.map(log => (
                      <div key={log.id} className="rounded-md border border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground">{formatAuditLabel(log.action)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedClinic)} onOpenChange={open => !open && setSelectedClinic(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Clinic Details</DialogTitle>
          </DialogHeader>
          {!selectedClinic || !clinicDraft ? (
            <p className="text-sm text-muted-foreground">Loading clinic details...</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Clinic Profile</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Clinic Name</Label>
                      <Input value={clinicDraft.name} onChange={event => setClinicDraft(prev => prev ? { ...prev, name: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">City</Label>
                      <Input value={clinicDraft.city} onChange={event => setClinicDraft(prev => prev ? { ...prev, city: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Location</Label>
                      <Input value={clinicDraft.location} onChange={event => setClinicDraft(prev => prev ? { ...prev, location: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={clinicDraft.phone} onChange={event => setClinicDraft(prev => prev ? { ...prev, phone: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Timings</Label>
                      <Input value={clinicDraft.timings} onChange={event => setClinicDraft(prev => prev ? { ...prev, timings: event.target.value } : prev)} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs">Specialties</Label>
                      <Input value={clinicDraft.specialties.join(', ')} onChange={event => setClinicDraft(prev => prev ? { ...prev, specialties: event.target.value.split(',').map(item => item.trim()).filter(Boolean) } : prev)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Logo</Label>
                      <Input value={clinicDraft.logo} onChange={event => setClinicDraft(prev => prev ? { ...prev, logo: event.target.value } : prev)} />
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3">
                      <Label className="text-xs">Active</Label>
                      <Switch checked={clinicDraft.isActive} onCheckedChange={checked => setClinicDraft(prev => prev ? { ...prev, isActive: checked } : prev)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleSaveClinic()}>Save Clinic Details</Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Operational Context</h3>
                  <div className="space-y-2 text-sm">
                    <p className="text-foreground"><span className="text-muted-foreground">Doctor:</span> {selectedClinic.doctor.name}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Workspace:</span> {selectedClinic.workspace.name}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Patients:</span> {selectedClinic.patientCount}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Appointments:</span> {selectedClinic.appointmentCount}</p>
                    <p className="text-foreground"><span className="text-muted-foreground">Last Appointment:</span> {formatDateLabel(selectedClinic.recentAppointmentDate)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={getClinicStatusBadgeClass(selectedClinic.isActive)}>
                      {selectedClinic.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => {
                      const doctor = doctors.find(item => item.id === selectedClinic.doctor.id);
                      if (doctor) {
                        setSelectedDoctor(doctor);
                        setSelectedClinic(null);
                      }
                    }}>
                      Open Doctor
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Audit History</h3>
                {selectedClinicAudit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No clinic audit entries yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedClinicAudit.map(log => (
                      <div key={log.id} className="rounded-md border border-border px-3 py-2">
                        <p className="text-sm font-medium text-foreground">{formatAuditLabel(log.action)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
