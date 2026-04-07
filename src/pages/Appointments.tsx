import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getLocalDateKey, parseDateKey } from '@/lib/date';
import { CalendarDays, Clock, Plus, ChevronLeft, ChevronRight, User, Pencil } from 'lucide-react';
import type { Appointment } from '@/data/mockData';
import { toast } from 'sonner';

export default function Appointments() {
  const { activeClinic, user } = useAuth();
  const {
    patients,
    getAppointmentsForClinic,
    getAppointmentsForClinicOnDate,
    getPatient,
    upsertAppointment,
  } = useData();
  const today = new Date();
  const allClinicAppointments = useMemo(
    () => getAppointmentsForClinic(activeClinic?.id || ''),
    [activeClinic?.id, getAppointmentsForClinic]
  );
  const availableDates = useMemo(
    () => [...new Set(allClinicAppointments.map(appointment => appointment.date))].sort((a, b) => b.localeCompare(a)),
    [allClinicAppointments]
  );
  const initialDate = availableDates.includes(getLocalDateKey(today))
    ? today
    : availableDates[0]
      ? parseDateKey(availableDates[0])
      : today;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const selectedDateKey = getLocalDateKey(selectedDate);
  const formattedDate = selectedDate.toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const clinicAppointments = useMemo(
    () => getAppointmentsForClinicOnDate(activeClinic?.id || '', selectedDateKey),
    [activeClinic?.id, getAppointmentsForClinicOnDate, selectedDateKey]
  );

  const timeSlots = Array.from({ length: 10 }, (_, i) => {
    const hour = 9 + i;
    return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
  });

  const statusColor: Record<string, string> = {
    scheduled: 'bg-muted text-muted-foreground',
    waiting: 'bg-warning/10 text-warning border-warning/20',
    'in-consultation': 'bg-primary/10 text-primary border-primary/20',
    completed: 'bg-success/10 text-success border-success/20',
    cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
    'no-show': 'bg-destructive/10 text-destructive border-destructive/20',
  };

  const defaultForm = {
    id: '',
    patientId: '',
    date: selectedDateKey,
    time: '09:00',
    type: 'new' as Appointment['type'],
    status: 'scheduled' as Appointment['status'],
    chiefComplaint: '',
    tokenNumber: 0,
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const updateForm = <K extends keyof typeof defaultForm>(field: K, value: (typeof defaultForm)[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const openNewAppointment = () => {
    setEditingAppointmentId(null);
    setForm({ ...defaultForm, date: selectedDateKey });
    setDialogOpen(true);
  };

  const openEditAppointment = (appointment: Appointment) => {
    setEditingAppointmentId(appointment.id);
    setForm({
      id: appointment.id,
      patientId: appointment.patientId,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
      status: appointment.status,
      chiefComplaint: appointment.chiefComplaint || '',
      tokenNumber: appointment.tokenNumber,
    });
    setDialogOpen(true);
  };

  const handleSaveAppointment = async () => {
    if (!activeClinic?.id) {
      toast.error('Please select a clinic first');
      return;
    }

    if (!form.patientId || !form.date || !form.time) {
      toast.error('Please select patient, date, and time');
      return;
    }

    const tokenNumber = editingAppointmentId
      ? form.tokenNumber
      : Math.max(
          0,
          ...getAppointmentsForClinic(activeClinic.id)
            .filter(appointment => appointment.date === form.date)
            .map(appointment => appointment.tokenNumber)
        ) + 1;

    await upsertAppointment({
      id: editingAppointmentId ?? `apt-${Date.now()}`,
      patientId: form.patientId,
      clinicId: activeClinic.id,
      doctorId: user?.id || 'doctor',
      date: form.date,
      time: form.time,
      status: form.status,
      type: form.type,
      chiefComplaint: form.chiefComplaint.trim(),
      tokenNumber,
    });

    toast.success(editingAppointmentId ? 'Appointment updated' : 'Appointment created');
    setDialogOpen(false);
    setEditingAppointmentId(null);
    setForm(defaultForm);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Appointments</h1>
          <p className="text-sm text-muted-foreground">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
            <Button size="sm" className="gap-1.5 ml-2" onClick={openNewAppointment}><Plus className="w-4 h-4" /> New Appointment</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: clinicAppointments.length, color: 'text-foreground' },
          { label: 'Waiting', value: clinicAppointments.filter(a => a.status === 'waiting').length, color: 'text-warning' },
          { label: 'In Progress', value: clinicAppointments.filter(a => a.status === 'in-consultation').length, color: 'text-primary' },
          { label: 'Completed', value: clinicAppointments.filter(a => a.status === 'completed').length, color: 'text-success' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {timeSlots.map(slot => {
              const slotAppointments = clinicAppointments.filter(a => {
                const h = parseInt(a.time.split(':')[0]);
                const slotHour = parseInt(slot.split(':')[0]) + (slot.includes('PM') && !slot.startsWith('12') ? 12 : 0);
                return h === slotHour;
              });

              return (
                <div key={slot} className="flex min-h-[60px]">
                  <div className="w-24 shrink-0 p-3 text-xs font-medium text-muted-foreground border-r border-border flex items-start">
                    <Clock className="w-3 h-3 mr-1.5 mt-0.5" />
                    {slot}
                  </div>
                  <div className="flex-1 p-2 flex flex-wrap gap-2">
                    {slotAppointments.map(apt => {
                      const patient = getPatient(apt.patientId);
                      return (
                        <div key={apt.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 min-w-[200px]">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{patient?.name}</p>
                            <p className="text-xs text-muted-foreground">{apt.time} • {apt.type}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColor[apt.status] || ''}`}>
                            {apt.status.replace('-', ' ')}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEditAppointment(apt)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                    {slotAppointments.length === 0 && (
                      <div className="flex items-center text-xs text-muted-foreground/50 py-1 px-2">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingAppointmentId ? 'Update Appointment' : 'New Appointment'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Patient</Label>
              <Select value={form.patientId} onValueChange={value => updateForm('patientId', value)}>
                <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map(patient => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} ({patient.mrn})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={event => updateForm('date', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={form.time} onChange={event => updateForm('time', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={value => updateForm('type', value as Appointment['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="follow-up">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={value => updateForm('status', value as Appointment['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="in-consultation">In Consultation</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no-show">No-show</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Chief Complaint</Label>
              <Input value={form.chiefComplaint} onChange={event => updateForm('chiefComplaint', event.target.value)} placeholder="Reason for visit" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveAppointment()}>{editingAppointmentId ? 'Save Changes' : 'Create Appointment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
