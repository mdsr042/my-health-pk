import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowRightLeft, Building2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';

interface ReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'referral' | 'admission' | 'followup';
  patientName: string;
}

const specialties = [
  'Cardiology', 'Pulmonology', 'Gastroenterology', 'Nephrology', 'Neurology',
  'Orthopedics', 'Dermatology', 'ENT', 'Ophthalmology', 'Psychiatry',
  'Endocrinology', 'Oncology', 'Urology', 'Gynecology', 'Pediatrics',
];

const hospitals = [
  'Jinnah Hospital, Lahore', 'Mayo Hospital, Lahore', 'Services Hospital, Lahore',
  'Shaukat Khanum Memorial', 'Hameed Latif Hospital', 'National Hospital, Lahore',
];

export default function ReferralModal({ open, onOpenChange, type, patientName }: ReferralModalProps) {
  const [specialty, setSpecialty] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [hospital, setHospital] = useState('');
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState('routine');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');

  const config = {
    referral: { title: 'Create Referral', icon: ArrowRightLeft, color: 'text-destructive' },
    admission: { title: 'Request Admission', icon: Building2, color: 'text-muted-foreground' },
    followup: { title: 'Schedule Follow-up', icon: CalendarPlus, color: 'text-primary' },
  }[type];

  const Icon = config.icon;

  const handleSubmit = () => {
    if (type === 'followup') {
      if (!followUpDate) { toast.error('Please select a follow-up date'); return; }
      toast.success(`Follow-up scheduled for ${patientName}`, { description: `Date: ${followUpDate}` });
    } else if (type === 'referral') {
      if (!specialty) { toast.error('Please select a specialty'); return; }
      toast.success(`Referral created for ${patientName}`, { description: `To: ${specialty}${doctorName ? ` — Dr. ${doctorName}` : ''}` });
    } else {
      if (!hospital) { toast.error('Please select a hospital'); return; }
      toast.success(`Admission requested for ${patientName}`, { description: `At: ${hospital}` });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
            {config.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {type === 'followup' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">Follow-up Date</Label>
                <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Notes</Label>
                <Textarea
                  placeholder="Reason for follow-up, what to monitor..."
                  value={followUpNotes}
                  onChange={e => setFollowUpNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </>
          ) : type === 'referral' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">Specialty</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger><SelectValue placeholder="Select specialty..." /></SelectTrigger>
                  <SelectContent>
                    {specialties.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Referred Doctor (optional)</Label>
                <Input placeholder="Dr. name..." value={doctorName} onChange={e => setDoctorName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Reason for Referral</Label>
                <Textarea placeholder="Clinical reason..." value={reason} onChange={e => setReason(e.target.value)} rows={3} className="resize-none" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">Hospital / Facility</Label>
                <Select value={hospital} onValueChange={setHospital}>
                  <SelectTrigger><SelectValue placeholder="Select hospital..." /></SelectTrigger>
                  <SelectContent>
                    {hospitals.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Reason for Admission</Label>
                <Textarea placeholder="Clinical indication for admission..." value={reason} onChange={e => setReason(e.target.value)} rows={3} className="resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Elective</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button className="w-full" onClick={handleSubmit}>
            {type === 'followup' ? 'Schedule Follow-up' : type === 'referral' ? 'Create Referral' : 'Request Admission'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
