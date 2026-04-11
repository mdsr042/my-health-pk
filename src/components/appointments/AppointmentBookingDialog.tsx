import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Appointment, Clinic, Patient } from '@/data/mockData';

type BookingMode = 'create' | 'reschedule' | 'next';

type BookingForm = {
  id: string;
  patientId: string;
  clinicId: string;
  date: string;
  time: string;
  type: Appointment['type'];
  status: Appointment['status'];
  chiefComplaint: string;
  tokenNumber: number;
};

interface AppointmentBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mode: BookingMode;
  appointment?: Appointment | null;
  patient?: Patient | null;
  patients: Patient[];
  clinics: Clinic[];
  defaultClinicId?: string;
  defaultDate?: string;
  defaultType?: Appointment['type'];
  onSubmit: (form: BookingForm) => Promise<void>;
}

function buildInitialForm({
  appointment,
  patient,
  defaultClinicId,
  defaultDate,
  defaultType,
  mode,
}: {
  appointment?: Appointment | null;
  patient?: Patient | null;
  defaultClinicId?: string;
  defaultDate?: string;
  defaultType?: Appointment['type'];
  mode: BookingMode;
}): BookingForm {
  if (mode === 'reschedule' && appointment) {
    return {
      id: appointment.id,
      patientId: appointment.patientId,
      clinicId: appointment.clinicId,
      date: appointment.date,
      time: appointment.time,
      type: appointment.type,
      status: appointment.status,
      chiefComplaint: appointment.chiefComplaint || '',
      tokenNumber: appointment.tokenNumber,
    };
  }

  return {
    id: '',
    patientId: patient?.id || appointment?.patientId || '',
    clinicId: appointment?.clinicId || defaultClinicId || '',
    date: defaultDate || appointment?.date || '',
    time: appointment?.time || '09:00',
    type: defaultType || 'follow-up',
    status: 'scheduled',
    chiefComplaint: appointment?.chiefComplaint || '',
    tokenNumber: 0,
  };
}

export default function AppointmentBookingDialog({
  open,
  onOpenChange,
  title,
  mode,
  appointment,
  patient,
  patients,
  clinics,
  defaultClinicId,
  defaultDate,
  defaultType,
  onSubmit,
}: AppointmentBookingDialogProps) {
  const [form, setForm] = useState<BookingForm>(() =>
    buildInitialForm({ appointment, patient, defaultClinicId, defaultDate, defaultType, mode })
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm({ appointment, patient, defaultClinicId, defaultDate, defaultType, mode }));
  }, [appointment, patient, defaultClinicId, defaultDate, defaultType, mode, open]);

  const selectedPatient = useMemo(
    () => patients.find(item => item.id === form.patientId) ?? patient ?? null,
    [form.patientId, patient, patients]
  );

  const patientLocked = mode !== 'create' || Boolean(patient);

  const updateForm = <K extends keyof BookingForm>(field: K, value: BookingForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Patient</Label>
            {patientLocked ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium text-foreground">{selectedPatient?.name || 'Patient not found'}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPatient?.mrn || 'MRN unavailable'}
                  {selectedPatient ? ` • ${selectedPatient.age}y / ${selectedPatient.gender}` : ''}
                </p>
              </div>
            ) : (
              <Select value={form.patientId} onValueChange={value => updateForm('patientId', value)}>
                <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {patients.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.mrn})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Clinic</Label>
            <Select value={form.clinicId} onValueChange={value => updateForm('clinicId', value)}>
              <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
              <SelectContent>
                {clinics.map(clinic => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    {clinic.name}
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
            <Input
              value={form.chiefComplaint}
              onChange={event => updateForm('chiefComplaint', event.target.value)}
              placeholder="Reason for visit"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={isSaving}>
            {mode === 'reschedule' ? 'Save Changes' : 'Create Appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
