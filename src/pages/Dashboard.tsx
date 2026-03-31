import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAppointmentsForClinic, patients, getPatient } from '@/data/mockData';
import {
  Users, Clock, Stethoscope, CheckCircle2, AlertTriangle,
  TrendingUp, ArrowRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardProps {
  onOpenPatient: (patientId: string) => void;
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onOpenPatient, onNavigate }: DashboardProps) {
  const { activeClinic } = useAuth();
  const clinicAppointments = getAppointmentsForClinic(activeClinic?.id || '');

  const stats = {
    total: clinicAppointments.length,
    waiting: clinicAppointments.filter(a => a.status === 'waiting').length,
    inConsultation: clinicAppointments.filter(a => a.status === 'in-consultation').length,
    completed: clinicAppointments.filter(a => a.status === 'completed').length,
    scheduled: clinicAppointments.filter(a => a.status === 'scheduled').length,
  };

  const kpis = [
    { label: 'Total Today', value: stats.total, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Waiting', value: stats.waiting, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'In Consultation', value: stats.inConsultation, icon: Stethoscope, color: 'text-info', bg: 'bg-info/10' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Pending', value: stats.scheduled, icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted' },
  ];

  const hourlyData = [
    { hour: '9AM', patients: 3 }, { hour: '10AM', patients: 5 }, { hour: '11AM', patients: 4 },
    { hour: '12PM', patients: 2 }, { hour: '1PM', patients: 3 }, { hour: '2PM', patients: 1 },
  ];

  const statusData = [
    { name: 'Completed', value: stats.completed, color: 'hsl(152, 60%, 40%)' },
    { name: 'Waiting', value: stats.waiting, color: 'hsl(38, 92%, 50%)' },
    { name: 'In Consult', value: stats.inConsultation, color: 'hsl(210, 75%, 55%)' },
    { name: 'Scheduled', value: stats.scheduled, color: 'hsl(210, 15%, 75%)' },
  ];

  const waitingPatients = clinicAppointments
    .filter(a => a.status === 'waiting' || a.status === 'in-consultation')
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  const statusColor = (s: string) => {
    switch (s) {
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'in-consultation': return 'bg-info/10 text-info border-info/20';
      case 'completed': return 'bg-success/10 text-success border-success/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{activeClinic?.name} • {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button
          onClick={() => onNavigate('queue')}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View Queue <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts & Queue */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Bar chart */}
        <Card className="lg:col-span-1 border-0 shadow-sm">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Hourly Flow
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Bar dataKey="patients" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-4">Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {statusData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Active Queue */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" /> Active Queue
            </h3>
            <div className="space-y-2">
              {waitingPatients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No patients in queue</p>
              )}
              {waitingPatients.map(apt => {
                const pat = getPatient(apt.patientId);
                return (
                  <button
                    key={apt.id}
                    onClick={() => onOpenPatient(apt.patientId)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {apt.tokenNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{pat?.name}</p>
                      <p className="text-xs text-muted-foreground">{apt.chiefComplaint}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${statusColor(apt.status)}`}>
                      {apt.status === 'in-consultation' ? 'In Consult' : 'Waiting'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Patients */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-4">Today's Appointments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">Patient</th>
                  <th className="pb-3 font-medium hidden sm:table-cell">MRN</th>
                  <th className="pb-3 font-medium hidden md:table-cell">Age/Gender</th>
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {clinicAppointments.map(apt => {
                  const pat = getPatient(apt.patientId);
                  return (
                    <tr key={apt.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 text-muted-foreground">{apt.tokenNumber}</td>
                      <td className="py-3 font-medium text-foreground">{pat?.name}</td>
                      <td className="py-3 text-muted-foreground hidden sm:table-cell">{pat?.mrn}</td>
                      <td className="py-3 text-muted-foreground hidden md:table-cell">{pat?.age}/{pat?.gender[0]}</td>
                      <td className="py-3 text-muted-foreground">{apt.time}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-[10px]">
                          {apt.type === 'new' ? 'New' : 'Follow-up'}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className={`text-[10px] ${statusColor(apt.status)}`}>
                          {apt.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => onOpenPatient(apt.patientId)}
                          className="text-xs text-primary hover:underline"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
