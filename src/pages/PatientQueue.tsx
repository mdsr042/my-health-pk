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
import { Search, Filter, UserPlus, Play, MoreHorizontal } from 'lucide-react';
import WalkInModal from '@/components/consultation/WalkInModal';
import { getLocalDateKey } from '@/lib/date';

interface PatientQueueProps {
  onOpenPatient: (patientId: string) => void;
}

export default function PatientQueue({ onOpenPatient }: PatientQueueProps) {
  const { activeClinic } = useAuth();
  const { getAppointmentsForClinic, getPatient, applyQueueAction } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const todayKey = getLocalDateKey(new Date());

  const clinicAppointments = getAppointmentsForClinic(activeClinic?.id || '');

  const filtered = useMemo(() => {
    const statusPriority = (status: string, date: string) => {
      const isToday = date === todayKey;
      if (isToday && status === 'in-consultation') return 0;
      if (isToday && status === 'waiting') return 1;
      if (isToday && status === 'completed') return 2;
      if (isToday && status === 'scheduled') return 3;
      if (isToday && status === 'cancelled') return 4;
      if (isToday && status === 'no-show') return 5;
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
        if (statusFilter === 'all') {
          const priorityDiff = statusPriority(a.status, a.date) - statusPriority(b.status, b.date);
          if (priorityDiff !== 0) return priorityDiff;
        }

        if (a.date !== b.date) {
          if (a.date === todayKey) return -1;
          if (b.date === todayKey) return 1;
          return b.date.localeCompare(a.date);
        }

        const timeDiff = a.time.localeCompare(b.time);
        if (timeDiff !== 0) return timeDiff;
        return a.tokenNumber - b.tokenNumber;
      });
  }, [clinicAppointments, getPatient, search, statusFilter, todayKey]);

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

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient Queue</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} patients • {activeClinic?.name}</p>
        </div>
        <Button className="gap-2" onClick={() => setWalkInOpen(true)}><UserPlus className="w-4 h-4" /> Walk-in</Button>
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

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">MRN</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Age/Gender</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Wait</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(apt => {
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
                      <td className="px-4 py-3 text-muted-foreground">{apt.time}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {(apt.status === 'waiting' || apt.status === 'in-consultation') ? getWaitingTime(apt.time) : '-'}
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
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      No patients found matching your criteria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onPatientCreated={(id) => {
          toast.success('Patient added to queue');
        }}
      />
    </div>
  );
}
