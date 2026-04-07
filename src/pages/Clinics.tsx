import { useState } from 'react';
import type { Clinic } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { createClinic, updateClinic } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Building2, MapPin, Phone, Clock, Pencil, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const defaultClinicForm = {
  id: '',
  name: '',
  location: '',
  city: '',
  phone: '',
  timings: '',
  specialties: '',
  logo: '🏥',
};

const clinicIconOptions = ['🏥', '🏨', '🏩', '🩺', '🏪', '🏬', '🏢', '❤️', '🧑‍⚕️'];

export default function ClinicsPage() {
  const { activeClinic, doctorClinics, switchClinic, refreshSession } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [clinicForm, setClinicForm] = useState(defaultClinicForm);

  const updateField = (field: keyof typeof defaultClinicForm, value: string) => {
    setClinicForm(prev => ({ ...prev, [field]: value }));
  };

  const openAddModal = () => {
    setEditingClinic(null);
    setClinicForm(defaultClinicForm);
    setModalOpen(true);
  };

  const openEditModal = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setClinicForm({
      id: clinic.id,
      name: clinic.name,
      location: clinic.location,
      city: clinic.city,
      phone: clinic.phone,
      timings: clinic.timings,
      specialties: clinic.specialties.join(', '),
      logo: clinic.logo || '🏥',
    });
    setModalOpen(true);
  };

  const handleSaveClinic = async () => {
    if (!clinicForm.name.trim() || !clinicForm.city.trim()) {
      toast.error('Please add clinic name and city');
      return;
    }

    const payload = {
      name: clinicForm.name.trim(),
      location: clinicForm.location.trim(),
      city: clinicForm.city.trim(),
      phone: clinicForm.phone.trim(),
      timings: clinicForm.timings.trim() || 'By appointment',
      specialties: clinicForm.specialties
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
      logo: clinicForm.logo.trim() || '🏥',
    };

    if (editingClinic) {
      await updateClinic(editingClinic.id, payload);
      toast.success('Clinic details updated');
    } else {
      await createClinic(payload);
      toast.success('Clinic added successfully');
    }

    await refreshSession();
    setModalOpen(false);
    setEditingClinic(null);
    setClinicForm(defaultClinicForm);
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Clinic Management</h1>
          <p className="text-sm text-muted-foreground">Manage existing clinics and add new practice locations.</p>
        </div>
        <Button onClick={openAddModal} className="gap-2">
          <Plus className="w-4 h-4" /> Add Clinic
        </Button>
      </div>

      <div className="grid gap-4">
        {doctorClinics.map(clinic => (
          <Card key={clinic.id} className="border-0 shadow-sm">
            <CardContent className="p-5 flex flex-col gap-4 md:flex-row md:items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                {clinic.logo}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{clinic.name}</h2>
                  {activeClinic?.id === clinic.id && (
                    <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">
                      Active
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{clinic.location}, {clinic.city}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{clinic.timings}</span>
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{clinic.phone || 'Not added'}</span>
                </div>
                {clinic.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {clinic.specialties.map(specialty => (
                      <Badge key={specialty} variant="outline" className="text-[10px]">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 md:justify-end">
                {activeClinic?.id !== clinic.id && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => switchClinic(clinic.id)}>
                    <CheckCircle2 className="w-4 h-4" /> Set Active
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEditModal(clinic)}>
                  <Pencil className="w-4 h-4" /> Update
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {editingClinic ? 'Update Clinic' : 'Add Clinic'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Clinic Name</Label>
              <Input value={clinicForm.name} onChange={e => updateField('name', e.target.value)} placeholder="Enter clinic name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={clinicForm.phone} onChange={e => updateField('phone', e.target.value)} placeholder="Enter clinic phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Practice Location</Label>
              <Input value={clinicForm.location} onChange={e => updateField('location', e.target.value)} placeholder="Enter location" />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={clinicForm.city} onChange={e => updateField('city', e.target.value)} placeholder="Enter city" />
            </div>
            <div className="space-y-1.5">
              <Label>Timings</Label>
              <Input value={clinicForm.timings} onChange={e => updateField('timings', e.target.value)} placeholder="e.g. 9:00 AM – 2:00 PM" />
            </div>
            <div className="space-y-1.5">
              <Label>Logo / Icon</Label>
              <Select value={clinicForm.logo} onValueChange={value => updateField('logo', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic icon" />
                </SelectTrigger>
                <SelectContent>
                  {clinicIconOptions.map(icon => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Specialties</Label>
              <Textarea
                rows={3}
                value={clinicForm.specialties}
                onChange={e => updateField('specialties', e.target.value)}
                placeholder="General Medicine, Pediatrics, Dermatology"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveClinic()}>{editingClinic ? 'Save Changes' : 'Add Clinic'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
