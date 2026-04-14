import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  addFavoriteReferralFacility,
  addFavoriteReferralSpecialty,
  fetchFavoriteReferralFacilities,
  fetchFavoriteReferralSpecialties,
  fetchRecentReferralFacilities,
  fetchRecentReferralSpecialties,
  removeFavoriteReferralFacility,
  removeFavoriteReferralSpecialty,
  searchReferralFacilities,
  searchReferralSpecialties,
} from '@/lib/api';
import type { CareAction } from '@/data/mockData';
import type { ReferralFacilityEntry, ReferralSpecialtyEntry } from '@/lib/app-types';
import { ArrowRightLeft, Building2, CalendarPlus, Search, Star } from 'lucide-react';
import { toast } from 'sonner';

interface ReferralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'referral' | 'admission' | 'followup';
  patientName: string;
  onSave: (action: Omit<CareAction, 'id' | 'doctorId' | 'appointmentId' | 'patientId' | 'clinicId'>) => Promise<void> | void;
}

export default function ReferralModal({ open, onOpenChange, type, patientName, onSave }: ReferralModalProps) {
  const [sourceMode, setSourceMode] = useState<'favorites' | 'recent' | 'browse'>('favorites');
  const [search, setSearch] = useState('');
  const [specialties, setSpecialties] = useState<ReferralSpecialtyEntry[]>([]);
  const [facilities, setFacilities] = useState<ReferralFacilityEntry[]>([]);
  const [favoriteSpecialtyIds, setFavoriteSpecialtyIds] = useState<Set<string>>(new Set());
  const [favoriteFacilityIds, setFavoriteFacilityIds] = useState<Set<string>>(new Set());
  const [selectedSpecialty, setSelectedSpecialty] = useState<ReferralSpecialtyEntry | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<ReferralFacilityEntry | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine');
  const [followUpDate, setFollowUpDate] = useState('');
  const [loading, setLoading] = useState(false);

  const config = {
    referral: { title: 'Create Referral', icon: ArrowRightLeft, color: 'text-destructive' },
    admission: { title: 'Request Admission', icon: Building2, color: 'text-muted-foreground' },
    followup: { title: 'Schedule Follow-up', icon: CalendarPlus, color: 'text-primary' },
  }[type];

  const Icon = config.icon;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      if (type === 'followup') return;
      setLoading(true);
      try {
        if (type === 'referral') {
          const [favoriteData, recentData] = await Promise.all([
            fetchFavoriteReferralSpecialties(),
            fetchRecentReferralSpecialties(),
          ]);
          if (!cancelled) {
            setSpecialties(sourceMode === 'recent' ? recentData : favoriteData);
            setFavoriteSpecialtyIds(new Set(favoriteData.map(item => item.id)));
          }
        } else {
          const [favoriteData, recentData] = await Promise.all([
            fetchFavoriteReferralFacilities(),
            fetchRecentReferralFacilities(),
          ]);
          if (!cancelled) {
            setFacilities(sourceMode === 'recent' ? recentData : favoriteData);
            setFavoriteFacilityIds(new Set(favoriteData.map(item => item.id)));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, sourceMode, type]);

  useEffect(() => {
    if (!open || type === 'followup' || sourceMode !== 'browse') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (type === 'referral') {
          const result = await searchReferralSpecialties(search.trim(), 20);
          if (!cancelled) setSpecialties(result);
        } else {
          const result = await searchReferralFacilities(search.trim(), 20);
          if (!cancelled) setFacilities(result);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, sourceMode, type]);

  const list = useMemo(() => type === 'referral' ? specialties : facilities, [facilities, specialties, type]);

  const reset = () => {
    setSourceMode('favorites');
    setSearch('');
    setSelectedSpecialty(null);
    setSelectedFacility(null);
    setDoctorName('');
    setReason('');
    setUrgency('routine');
    setFollowUpDate('');
  };

  const handleToggleFavorite = async (id: string) => {
    if (type === 'referral') {
      const next = new Set(favoriteSpecialtyIds);
      const wasFavorite = next.has(id);
      if (wasFavorite) next.delete(id);
      else next.add(id);
      setFavoriteSpecialtyIds(next);
      try {
        if (wasFavorite) await removeFavoriteReferralSpecialty(id);
        else await addFavoriteReferralSpecialty(id);
      } catch {
        // best effort
      }
      return;
    }
    const next = new Set(favoriteFacilityIds);
    const wasFavorite = next.has(id);
    if (wasFavorite) next.delete(id);
    else next.add(id);
    setFavoriteFacilityIds(next);
    try {
      if (wasFavorite) await removeFavoriteReferralFacility(id);
      else await addFavoriteReferralFacility(id);
    } catch {
      // best effort
    }
  };

  const handleSubmit = async () => {
    if (type === 'followup') {
      if (!followUpDate) {
        toast.error('Please select a follow-up date');
        return;
      }
      await onSave({
        type: 'followup',
        targetType: 'date',
        targetId: '',
        title: `Follow-up on ${followUpDate}`,
        notes: reason || '',
        urgency,
        actionDate: followUpDate,
      });
      toast.success(`Follow-up scheduled for ${patientName}`);
      onOpenChange(false);
      reset();
      return;
    }

    if (type === 'referral') {
      if (!selectedSpecialty) {
        toast.error('Please select a specialty');
        return;
      }
      await onSave({
        type: 'referral',
        targetType: 'specialty',
        targetId: selectedSpecialty.id,
        title: selectedSpecialty.name,
        notes: [doctorName ? `Doctor: ${doctorName}` : '', reason].filter(Boolean).join('\n'),
        urgency,
        actionDate: '',
      });
      toast.success(`Referral created for ${patientName}`, { description: `To: ${selectedSpecialty.name}` });
    } else {
      if (!selectedFacility) {
        toast.error('Please select a hospital');
        return;
      }
      await onSave({
        type: 'admission',
        targetType: 'facility',
        targetId: selectedFacility.id,
        title: selectedFacility.name,
        notes: reason || '',
        urgency,
        actionDate: '',
      });
      toast.success(`Admission requested for ${patientName}`, { description: `At: ${selectedFacility.name}` });
    }
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-xl">
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
                <Textarea placeholder="Reason for follow-up, what to monitor..." value={reason} onChange={e => setReason(e.target.value)} rows={3} className="resize-none" />
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={type === 'referral' ? 'Search specialties...' : 'Search hospitals / facilities...'}
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    if (e.target.value) setSourceMode('browse');
                  }}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button variant={sourceMode === 'favorites' ? 'default' : 'outline'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setSourceMode('favorites'); setSearch(''); }}>
                  <Star className="w-3 h-3" /> Favorites
                </Button>
                <Button variant={sourceMode === 'recent' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => { setSourceMode('recent'); setSearch(''); }}>
                  Recent
                </Button>
                <Button variant={sourceMode === 'browse' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setSourceMode('browse')}>
                  Browse All
                </Button>
              </div>
              <div className="max-h-[220px] overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                {loading && <p className="text-sm text-muted-foreground text-center py-4">Loading options...</p>}
                {!loading && list.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No options found</p>}
                {list.map(item => {
                  const isSelected = type === 'referral' ? selectedSpecialty?.id === item.id : selectedFacility?.id === item.id;
                  const isFavorite = type === 'referral' ? favoriteSpecialtyIds.has(item.id) : favoriteFacilityIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => type === 'referral' ? setSelectedSpecialty(item as ReferralSpecialtyEntry) : setSelectedFacility(item as ReferralFacilityEntry)}
                      className={`flex items-center gap-3 rounded-lg p-3 text-left ${isSelected ? 'bg-muted border border-border' : 'hover:bg-muted/50'}`}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        {'city' in item && item.city ? <p className="text-xs text-muted-foreground">{item.city}{item.phone ? ` • ${item.phone}` : ''}</p> : null}
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 border border-primary/20 p-0 hover:border-primary/45" onClick={event => { event.stopPropagation(); void handleToggleFavorite(item.id); }}>
                        <Star className={`w-4 h-4 ${isFavorite ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {type === 'referral' && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Referred Doctor (optional)</Label>
                  <Input placeholder="Dr. name..." value={doctorName} onChange={e => setDoctorName(e.target.value)} />
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Urgency</Label>
            <Select value={urgency} onValueChange={value => setUrgency(value as 'routine' | 'urgent' | 'emergency')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{type === 'followup' ? 'Notes' : type === 'referral' ? 'Reason for Referral' : 'Reason for Admission'}</Label>
            <Textarea
              placeholder={type === 'followup' ? 'Reason for follow-up, what to monitor...' : type === 'referral' ? 'Clinical reason...' : 'Clinical indication for admission...'}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <Button className="w-full" onClick={() => void handleSubmit()}>
            {type === 'followup' ? 'Schedule Follow-up' : type === 'referral' ? 'Create Referral' : 'Request Admission'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
