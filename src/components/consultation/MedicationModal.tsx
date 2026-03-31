import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { medicationLibrary, favoriteMedications, type Medication } from '@/data/mockData';
import { Search, Star, Plus } from 'lucide-react';

interface MedicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (med: Medication) => void;
}

export default function MedicationModal({ open, onOpenChange, onAdd }: MedicationModalProps) {
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(true);
  const [selected, setSelected] = useState<Medication | null>(null);
  const [customFrequency, setCustomFrequency] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');

  const filtered = medicationLibrary.filter(m => {
    if (!search) return showFavorites ? favoriteMedications.includes(m.id) : true;
    return m.name.toLowerCase().includes(search.toLowerCase()) || m.generic.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (med: Medication) => {
    setSelected(med);
    setCustomFrequency(med.frequency);
    setCustomDuration(med.duration);
    setCustomInstructions(med.instructions);
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd({
      ...selected,
      id: `rx-${Date.now()}`,
      frequency: customFrequency || selected.frequency,
      duration: customDuration || selected.duration,
      instructions: customInstructions || selected.instructions,
    });
    setSelected(null);
    setSearch('');
  };

  const handleClose = (o: boolean) => {
    if (!o) { setSelected(null); setSearch(''); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected ? 'Customize Medication' : 'Add Medication'}</DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by brand or generic name..."
                value={search}
                onChange={e => { setSearch(e.target.value); if (e.target.value) setShowFavorites(false); }}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant={showFavorites ? 'default' : 'outline'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setShowFavorites(true); setSearch(''); }}>
                <Star className="w-3 h-3" /> Favorites
              </Button>
              <Button variant={!showFavorites ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setShowFavorites(false)}>
                Browse All
              </Button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin">
              {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No medications found</p>}
              {filtered.map(med => (
                <button
                  key={med.id}
                  onClick={() => handleSelect(med)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{med.name}</p>
                    <p className="text-xs text-muted-foreground">{med.generic} • {med.form} • {med.strength}</p>
                  </div>
                  {favoriteMedications.includes(med.id) && <Star className="w-3 h-3 text-warning fill-warning" />}
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="font-medium text-foreground">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{selected.generic} • {selected.strength} • {selected.form}</p>
              <p className="text-xs text-muted-foreground mt-1" dir="rtl">{selected.nameUrdu}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Route</Label>
                <Input value={selected.route} readOnly className="h-8 text-sm bg-muted/30" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Frequency</Label>
                <Select value={customFrequency} onValueChange={setCustomFrequency}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Once daily">Once daily</SelectItem>
                    <SelectItem value="Twice daily">Twice daily</SelectItem>
                    <SelectItem value="Three times daily">Three times daily</SelectItem>
                    <SelectItem value="Four times daily">Four times daily</SelectItem>
                    <SelectItem value="As needed">As needed</SelectItem>
                    <SelectItem value="At bedtime">At bedtime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duration</Label>
                <Input value={customDuration} onChange={e => setCustomDuration(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Instructions (English)</Label>
              <Textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={2} className="text-sm resize-none" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Instructions (Urdu)</Label>
              <Textarea value={selected.instructionsUrdu} dir="rtl" rows={2} className="text-sm resize-none" readOnly />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Back</Button>
              <Button size="sm" className="gap-1.5" onClick={handleAdd}>
                <Plus className="w-4 h-4" /> Add to Prescription
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
