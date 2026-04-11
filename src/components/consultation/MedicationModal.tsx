import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Medication } from '@/data/mockData';
import {
  addMedicationFavorite,
  fetchMedicationCatalogDetail,
  fetchMedicationFavorites,
  removeMedicationFavorite,
  searchMedicationCatalog,
} from '@/lib/api';
import type { MedicationCatalogDetail, MedicationCatalogEntry, MedicationFavorite } from '@/lib/app-types';
import { Badge } from '@/components/ui/badge';
import { parseDosePattern } from '@/lib/medication-pattern';
import { Search, Star, Plus, Pencil, Trash2, Info } from 'lucide-react';

interface MedicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (med: Medication) => void;
  onRemove: (medicationId: string) => void;
  prescribedMedications: Medication[];
}

const instructionPresets = [
  { value: 'after_meals', en: 'Take after meals', ur: 'کھانے کے بعد لیں' },
  { value: 'empty_stomach', en: 'Take on empty stomach', ur: 'خالی پیٹ لیں' },
  { value: 'before_breakfast', en: 'Take before breakfast', ur: 'ناشتے سے پہلے لیں' },
  { value: 'bedtime', en: 'Take at bedtime', ur: 'رات سونے سے پہلے لیں' },
  { value: 'as_needed', en: 'Take when needed', ur: 'ضرورت کے وقت لیں' },
  { value: 'custom', en: 'Custom instruction', ur: '' },
] as const;

const customForms = ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Inhaler', 'Cream', 'Gel'] as const;
const customRoutes = ['Oral', 'Injectable', 'Topical', 'Ophthalmic', 'Inhalation', 'Nasal'] as const;

function toMedication(entry: MedicationCatalogEntry): Medication {
  return {
    id: `cat-${entry.registrationNo}`,
    name: entry.brandName,
    nameUrdu: '',
    generic: '',
    strength: entry.strengthText || '',
    form: entry.dosageForm || '',
    route: entry.route || '',
    frequency: '',
    frequencyUrdu: '',
    duration: '',
    durationUrdu: '',
    instructions: '',
    instructionsUrdu: '',
  };
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
  const [instructionPreset, setInstructionPreset] = useState<string>('select');
  const [catalogResults, setCatalogResults] = useState<MedicationCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogCursor, setCatalogCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favorites, setFavorites] = useState<MedicationFavorite[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());
  const [catalogDetail, setCatalogDetail] = useState<MedicationCatalogDetail | null>(null);
  const [detailLoadingRegNo, setDetailLoadingRegNo] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadFavorites = async () => {
      setFavoritesLoading(true);
      try {
        const data = await fetchMedicationFavorites();
        if (cancelled) return;
        setFavorites(data);
        setFavoriteKeys(new Set(data.map(item => item.registrationNo)));
      } finally {
        if (!cancelled) {
          setFavoritesLoading(false);
        }
      }
    };

    void loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (showFavorites || search.trim().length < 3) {
      setCatalogResults([]);
      setCatalogLoading(false);
      setCatalogHasMore(false);
      setCatalogCursor(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const result = await searchMedicationCatalog(search.trim(), 20, 0);
        if (cancelled) return;
        setCatalogResults(result.entries);
        setCatalogHasMore(result.hasMore);
        setCatalogCursor(result.nextCursor);
      } catch {
        if (!cancelled) {
          setCatalogResults([]);
          setCatalogHasMore(false);
          setCatalogCursor(null);
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
  }, [search, showFavorites]);

  const favoriteEntries = useMemo(
    () => favorites.map(item => toMedication(item.medicine)),
    [favorites]
  );

  const filtered = showFavorites ? favoriteEntries : catalogResults.map(toMedication);
  const isCustomMedication = selected?.id.startsWith('custom-') ?? false;

  const handleSelect = (med: Medication) => {
    setSelected(med);
    setDosePattern(med.dosePattern || '');
    setCustomFrequency(med.frequency);
    setCustomFrequencyUrdu(med.frequencyUrdu || '');
    setCustomDuration(med.duration);
    setCustomInstructions(med.instructions);
    setCustomInstructionsUrdu(med.instructionsUrdu || '');
    const matchingPreset = instructionPresets.find(preset => preset.en === med.instructions);
    setInstructionPreset(matchingPreset?.value ?? (med.instructions ? 'custom' : 'select'));
    setCatalogDetail(null);
  };

  const handleCustomMedication = () => {
    handleSelect({
      id: `custom-${Date.now()}`,
      name: search.trim() || '',
      nameUrdu: '',
      generic: '',
      strength: '',
      form: 'Tablet',
      route: 'Oral',
      frequency: '',
      frequencyUrdu: '',
      duration: '',
      durationUrdu: '',
      instructions: '',
      instructionsUrdu: '',
    });
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
    if (!selected.name.trim()) return;

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

  const handleInstructionPresetChange = (value: string) => {
    setInstructionPreset(value);
    const preset = instructionPresets.find(item => item.value === value);
    if (!preset) return;
    if (value === 'select' || value === 'custom') {
      setCustomInstructions('');
      setCustomInstructionsUrdu('');
      return;
    }
    setCustomInstructions(preset.en);
    setCustomInstructionsUrdu(preset.ur);
  };

  const handleOpenCatalogDetail = async (entry: MedicationCatalogEntry) => {
    setDetailLoadingRegNo(entry.registrationNo);
    try {
      const detail = await fetchMedicationCatalogDetail(entry.registrationNo);
      setCatalogDetail(detail);
      setSelected(current => current && current.id === `cat-${entry.registrationNo}`
        ? { ...current, generic: detail.genericName || current.generic, route: detail.route || current.route }
        : current);
    } finally {
      setDetailLoadingRegNo('');
    }
  };

  const handleToggleFavorite = async (registrationNo: string) => {
    const isFavorite = favoriteKeys.has(registrationNo);
    const previousKeys = new Set(favoriteKeys);
    const nextKeys = new Set(favoriteKeys);

    if (isFavorite) {
      nextKeys.delete(registrationNo);
    } else {
      nextKeys.add(registrationNo);
    }
    setFavoriteKeys(nextKeys);

    try {
      if (isFavorite) {
        await removeMedicationFavorite(registrationNo);
        setFavorites(current => current.filter(item => item.registrationNo !== registrationNo));
      } else {
        const favorite = await addMedicationFavorite(registrationNo);
        setFavorites(current => [favorite, ...current.filter(item => item.registrationNo !== registrationNo)]);
      }
    } catch {
      setFavoriteKeys(previousKeys);
    }
  };

  const loadMore = async () => {
    if (showFavorites || !catalogHasMore || catalogCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await searchMedicationCatalog(search.trim(), 20, catalogCursor);
      setCatalogResults(current => [...current, ...result.entries]);
      setCatalogHasMore(result.hasMore);
      setCatalogCursor(result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
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
      setInstructionPreset('select');
      setCatalogResults([]);
      setCatalogHasMore(false);
      setCatalogCursor(null);
      setCatalogDetail(null);
      setDetailLoadingRegNo('');
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
                onChange={e => {
                  setSearch(e.target.value);
                  if (e.target.value) setShowFavorites(false);
                }}
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
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleCustomMedication}>
                <Plus className="w-3 h-3" /> Add Custom Medicine
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Medication Search Results
                </h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 p-2 scrollbar-thin">
                {showFavorites && favoritesLoading && (
                  <p className="text-sm text-muted-foreground text-center py-3">Loading your favorite medicines...</p>
                )}
                {!showFavorites && catalogLoading && (
                  <p className="text-sm text-muted-foreground text-center py-3">Searching Pakistan medicine catalog...</p>
                )}
                {showFavorites && !favoritesLoading && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No favorite medicines yet. Search and star medicines to build your quick list.</p>
                )}
                {!showFavorites && search.trim().length < 3 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Type at least 3 letters to search the Pakistan medicine catalog.</p>
                )}
                {!showFavorites && search.trim().length >= 3 && !catalogLoading && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No medicines found in the Pakistan catalog.</p>
                )}
                {filtered.map(med => {
                  const registrationNo = med.id.startsWith('cat-') ? med.id.replace('cat-', '') : '';
                  const isFavorite = registrationNo ? favoriteKeys.has(registrationNo) : false;

                  return (
                    <div
                      key={med.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(med)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelect(med);
                        }
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left cursor-pointer ${
                        selected?.id === med.id ? 'bg-muted border border-border' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{med.name}</p>
                          {prescribedMedications.some(item => item.name === med.name) && (
                            <Badge variant="outline" className="text-[10px]">Added</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{med.form || 'Medicine'} • {med.strength || 'Strength not listed'}</p>
                      </div>
                      {registrationNo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={event => {
                            event.stopPropagation();
                            void handleToggleFavorite(registrationNo);
                          }}
                        >
                          <Star className={`w-4 h-4 ${isFavorite ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                        </Button>
                      ) : null}
                      {registrationNo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={event => {
                            event.stopPropagation();
                            void handleOpenCatalogDetail({
                              registrationNo,
                              brandName: med.name,
                              strengthText: med.strength,
                              dosageForm: med.form,
                              route: med.route,
                            });
                          }}
                        >
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      ) : null}
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
                {!showFavorites && filtered.length > 0 && catalogHasMore && (
                  <div className="pt-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => void loadMore()} disabled={loadingMore}>
                      {loadingMore ? 'Loading more...' : 'Load 20 more'}
                    </Button>
                  </div>
                )}
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
                      {isCustomMedication ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Medicine Name</Label>
                            <Input
                              value={selected.name}
                              onChange={e => setSelected(current => current ? { ...current, name: e.target.value } : current)}
                              placeholder="Enter medicine name"
                              className="h-8 text-sm bg-background"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Dose / Strength</Label>
                            <Input
                              value={selected.strength}
                              onChange={e => setSelected(current => current ? { ...current, strength: e.target.value } : current)}
                              placeholder="500mg / 5ml"
                              className="h-8 text-sm bg-background"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Form</Label>
                            <Select value={selected.form || 'Tablet'} onValueChange={value => setSelected(current => current ? { ...current, form: value } : current)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {customForms.map(form => (
                                  <SelectItem key={form} value={form}>{form}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Route</Label>
                            <Select value={selected.route || 'Oral'} onValueChange={value => setSelected(current => current ? { ...current, route: value } : current)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {customRoutes.map(route => (
                                  <SelectItem key={route} value={route}>{route}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-foreground">{selected.name}</p>
                          <p className="text-xs text-muted-foreground">{selected.generic || 'Detail available on demand'} • {selected.strength} • {selected.form}</p>
                          <p className="text-xs text-muted-foreground mt-1" dir="rtl">{selected.nameUrdu}</p>
                          {selected.id.startsWith('cat-') && (
                            <div className="mt-2 space-y-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => void handleOpenCatalogDetail({
                                  registrationNo: selected.id.replace('cat-', ''),
                                  brandName: selected.name,
                                  strengthText: selected.strength,
                                  dosageForm: selected.form,
                                  route: selected.route,
                                })}
                              >
                                {detailLoadingRegNo === selected.id.replace('cat-', '') ? 'Loading details...' : 'Get medicine details'}
                              </Button>
                              {catalogDetail && catalogDetail.registrationNo === selected.id.replace('cat-', '') && (
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <p>Generic: {catalogDetail.genericName || 'Not listed'}</p>
                                  <p>Company: {catalogDetail.companyName || 'Not listed'}</p>
                                  <p>Reg. No: {catalogDetail.registrationNo}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
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
                      <Select value={instructionPreset} onValueChange={handleInstructionPresetChange}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select instruction" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="select">Select instruction</SelectItem>
                          {instructionPresets.map(preset => (
                            <SelectItem key={preset.value} value={preset.value}>{preset.en}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {instructionPreset === 'custom' && (
                        <Textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={2} className="text-sm resize-none" />
                      )}
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
                  Search the Pakistan medicine catalog, open your favorites, or add a custom medicine to begin prescribing.
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
