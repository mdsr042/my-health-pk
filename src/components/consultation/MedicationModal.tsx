import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { medicationLibrary, favoriteMedications, type Medication } from '@/data/mockData';
import { searchMedicationCatalog } from '@/lib/api';
import type { MedicationCatalogEntry } from '@/lib/app-types';
import { Badge } from '@/components/ui/badge';
import { parseDosePattern } from '@/lib/medication-pattern';
import { Search, Star, Plus, Pencil, Trash2 } from 'lucide-react';

interface MedicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (med: Medication) => void;
  onRemove: (medicationId: string) => void;
  prescribedMedications: Medication[];
}

export default function MedicationModal({ open, onOpenChange, onAdd, onRemove, prescribedMedications }: MedicationModalProps) {
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(true);
  const [selected, setSelected] = useState<Medication | null>(null);
  const [dosePattern, setDosePattern] = useState('');
  const [customFrequency, setCustomFrequency] = useState('');
  const [customFrequencyUrdu, setCustomFrequencyUrdu] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [customInstructionsUrdu, setCustomInstructionsUrdu] = useState('');
  const [catalogResults, setCatalogResults] = useState<MedicationCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) {
      setCatalogResults([]);
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const results = await searchMedicationCatalog(search.trim(), 50);
        if (!cancelled) {
          setCatalogResults(results);
        }
      } catch {
        if (!cancelled) {
          setCatalogResults([]);
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const localFiltered = medicationLibrary.filter(m => {
    if (!search) return showFavorites ? favoriteMedications.includes(m.id) : true;
    return m.name.toLowerCase().includes(search.toLowerCase()) || m.generic.toLowerCase().includes(search.toLowerCase());
  });

  const remoteFiltered = useMemo<Medication[]>(() => (
    catalogResults.map(entry => ({
      id: `cat-${entry.registrationNo}`,
      name: entry.brandName,
      nameUrdu: '',
      generic: entry.genericName || '',
      strength: entry.strengthText || '',
      form: entry.dosageForm || '',
      route: entry.route || '',
      frequency: '',
      frequencyUrdu: '',
      duration: '',
      durationUrdu: '',
      instructions: '',
      instructionsUrdu: '',
    }))
  ), [catalogResults]);

  const filtered = search.trim().length >= 2 ? remoteFiltered : localFiltered;

  const handleSelect = (med: Medication) => {
    setSelected(med);
    setDosePattern(med.dosePattern || '');
    setCustomFrequency(med.frequency);
    setCustomFrequencyUrdu(med.frequencyUrdu || '');
    setCustomDuration(med.duration);
    setCustomInstructions(med.instructions);
    setCustomInstructionsUrdu(med.instructionsUrdu || '');
  };

  const parsedPattern = useMemo(() => {
    if (!selected || !dosePattern.trim()) return null;
    return parseDosePattern(dosePattern, selected);
  }, [dosePattern, selected]);

  const patternError = useMemo(() => {
    if (!dosePattern.trim() || parsedPattern) return '';
    return 'Use 3-slot shorthand like 1+0+1, 1+1+1, 2+2+2, or special codes SOS / HS.';
  }, [dosePattern, parsedPattern]);

  const handleDosePatternChange = (value: string) => {
    setDosePattern(value);
    if (!selected) return;

    const parsed = parseDosePattern(value, selected);
    if (!parsed) return;

    setCustomFrequency(parsed.frequency);
    setCustomFrequencyUrdu(parsed.frequencyUrdu);

    if (parsed.instructions && (!customInstructions || customInstructions === selected.instructions)) {
      setCustomInstructions(parsed.instructions);
    }

    if (parsed.instructionsUrdu && (!customInstructionsUrdu || customInstructionsUrdu === selected.instructionsUrdu)) {
      setCustomInstructionsUrdu(parsed.instructionsUrdu);
    }
  };

  const handleAdd = () => {
    if (!selected) return;
    if (dosePattern.trim() && !parsedPattern) return;

    const isEditingExisting = prescribedMedications.some(med => med.id === selected.id);

    onAdd({
      ...selected,
      id: isEditingExisting ? selected.id : `rx-${Date.now()}`,
      dosePattern: parsedPattern?.normalizedPattern || dosePattern.trim() || selected.dosePattern,
      frequency: customFrequency || selected.frequency,
      frequencyUrdu: customFrequencyUrdu || selected.frequencyUrdu,
      duration: customDuration || selected.duration,
      instructions: customInstructions || selected.instructions,
      instructionsUrdu: customInstructionsUrdu || selected.instructionsUrdu,
    });
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setSelected(null);
      setSearch('');
      setShowFavorites(true);
      setDosePattern('');
      setCustomFrequency('');
      setCustomFrequencyUrdu('');
      setCustomDuration('');
      setCustomInstructions('');
      setCustomInstructionsUrdu('');
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Add Medication</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4 min-w-0">
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

            <div className="flex flex-wrap gap-2">
              <Button variant={showFavorites ? 'default' : 'outline'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setShowFavorites(true); setSearch(''); }}>
                <Star className="w-3 h-3" /> Favorites
              </Button>
              <Button variant={!showFavorites ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setShowFavorites(false)}>
                Browse All
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Medication Search Results
                </h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 p-2 scrollbar-thin">
                {catalogLoading && <p className="text-sm text-muted-foreground text-center py-3">Searching Pakistan medicine catalog...</p>}
                {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No medications found</p>}
                {filtered.map(med => (
                  <button
                    key={med.id}
                    onClick={() => handleSelect(med)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                      selected?.id === med.id ? 'bg-muted border border-border' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{med.name}</p>
                        {prescribedMedications.some(item => item.name === med.name) && (
                          <Badge variant="outline" className="text-[10px]">Added</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{med.generic} • {med.form} • {med.strength}</p>
                    </div>
                    {favoriteMedications.includes(med.id) && <Star className="w-3 h-3 text-warning fill-warning" />}
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already Prescribed</h3>
                <Badge variant="outline" className="text-[10px]">
                  {prescribedMedications.length}
                </Badge>
              </div>
              <div className="max-h-[220px] sm:max-h-[180px] overflow-y-auto space-y-2 p-3 scrollbar-thin">
                {prescribedMedications.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No medications added yet</p>
                ) : (
                  prescribedMedications.map((med, index) => (
                    <div key={med.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{index + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{med.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {med.frequency} • {med.duration} • {med.route}
                          </p>
                          {med.frequencyUrdu && (
                            <p className="text-xs text-muted-foreground text-right" dir="rtl">{med.frequencyUrdu}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Update medication"
                            onClick={() => handleSelect(med)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            title="Remove medication"
                            onClick={() => onRemove(med.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="space-y-4">
              {selected ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted px-3 py-2 border-b border-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Medication Configuration
                    </h3>
                  </div>
                  <div className="p-3 space-y-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="font-medium text-foreground">{selected.name}</p>
                      <p className="text-xs text-muted-foreground">{selected.generic} • {selected.strength} • {selected.form}</p>
                      <p className="text-xs text-muted-foreground mt-1" dir="rtl">{selected.nameUrdu}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Route</Label>
                        <Input value={selected.route} readOnly className="h-8 text-sm bg-muted/30" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Dose Pattern</Label>
                        <Input
                          value={dosePattern}
                          onChange={e => handleDosePatternChange(e.target.value)}
                          placeholder="1+0+1 / SOS / HS"
                          className="h-8 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">Examples: 1+0+1, 1+1+1, 2+2+2, SOS, HS</p>
                        {patternError && <p className="text-[11px] text-destructive">{patternError}</p>}
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
                        <Label className="text-xs">Frequency (Urdu)</Label>
                        <Input value={customFrequencyUrdu} onChange={e => setCustomFrequencyUrdu(e.target.value)} dir="rtl" className="h-8 text-sm" />
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
                      <Textarea value={customInstructionsUrdu} onChange={e => setCustomInstructionsUrdu(e.target.value)} dir="rtl" rows={2} className="text-sm resize-none" />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Clear</Button>
                      <Button size="sm" className="gap-1.5" onClick={handleAdd}>
                        <Plus className="w-4 h-4" />
                        {prescribedMedications.some(med => med.id === selected.id) ? 'Update Prescription' : 'Add to Prescription'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 sm:p-8 text-center text-sm text-muted-foreground">
                  Select a medicine from the list to set dose, frequency, duration, and instructions.
                </div>
              )}
            </div>

            <div className="mt-auto pt-6">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10"
                onClick={() => handleClose(false)}
              >
                Complete Prescription
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
