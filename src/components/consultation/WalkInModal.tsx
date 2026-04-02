import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { addWalkInPatient } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';

interface WalkInModalProps {
  open: boolean;
  onClose: () => void;
  onPatientCreated: (patientId: string) => void;
}

export default function WalkInModal({ open, onClose, onPatientCreated }: WalkInModalProps) {
  const { activeClinic } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    age: '',
    gender: '' as string,
    cnic: '',
    address: '',
    bloodGroup: '',
    emergencyContact: '',
    chiefComplaint: '',
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.phone.trim() || !form.age || !form.gender) {
      toast.error('Please fill required fields: Name, Phone, Age, Gender');
      return;
    }

    // Generate a mock patient ID and MRN
    const patientId = `p-walkin-${Date.now()}`;
    toast.success(`Walk-in patient "${form.name}" registered successfully`);
    onPatientCreated(patientId);
    setForm({ name: '', phone: '', age: '', gender: '', cnic: '', address: '', bloodGroup: '', emergencyContact: '', chiefComplaint: '' });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Register Walk-in Patient
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Row 1: Name */}
          <div className="space-y-1.5">
            <Label htmlFor="walkin-name">Full Name <span className="text-destructive">*</span></Label>
            <Input id="walkin-name" placeholder="e.g. Muhammad Ali Khan" value={form.name} onChange={e => update('name', e.target.value)} />
          </div>

          {/* Row 2: Phone + CNIC */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="walkin-phone">Phone <span className="text-destructive">*</span></Label>
              <Input id="walkin-phone" placeholder="03XX-XXXXXXX" value={form.phone} onChange={e => update('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-cnic">CNIC</Label>
              <Input id="walkin-cnic" placeholder="XXXXX-XXXXXXX-X" value={form.cnic} onChange={e => update('cnic', e.target.value)} />
            </div>
          </div>

          {/* Row 3: Age + Gender + Blood Group */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="walkin-age">Age <span className="text-destructive">*</span></Label>
              <Input id="walkin-age" type="number" placeholder="Years" value={form.age} onChange={e => update('age', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gender <span className="text-destructive">*</span></Label>
              <Select value={form.gender} onValueChange={v => update('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Blood Group</Label>
              <Select value={form.bloodGroup} onValueChange={v => update('bloodGroup', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 4: Address */}
          <div className="space-y-1.5">
            <Label htmlFor="walkin-address">Address</Label>
            <Input id="walkin-address" placeholder="House / Street / Area" value={form.address} onChange={e => update('address', e.target.value)} />
          </div>

          {/* Row 5: Emergency Contact */}
          <div className="space-y-1.5">
            <Label htmlFor="walkin-emergency">Emergency Contact</Label>
            <Input id="walkin-emergency" placeholder="Name — Phone" value={form.emergencyContact} onChange={e => update('emergencyContact', e.target.value)} />
          </div>

          {/* Row 6: Chief Complaint */}
          <div className="space-y-1.5">
            <Label htmlFor="walkin-complaint">Chief Complaint</Label>
            <Textarea id="walkin-complaint" placeholder="Reason for visit..." rows={2} value={form.chiefComplaint} onChange={e => update('chiefComplaint', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} className="gap-2">
            <UserPlus className="w-4 h-4" /> Register & Add to Queue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
