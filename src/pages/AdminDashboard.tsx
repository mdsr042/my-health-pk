import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  fetchAdminDiagnosisCatalog,
  fetchAdminDoctors,
  fetchAdminInvestigationCatalog,
  fetchAdminOverview,
  fetchAdminReferralFacilities,
  fetchAdminReferralSpecialties,
  fetchApprovalRequests,
  rejectDoctor,
  resetDoctorPassword,
  updateAdminDiagnosisCatalogEntry,
  updateAdminInvestigationCatalogEntry,
  updateAdminReferralFacility,
  updateAdminReferralSpecialty,
  updateDoctorAccountStatus,
  updateWorkspaceSubscription,
} from '@/lib/api';
import type {
  AdminAuditLog,
  AdminDoctorAccount,
  AdminOverview,
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
import { Users, ClipboardCheck, Building2, ActivitySquare, Stethoscope, FlaskConical, MapPinned, ArrowRightLeft } from 'lucide-react';

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

function formatStatusLabel(value: string) {
  return value
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [doctors, setDoctors] = useState<AdminDoctorAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<DiagnosisCatalogEntry[]>([]);
  const [investigationCatalog, setInvestigationCatalog] = useState<InvestigationCatalogEntry[]>([]);
  const [referralSpecialties, setReferralSpecialties] = useState<ReferralSpecialtyEntry[]>([]);
  const [referralFacilities, setReferralFacilities] = useState<ReferralFacilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = async () => {
    setLoading(true);
    try {
      const [
        nextOverview,
        nextApprovals,
        nextDoctors,
        nextAuditLogs,
        nextDiagnosisCatalog,
        nextInvestigationCatalog,
        nextReferralSpecialties,
        nextReferralFacilities,
      ] = await Promise.all([
        fetchAdminOverview(),
        fetchApprovalRequests(),
        fetchAdminDoctors(),
        fetchAdminAuditLogs(),
        fetchAdminDiagnosisCatalog(),
        fetchAdminInvestigationCatalog(),
        fetchAdminReferralSpecialties(),
        fetchAdminReferralFacilities(),
      ]);

      setOverview(nextOverview);
      setApprovalRequests(nextApprovals);
      setDoctors(nextDoctors);
      setAuditLogs(nextAuditLogs);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pendingApprovals = useMemo(
    () => approvalRequests.filter(request => request.status === 'pending'),
    [approvalRequests]
  );

  const handleApprove = async (approvalRequestId: string) => {
    await approveDoctor(approvalRequestId);
    toast.success('Doctor approved');
    await load();
  };

  const handleReject = async (approvalRequestId: string) => {
    await rejectDoctor(approvalRequestId, 'Rejected by platform admin');
    toast.success('Signup request rejected');
    await load();
  };

  const handleStatusChange = async (doctorId: string, status: 'active' | 'suspended') => {
    await updateDoctorAccountStatus(doctorId, status);
    toast.success(status === 'active' ? 'Doctor reactivated' : 'Doctor suspended');
    await load();
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

  const kpis = [
    { label: 'Pending Approvals', value: overview.pendingApprovals, icon: ClipboardCheck },
    { label: 'Active Doctors', value: overview.activeDoctors, icon: Users },
    { label: 'Workspaces', value: overview.workspaces, icon: Building2 },
    { label: 'Appointments', value: overview.appointments, icon: ActivitySquare },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Operations</h1>
        <p className="text-sm text-muted-foreground">Manage doctor onboarding, subscriptions, and workspace usage.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <kpi.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Pending Approvals</h2>
              <p className="text-xs text-muted-foreground">Review new doctor access requests before workspace activation.</p>
            </div>
            <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">{pendingApprovals.length} pending</Badge>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading approvals...</p>
          ) : pendingApprovals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending approvals.</p>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map(request => (
                <div key={request.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{request.doctor.name}</p>
                        <Badge variant="outline" className={`text-[10px] ${getAccountStatusBadgeClass(request.status)}`}>
                          {formatStatusLabel(request.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{request.user.email} • {request.doctor.phone}</p>
                      <p className="text-xs text-muted-foreground mt-1">{request.doctor.specialization} • PMC {request.doctor.pmcNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">{request.clinicName}, {request.city}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void handleReject(request.id)}>Reject</Button>
                      <Button size="sm" onClick={() => void handleApprove(request.id)}>Approve</Button>
                    </div>
                  </div>
                  {request.notes && <p className="text-sm text-muted-foreground mt-3">{request.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Clinical Master Catalogs</h2>
            <p className="text-xs text-muted-foreground">Maintain the shared diagnosis, investigation, and referral directories that doctors search from.</p>
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
                <Button size="sm" onClick={() => void handleSaveDiagnosisCatalog()}>
                  {editingDiagnosisId ? 'Update Entry' : 'Add Entry'}
                </Button>
                {editingDiagnosisId && (
                  <Button variant="outline" size="sm" onClick={resetDiagnosisEditor}>
                    Cancel
                  </Button>
                )}
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
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingDiagnosisId(entry.id);
                        setDiagnosisDraft({ code: entry.code, name: entry.name, isActive: entry.isActive });
                      }}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteAdminDiagnosisCatalogEntry(entry.id).then(() => { toast.success('Diagnosis catalog entry deleted'); resetDiagnosisEditor(); return load(); })}>
                        Delete
                      </Button>
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
                <Button size="sm" onClick={() => void handleSaveInvestigationCatalog()}>
                  {editingInvestigationId ? 'Update Entry' : 'Add Entry'}
                </Button>
                {editingInvestigationId && (
                  <Button variant="outline" size="sm" onClick={resetInvestigationEditor}>
                    Cancel
                  </Button>
                )}
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
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingInvestigationId(entry.id);
                        setInvestigationDraft({ name: entry.name, category: entry.category, type: entry.type, isActive: entry.isActive });
                      }}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteAdminInvestigationCatalogEntry(entry.id).then(() => { toast.success('Investigation catalog entry deleted'); resetInvestigationEditor(); return load(); })}>
                        Delete
                      </Button>
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
                <Button size="sm" onClick={() => void handleSaveReferralSpecialty()}>
                  {editingReferralSpecialtyId ? 'Update Entry' : 'Add Entry'}
                </Button>
                {editingReferralSpecialtyId && (
                  <Button variant="outline" size="sm" onClick={resetReferralSpecialtyEditor}>
                    Cancel
                  </Button>
                )}
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {referralSpecialties.map(entry => (
                  <div key={entry.id} className="rounded-lg border border-border px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.isActive ? 'Active in doctor search' : 'Hidden from doctor search'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingReferralSpecialtyId(entry.id);
                        setReferralSpecialtyDraft({ name: entry.name, isActive: entry.isActive });
                      }}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteAdminReferralSpecialty(entry.id).then(() => { toast.success('Referral specialty deleted'); resetReferralSpecialtyEditor(); return load(); })}>
                        Delete
                      </Button>
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
                <Button size="sm" onClick={() => void handleSaveReferralFacility()}>
                  {editingReferralFacilityId ? 'Update Entry' : 'Add Entry'}
                </Button>
                {editingReferralFacilityId && (
                  <Button variant="outline" size="sm" onClick={resetReferralFacilityEditor}>
                    Cancel
                  </Button>
                )}
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
                      <Button variant="outline" size="sm" onClick={() => {
                        setEditingReferralFacilityId(entry.id);
                        setReferralFacilityDraft({ name: entry.name, city: entry.city, phone: entry.phone, isActive: entry.isActive });
                      }}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteAdminReferralFacility(entry.id).then(() => { toast.success('Referral facility deleted'); resetReferralFacilityEditor(); return load(); })}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Doctor Accounts</h2>
            <p className="text-xs text-muted-foreground">Monitor account status, plan assignments, and workspace usage.</p>
          </div>

          <div className="space-y-4">
            {doctors.map(doctor => {
              const planDraft = planDrafts[doctor.workspace.id];
              return (
                <div key={doctor.id} className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{doctor.name}</p>
                        <Badge variant="outline" className={`text-[10px] ${getAccountStatusBadgeClass(doctor.status)}`}>
                          {formatStatusLabel(doctor.status)}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${getSubscriptionStatusBadgeClass(doctor.subscription.status)}`}>
                          {formatStatusLabel(doctor.subscription.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{doctor.email} • {doctor.phone}</p>
                      <p className="text-xs text-muted-foreground">{doctor.specialization} • PMC {doctor.pmcNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">{doctor.workspace.name}, {doctor.workspace.city}</p>
                    </div>
                    <div className="flex gap-2">
                      {doctor.status === 'active' ? (
                        <Button variant="outline" size="sm" onClick={() => void handleStatusChange(doctor.id, 'suspended')}>
                          Suspend
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void handleStatusChange(doctor.id, 'active')}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                    <div className="rounded-md bg-muted/40 px-3 py-2">Clinics: <span className="font-medium text-foreground">{doctor.usage.clinics}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Patients: <span className="font-medium text-foreground">{doctor.usage.patients}</span></div>
                    <div className="rounded-md bg-muted/40 px-3 py-2">Appointments: <span className="font-medium text-foreground">{doctor.usage.appointments}</span></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                      <Button className="w-full" onClick={() => void handleSavePlan(doctor)}>Save Plan</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reset Password</Label>
                      <Input
                        type="password"
                        value={passwordDrafts[doctor.id] ?? ''}
                        onChange={event => setPasswordDrafts(prev => ({ ...prev, [doctor.id]: event.target.value }))}
                        placeholder="Set a temporary or new password"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" className="w-full md:w-auto" onClick={() => void handleResetPassword(doctor.id)}>
                        Reset Password
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Admin Audit Trail</h2>
            <p className="text-xs text-muted-foreground">Recent critical admin actions for onboarding and account management.</p>
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent audit entries.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{log.action.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('en-PK')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Actor: {log.actorUserId || 'system'} {log.targetUserId ? `• Target: ${log.targetUserId}` : ''} {log.workspaceId ? `• Workspace: ${log.workspaceId}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
