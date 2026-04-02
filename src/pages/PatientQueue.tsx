import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAppointmentsForClinic, getPatient } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, UserPlus, Play, CheckCircle2 } from 'lucide-react';
import WalkInModal from '@/components/consultation/WalkInModal';

interface PatientQueueProps {
  onOpenPatient: (patientId: string) => void;
}

export default function PatientQueue({ onOpenPatient }: PatientQueueProps) {
  const { activeClinic } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [walkInOpen, setWalkInOpen] = useState(false);

  const clinicAppointments = getAppointmentsForClinic(activeClinic?.id || '');

  const filtered = clinicAppointments.filter(apt => {
    const pat = getPatient(apt.patientId);
    const matchSearch = !search || pat?.name.toLowerCase().includes(search.toLowerCase()) || pat?.mrn.toLowerCase().includes(search.toLowerCase()) || pat?.phone.includes(search);
    const matchStatus = statusFilter === 'all' || apt.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'in-consultation': return 'bg-info/10 text-info border-info/20';
      case 'completed': return 'bg-success/10 text-success border-success/20';
      case 'scheduled': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'in-consultation': return 'In Consult';
      case 'waiting': return 'Waiting';
      case 'completed': return 'Completed';
      case 'scheduled': return 'Scheduled';
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

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient Queue</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} patients • {activeClinic?.name}</p>
        </div>
        <Button className="gap-2"><UserPlus className="w-4 h-4" /> Walk-in</Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, MRN, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
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
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
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
                  return (
                    <tr key={apt.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-medium">{apt.tokenNumber}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => onOpenPatient(apt.patientId)} className="text-left hover:text-primary">
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
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onOpenPatient(apt.patientId)}>
                            <Play className="w-3 h-3" /> Open
                          </Button>
                          {apt.status !== 'completed' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-success">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </Button>
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
    </div>
  );
}
