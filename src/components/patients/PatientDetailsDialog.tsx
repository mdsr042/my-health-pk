import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Patient } from '@/data/mockData';

interface PatientDetailsDialogProps {
  open: boolean;
  patient: Patient | null;
  onOpenChange: (open: boolean) => void;
  onSave: (patient: Patient) => Promise<void>;
}

export default function PatientDetailsDialog({
  open,
  patient,
  onOpenChange,
  onSave,
}: PatientDetailsDialogProps) {
  const [form, setForm] = useState<Patient | null>(patient);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(patient);
  }, [open, patient]);

  const updateField = <K extends keyof Patient>(field: K, value: Patient[K]) => {
    setForm(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        cnic: form.cnic.trim(),
        address: form.address.trim(),
        bloodGroup: form.bloodGroup.trim(),
        emergencyContact: form.emergencyContact.trim(),
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Patient Details</DialogTitle>
        </DialogHeader>
        {form ? (
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>MRN</Label>
              <Input value={form.mrn} disabled />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={event => updateField('name', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={event => updateField('phone', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CNIC</Label>
              <Input value={form.cnic} onChange={event => updateField('cnic', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input
                type="number"
                value={form.age}
                onChange={event => updateField('age', Number(event.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={value => updateField('gender', value as Patient['gender'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Blood Group</Label>
              <Input value={form.bloodGroup} onChange={event => updateField('bloodGroup', event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input value={form.emergencyContact} onChange={event => updateField('emergencyContact', event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={event => updateField('address', event.target.value)} />
            </div>
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">Patient not found.</p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!form || isSaving}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
