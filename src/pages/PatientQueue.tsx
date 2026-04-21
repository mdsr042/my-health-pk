import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Play, MoreHorizontal, CalendarPlus, ChevronRight } from 'lucide-react';
import AppointmentBookingDialog from '@/components/appointments/AppointmentBookingDialog';
import { getLocalDateKey } from '@/lib/date';
import type { Appointment, Patient } from '@/data/mockData';

interface PatientQueueProps {
  onOpenPatient: (patientId: string) => void;
}

function getTomorrowDateKey() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return getLocalDateKey(next);
}

export default function PatientQueue({ onOpenPatient }: PatientQueueProps) {
  const { activeClinic, doctorClinics, user } = useAuth();
  const { getAppointmentsForClinic, getPatient, applyQueueAction, upsertAppointment, patients, searchPatients } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bookingPatient, setBookingPatient] = useState<Patient | null>(null);
  const [pastQueueExpanded, setPastQueueExpanded] = useState(false);
  const todayKey = getLocalDateKey(new Date());

  const clinicAppointments = getAppointmentsForClinic(activeClinic?.id || '');

  const filtered = useMemo(() => {
    const statusPriority = (status: string) => {
      if (status === 'in-consultation') return 0;
      if (status === 'waiting') return 1;
      if (status === 'scheduled') return 2;
      if (status === 'cancelled') return 3;
      if (status === 'no-show') return 4;
      if (status === 'completed') return 5;
      return 10;
    };

    return clinicAppointments
      .filter(apt => {
        const pat = getPatient(apt.patientId);
        const normalizedSearch = search.toLowerCase();
        const matchSearch = !search
          || pat?.name.toLowerCase().includes(normalizedSearch)
          || pat?.mrn.toLowerCase().includes(normalizedSearch)
          || pat?.phone.includes(search);
        const matchStatus = statusFilter === 'all' || apt.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        if (a.date !== b.date) {
          if (a.date === todayKey) return -1;
          if (b.date === todayKey) return 1;
          return b.date.localeCompare(a.date);
        }

        const priorityDiff = statusPriority(a.status) - statusPriority(b.status);
        if (priorityDiff !== 0) return priorityDiff;

        const timeDiff = a.time.localeCompare(b.time);
        if (timeDiff !== 0) return timeDiff;
        return a.tokenNumber - b.tokenNumber;
      });
  }, [clinicAppointments, getPatient, search, statusFilter, todayKey]);

  const todayAppointments = useMemo(
    () => filtered.filter(apt => apt.date === todayKey),
    [filtered, todayKey]
  );

  const pastAppointments = useMemo(
    () => filtered.filter(apt => apt.date !== todayKey),
    [filtered, todayKey]
  );

  const statusColor = (s: string) => {
    switch (s) {
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'in-consultation': return 'bg-info/10 text-info border-info/20';
      case 'completed': return 'bg-success/10 text-success border-success/20';
      case 'scheduled': return 'bg-muted text-muted-foreground border-border';
      case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'no-show': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'in-consultation': return 'In Consult';
      case 'waiting': return 'Waiting';
      case 'completed': return 'Completed';
      case 'scheduled': return 'Scheduled';
      case 'cancelled': return 'Cancelled';
      case 'no-show': return 'No-show';
      default: return s;
    }
  };

  const getWaitingTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const aptTime = new Date();
    aptTime.setHours(h, m, 0);
    const diff = Math.max(0, Math.floor((now.getTime() - aptTime.getTime()) / 60000));
    return diff > 0 ? `${diff} min` : '-';
  };

  const formatQueueDateTime = (date: string, time: string) => {
    const [year, month, day] = date.split('-');
    const shortYear = year?.slice(-2) || '';
    return `${day}.${month}.${shortYear} • ${time}`;
  };

  const handleQueueAction = async (
    aptId: string,
    patientName: string,
    action: 'arrived' | 'start' | 'return-to-waiting' | 'restore-to-waiting' | 'complete' | 'cancel' | 'no-show'
  ) => {
    await applyQueueAction(aptId, action);

    const messages = {
      arrived: `${patientName} marked as arrived`,
      start: `${patientName} moved to consultation`,
      'return-to-waiting': `${patientName} returned to waiting`,
      'restore-to-waiting': `${patientName} restored to waiting`,
      complete: `${patientName} marked as completed`,
      cancel: `${patientName} cancelled`,
      'no-show': `${patientName} marked as no-show`,
    };

    toast.success(messages[action]);
  };

  const handleStartConsultation = async (aptId: string, patientId: string, status: string) => {
    if (status === 'scheduled' || status === 'waiting') {
      await applyQueueAction(aptId, 'start');
    }
    onOpenPatient(patientId);
  };

  const handleBookNextAppointment = async (form: {
    id: string;
    patientId: string;
    clinicId: string;
    date: string;
    time: string;
    type: Appointment['type'];
    status: Appointment['status'];
    chiefComplaint: string;
    tokenNumber: number;
  }) => {
    if (!form.patientId || !form.clinicId || !form.date || !form.time) {
      toast.error('Please complete clinic, date, and time');
      return;
    }

    await upsertAppointment({
      id: '',
      patientId: form.patientId,
      clinicId: form.clinicId,
      doctorId: user?.id || 'doctor',
      date: form.date,
      time: form.time,
      status: form.status,
      type: form.type,
      chiefComplaint: form.chiefComplaint.trim(),
      tokenNumber: 0,
    });

    toast.success('Next appointment booked');
    setBookingPatient(null);
  };

  const renderQueueRows = (items: Appointment[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">MRN</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Age/Gender</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date / Time</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Wait</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(apt => {
            const pat = getPatient(apt.patientId);
            const hasSecondaryActions =
              apt.status === 'scheduled' ||
              apt.status === 'waiting' ||
              apt.status === 'in-consultation' ||
              apt.status === 'completed' ||
              apt.status === 'cancelled' ||
              apt.status === 'no-show';
            const isStartable = apt.status === 'scheduled' || apt.status === 'waiting';
            const primaryActionLabel = isStartable ? 'Start' : 'Open';

            return (
              <tr key={apt.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground font-medium">{apt.tokenNumber}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => void handleStartConsultation(apt.id, apt.patientId, apt.status)} className="text-left hover:text-primary">
                    <p className="font-medium text-foreground">{pat?.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{apt.chiefComplaint}</p>
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">{pat?.mrn}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{pat?.phone}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{pat?.age} / {pat?.gender[0]}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatQueueDateTime(apt.date, apt.time)}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                  {(apt.date === todayKey && (apt.status === 'waiting' || apt.status === 'in-consultation')) ? getWaitingTime(apt.time) : '-'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px]">
                    {apt.type === 'new' ? 'New' : 'Follow-up'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(apt.status)}`}>
                    {statusLabel(apt.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => void handleStartConsultation(apt.id, apt.patientId, apt.status)}
                    >
                      <Play className="w-3 h-3" />
                      {primaryActionLabel}
                    </Button>
                    {hasSecondaryActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'no-show') && (
                            <DropdownMenuItem onClick={() => setBookingPatient(pat ?? null)} disabled={!pat}>
                              <CalendarPlus className="mr-2 h-4 w-4" /> Book Next Appointment
                            </DropdownMenuItem>
                          )}
                          {apt.status === 'scheduled' && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'arrived')}>
                              Mark Arrived
                            </DropdownMenuItem>
                          )}
                          {(apt.status === 'scheduled' || apt.status === 'waiting') && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'start')}>
                              Start Consultation
                            </DropdownMenuItem>
                          )}
                          {apt.status === 'in-consultation' && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'return-to-waiting')}>
                              Return to Waiting
                            </DropdownMenuItem>
                          )}
                          {(apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'no-show') && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'restore-to-waiting')}>
                              Restore to Waiting
                            </DropdownMenuItem>
                          )}
                          {apt.status !== 'completed' && apt.status !== 'cancelled' && apt.status !== 'no-show' && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'complete')}>
                              Complete
                            </DropdownMenuItem>
                          )}
                          {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'no-show')}>
                              Mark No-show
                            </DropdownMenuItem>
                          )}
                          {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                            <DropdownMenuItem onClick={() => void handleQueueAction(apt.id, pat?.name || '', 'cancel')}>
                              Cancel Visit
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                No patients found in this section
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient Queue</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} patients • {activeClinic?.name}</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, MRN, phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="in-consultation">In Consultation</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no-show">No-show</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Today&apos;s Queue</h2>
                  <p className="text-xs text-muted-foreground">Consultation first, then waiting, then the rest, with completed at the end.</p>
                </div>
                <Badge variant="outline">{todayAppointments.length}</Badge>
              </div>
              {renderQueueRows(todayAppointments)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => setPastQueueExpanded(current => !current)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${pastQueueExpanded ? 'rotate-90' : ''}`} />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Past Patient Queue</h2>
                    <p className="text-xs text-muted-foreground">Previous dates in the same queue order. Collapsed by default.</p>
                  </div>
                </div>
                <Badge variant="outline">{pastAppointments.length}</Badge>
              </button>
            </div>
            {pastQueueExpanded && renderQueueRows(pastAppointments)}
          </CardContent>
        </Card>
      </div>
      <AppointmentBookingDialog
        open={Boolean(bookingPatient)}
        onOpenChange={open => !open && setBookingPatient(null)}
        title="Book Next Appointment"
        mode="next"
        patient={bookingPatient}
        patients={patients}
        searchPatients={searchPatients}
        clinics={doctorClinics}
        defaultClinicId={activeClinic?.id}
        defaultDate={getTomorrowDateKey()}
        defaultType="follow-up"
        onSubmit={handleBookNextAppointment}
      />
    </div>
  );
}
