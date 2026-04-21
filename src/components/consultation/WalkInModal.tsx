import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Patient } from '@/data/mockData';

interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  onPatientCreated: (patientId: string) => void;
}

export default function WalkInModal({ open, onClose, onPatientCreated }: WalkInModalProps) {
  const { addWalkIn, searchPatients, searchPatientsByPhone } = useData();
  const { activeClinic } = useAuth();
  const emptyForm = {
    name: '', phone: '', age: '', gender: '' as string,
    cnic: '', address: '', bloodGroup: '', emergencyContact: '', chiefComplaint: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lookupMrn, setLookupMrn] = useState('');

  const selectedPatient = useMemo(
    () => matchedPatients.find(patient => patient.id === selectedPatientId) ?? null,
    [matchedPatients, selectedPatientId]
  );
  const isLocked = Boolean(selectedPatient);

  const clearProfileFieldsForNewPatient = (nextName = '') => {
    setSelectedPatientId('');
    setForm(prev => ({
      ...prev,
      name: nextName,
      age: '',
      gender: '',
      cnic: '',
      address: '',
      bloodGroup: '',
      emergencyContact: '',
    }));
  };

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));

    if (field === 'phone') {
      if (selectedPatientId) {
        clearProfileFieldsForNewPatient(form.name);
      }
      return;
    }

    if (field === 'name' && selectedPatient && value !== selectedPatient.name) {
      clearProfileFieldsForNewPatient(value);
    }
  };

  useEffect(() => {
    if (!open) return;

    const activeQuery = lookupMrn.trim() || form.phone.trim();
    const mode: 'phone' | 'mrn' = lookupMrn.trim() ? 'mrn' : 'phone';

    if (!activeQuery) {
      setMatchedPatients([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (mode === 'phone'
        ? searchPatientsByPhone(activeQuery)
        : searchPatients(activeQuery)
      )
        .then(results => {
          if (!active) return;
          setMatchedPatients(results);
          if (selectedPatientId && !results.some(patient => patient.id === selectedPatientId)) {
            clearProfileFieldsForNewPatient(form.name);
          }
        })
        .finally(() => {
          if (active) {
            setIsSearching(false);
          }
        });
      setIsSearching(true);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.name, form.phone, lookupMrn, open, searchPatients, searchPatientsByPhone, selectedPatientId]);

  const handleSelectMatchedPatient = (patientId: string) => {
    const patient = matchedPatients.find(item => item.id === patientId);
    if (!patient) return;
    setLookupMrn(patient.mrn || '');
    setSelectedPatientId(patient.id);
    setForm(prev => ({
      ...prev,
      name: patient.name,
      phone: patient.phone || prev.phone,
      age: String(patient.age || ''),
      gender: patient.gender || '',
      cnic: patient.cnic || '',
      address: patient.address || '',
      bloodGroup: patient.bloodGroup || '',
      emergencyContact: patient.emergencyContact || '',
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.age || !form.gender) {
      toast.error('Please fill required fields: Name, Phone, Age, Gender');
      return;
    }
    const result = await addWalkIn({ ...form, patientId: selectedPatientId || undefined }, activeClinic?.id || 'clinic-1');
    toast.success(
      result.reusedPatient
        ? `Existing patient "${result.patient.name}" added back to today's queue`
        : `Walk-in patient "${result.patient.name}" added to queue`,
      {
        description: result.reusedPatient
          ? 'Matched by selected patient'
          : 'New patient record created',
      }
    );
    onPatientCreated(result.patient.id);
    resetState();
    onClose();
  };

  const resetState = () => {
    setForm(emptyForm);
    setMatchedPatients([]);
    setSelectedPatientId('');
    setLookupMrn('');
    setIsSearching(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" /> Register Walk-in Patient
          </DialogTitle>
        </DialogHeader>
        <form className="grid gap-4 py-2" autoComplete="off">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Existing Patient Lookup</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="walkin-mrn">MRN Number</Label>
                <div className="relative">
                  <Input
                    id="walkin-mrn"
                    placeholder="Search by MRN"
                    value={lookupMrn}
                    onChange={e => setLookupMrn(e.target.value)}
                    autoComplete="off"
                    name="walkin-mrn-search"
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="walkin-phone">Phone <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="walkin-phone"
                    placeholder="03XX-XXXXXXX"
                    value={form.phone}
                    onChange={e => update('phone', e.target.value)}
                    autoComplete="off"
                    name="walkin-phone"
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </div>
            </div>
            {selectedPatient && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Existing Patient Selected</p>
                <p className="text-sm text-foreground">
                  Appointment will continue under MRN <span className="font-semibold">{selectedPatient.mrn}</span>.
                </p>
              </div>
            )}
            {matchedPatients.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Matching patient records found. Select one to continue on the same MRN, or keep typing a different name to create a new patient.
                </p>
                <div className="rounded-md border border-border bg-background p-2 space-y-1">
                  {matchedPatients.map(patient => (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handleSelectMatchedPatient(patient.id)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                        selectedPatientId === patient.id
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {patient.name} • {patient.mrn} • {patient.phone || 'No phone'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="walkin-name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="walkin-name"
                placeholder="e.g. Muhammad Ali Khan"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                autoComplete="off"
                name="walkin-full-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-cnic">CNIC</Label>
              <Input id="walkin-cnic" placeholder="XXXXX-XXXXXXX-X" value={form.cnic} onChange={e => update('cnic', e.target.value)} disabled={isLocked} autoComplete="off" name="walkin-cnic" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="walkin-age">Age <span className="text-destructive">*</span></Label>
              <Input id="walkin-age" type="number" placeholder="Years" value={form.age} onChange={e => update('age', e.target.value)} disabled={isLocked} autoComplete="off" name="walkin-age" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender <span className="text-destructive">*</span></Label>
              <Select value={form.gender} onValueChange={v => update('gender', v)} disabled={isLocked}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Blood Group</Label>
              <Select value={form.bloodGroup || 'unknown'} onValueChange={v => update('bloodGroup', v === 'unknown' ? '' : v)} disabled={isLocked}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Unknown / Not Selected</SelectItem>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkin-address">Address</Label>
            <Input id="walkin-address" placeholder="House / Street / Area" value={form.address} onChange={e => update('address', e.target.value)} disabled={isLocked} autoComplete="off" name="walkin-address" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkin-emergency">Emergency Contact</Label>
            <Input id="walkin-emergency" placeholder="Name — Phone" value={form.emergencyContact} onChange={e => update('emergencyContact', e.target.value)} disabled={isLocked} autoComplete="off" name="walkin-emergency-contact" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkin-complaint">Chief Complaint</Label>
            <Textarea id="walkin-complaint" placeholder="Reason for visit..." rows={2} value={form.chiefComplaint} onChange={e => update('chiefComplaint', e.target.value)} autoComplete="off" name="walkin-chief-complaint" />
          </div>
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} className="gap-2">
            <UserPlus className="w-4 h-4" /> Register & Add to Queue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
