import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  approveDoctor,
  fetchAdminDoctors,
  fetchAdminOverview,
  fetchApprovalRequests,
  rejectDoctor,
  updateDoctorAccountStatus,
  updateWorkspaceSubscription,
} from '@/lib/api';
import type { AdminDoctorAccount, AdminOverview, ApprovalRequest } from '@/lib/app-types';
import { Users, ClipboardCheck, Building2, ActivitySquare } from 'lucide-react';

const emptyOverview: AdminOverview = {
  pendingApprovals: 0,
  activeDoctors: 0,
  suspendedDoctors: 0,
  workspaces: 0,
  clinics: 0,
  patients: 0,
  appointments: 0,
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
  const [loading, setLoading] = useState(true);
  const [planDrafts, setPlanDrafts] = useState<Record<string, { planName: string; status: AdminDoctorAccount['subscription']['status']; trialEndsAt: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [nextOverview, nextApprovals, nextDoctors] = await Promise.all([
        fetchAdminOverview(),
        fetchApprovalRequests(),
        fetchAdminDoctors(),
      ]);

      setOverview(nextOverview);
      setApprovalRequests(nextApprovals);
      setDoctors(nextDoctors);
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
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
