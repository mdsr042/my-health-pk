import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  fetchMedicationPreferences,
  removeMedicationFavorite,
  saveMedicationPreference,
  searchMedicationCatalog,
} from '@/lib/api';
import type { MedicationCatalogDetail, MedicationCatalogEntry, MedicationFavorite, MedicationPreference } from '@/lib/app-types';
import { Badge } from '@/components/ui/badge';
import { parseDosePattern } from '@/lib/medication-pattern';
import { Search, Star, Plus, Pencil, Trash2, Info } from 'lucide-react';

interface MedicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (med: Medication) => void;
  onRemove: (medicationId: string) => void;
  prescribedMedications: Medication[];
  mode?: 'prescription' | 'favorites';
  onFavoriteSaved?: () => void;
}

const instructionPresets = [
  { value: 'after_meals', en: 'Take after meals', ur: 'کھانے کے بعد لیں' },
  { value: 'empty_stomach', en: 'Take on empty stomach', ur: 'خالی پیٹ لیں' },
  { value: 'before_breakfast', en: 'Take before breakfast', ur: 'ناشتے سے پہلے لیں' },
  { value: 'bedtime', en: 'Take at bedtime', ur: 'رات سونے سے پہلے لیں' },
  { value: 'as_needed', en: 'Take when needed', ur: 'ضرورت کے وقت لیں' },
  { value: 'custom', en: 'Custom instruction', ur: '' },
] as const;

const dosePatternSnippets = ['1+1+1', '1+0+1', '1+1'] as const;

const customForms = ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Inhaler', 'Cream', 'Gel'] as const;
const customRoutes = ['Oral', 'Injectable', 'Topical', 'Ophthalmic', 'Inhalation', 'Nasal'] as const;
const prescriptionLanguageOptions = [
  { value: 'en', label: 'English Only' },
  { value: 'ur', label: 'Urdu Only' },
  { value: 'bilingual', label: 'Bilingual' },
] as const;

function normalizeMedicationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, '')
    .trim();
}

function getCatalogDisplayKey(entry: MedicationCatalogEntry) {
  return [
    normalizeMedicationKey(entry.brandName),
    normalizeMedicationKey(entry.genericName),
    normalizeMedicationKey(entry.strengthText),
    normalizeMedicationKey(entry.dosageForm),
    normalizeMedicationKey(entry.companyName),
  ].join('|');
}

function getMedicationMatchKey(medication: Partial<Medication>) {
  const medicationId = String(medication.id ?? '');
  if (medicationId.startsWith('cat-')) {
    return `catalog:${medicationId.replace('cat-', '')}`;
  }

  return [
    'custom',
    normalizeMedicationKey(String(medication.name ?? '')),
    normalizeMedicationKey(String(medication.strength ?? '')),
    normalizeMedicationKey(String(medication.form ?? '')),
    normalizeMedicationKey(String(medication.route ?? '')),
  ].join('|');
}

function getMedicationPreferenceKey(medication: Medication) {
  if (medication.id.startsWith('cat-')) {
    return medication.id.replace('cat-', '');
  }
  return `name:${normalizeMedicationKey(medication.name)}`;
}

function inferLanguageMode(medication: Partial<Medication>): 'en' | 'ur' | 'bilingual' {
  if (medication.languageMode) {
    return medication.languageMode;
  }
  const hasEnglish = Boolean(medication.frequency || medication.instructions);
  const hasUrdu = Boolean(medication.frequencyUrdu || medication.instructionsUrdu);
  if (hasEnglish && hasUrdu) return 'bilingual';
  if (hasUrdu) return 'ur';
  return 'en';
}

function toMedication(entry: MedicationCatalogEntry): Medication {
  return {
    id: `cat-${entry.registrationNo}`,
    name: entry.brandName,
    nameUrdu: '',
    generic: entry.genericName || '',
    strength: entry.strengthText || '',
    form: entry.dosageForm || '',
    route: entry.route || '',
    languageMode: 'bilingual',
    frequency: '',
    frequencyUrdu: '',
    duration: '',
    durationUrdu: '',
    instructions: '',
    instructionsUrdu: '',
  };
}

function dedupeMedications<T extends Medication>(items: T[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = getMedicationMatchKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function MedicationModal({
  open,
  onOpenChange,
  onAdd,
  onRemove,
  prescribedMedications,
  mode = 'prescription',
  onFavoriteSaved,
}: MedicationModalProps) {
  const [search, setSearch] = useState('');
  const [sourceMode, setSourceMode] = useState<'favorites' | 'recent' | 'browse'>('favorites');
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
  const [preferences, setPreferences] = useState<MedicationPreference[]>([]);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());
  const [catalogDetail, setCatalogDetail] = useState<MedicationCatalogDetail | null>(null);
  const [detailLoadingRegNo, setDetailLoadingRegNo] = useState('');
  const [languageMode, setLanguageMode] = useState<'en' | 'ur' | 'bilingual'>('bilingual');
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [pendingRevealMedicationId, setPendingRevealMedicationId] = useState('');
  const [highlightedPrescribedId, setHighlightedPrescribedId] = useState('');
  const resultRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prescribedContainerRef = useRef<HTMLDivElement | null>(null);
  const prescribedItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadFavorites = async () => {
      setFavoritesLoading(true);
      try {
        const [favoriteData, preferenceData] = await Promise.all([
          fetchMedicationFavorites(),
          fetchMedicationPreferences(),
        ]);
        if (cancelled) return;
        setFavorites(favoriteData);
        setPreferences(preferenceData);
        setFavoriteKeys(new Set(favoriteData.map(item => item.registrationNo)));
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
    if (sourceMode !== 'browse' || search.trim().length < 2) {
      setCatalogResults([]);
      setCatalogLoading(false);
      setCatalogHasMore(false);
      setCatalogCursor(null);
      setActiveResultIndex(-1);
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
  }, [search, sourceMode]);

  const favoriteEntries = useMemo(
    () => dedupeMedications(favorites.map(item => toMedication(item.medicine))),
    [favorites]
  );

  const prescribedMedicationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    prescribedMedications.forEach(medication => {
      const key = getMedicationMatchKey(medication);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [prescribedMedications]);

  const recentEntries = useMemo(() => {
    return dedupeMedications(preferences
      .slice(0, 12)
      .map((item, index) => {
        const payload = item.payload as Partial<Medication>;
        const name = typeof payload.name === 'string' && payload.name.trim()
          ? payload.name
          : item.medicationKey.startsWith('name:')
            ? item.medicationKey.replace(/^name:/, '').replace(/\b\w/g, char => char.toUpperCase())
            : '';

        if (!name.trim()) return null;

        return {
          id: item.registrationNo ? `cat-${item.registrationNo}` : `recent-${index}-${item.medicationKey}`,
          name,
          nameUrdu: String(payload.nameUrdu ?? ''),
          generic: String(payload.generic ?? ''),
          strength: String(payload.strength ?? ''),
          form: String(payload.form ?? ''),
          route: String(payload.route ?? ''),
          languageMode: inferLanguageMode(payload),
          dosePattern: String(payload.dosePattern ?? ''),
          frequency: String(payload.frequency ?? ''),
          frequencyUrdu: String(payload.frequencyUrdu ?? ''),
          duration: String(payload.duration ?? ''),
          durationUrdu: String(payload.durationUrdu ?? ''),
          instructions: String(payload.instructions ?? ''),
          instructionsUrdu: String(payload.instructionsUrdu ?? ''),
        } satisfies Medication;
      })
      .filter((item): item is Medication => Boolean(item)));
  }, [preferences]);

  const dedupedCatalogResults = useMemo(() => {
    const seen = new Set<string>();
    return catalogResults.filter(entry => {
      const key = getCatalogDisplayKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [catalogResults]);

  const filtered = sourceMode === 'favorites'
    ? favoriteEntries
    : sourceMode === 'recent'
      ? recentEntries
      : dedupedCatalogResults.map(toMedication);
  const isCustomMedication = selected?.id.startsWith('custom-') ?? false;
  const selectedRegistrationNo = selected?.id.startsWith('cat-') ? selected.id.replace('cat-', '') : '';
  const isSelectedFavorite = Boolean(selectedRegistrationNo && favoriteKeys.has(selectedRegistrationNo));

  const buildMedicationFromForm = () => {
    if (!selected) return null;
    if (dosePattern.trim() && !parsedPattern) return null;
    if (!selected.name.trim()) return null;

    const isEditingExisting = prescribedMedications.some(med => med.id === selected.id);

    return {
      ...selected,
      id: isEditingExisting ? selected.id : `rx-${Date.now()}`,
      languageMode,
      dosePattern: parsedPattern?.normalizedPattern || dosePattern.trim() || selected.dosePattern,
      frequency: languageMode === 'ur' ? '' : (customFrequency || selected.frequency),
      frequencyUrdu: languageMode === 'en' ? '' : (customFrequencyUrdu || selected.frequencyUrdu),
      duration: customDuration || selected.duration,
      instructions: languageMode === 'ur' ? '' : (customInstructions || selected.instructions),
      instructionsUrdu: languageMode === 'en' ? '' : (customInstructionsUrdu || selected.instructionsUrdu),
    } satisfies Medication;
  };

  const persistMedicationPreference = async (medicationToSave: Medication) => {
    const savedPreference = await saveMedicationPreference({
      medicationKey: getMedicationPreferenceKey(selected ?? medicationToSave),
      registrationNo: medicationToSave.id.startsWith('cat-') ? medicationToSave.id.replace('cat-', '') : '',
      payload: {
        name: medicationToSave.name,
        nameUrdu: medicationToSave.nameUrdu,
        generic: medicationToSave.generic,
        strength: medicationToSave.strength,
        form: medicationToSave.form,
        route: medicationToSave.route,
        languageMode: medicationToSave.languageMode,
        dosePattern: medicationToSave.dosePattern || '',
        frequency: medicationToSave.frequency,
        frequencyUrdu: medicationToSave.frequencyUrdu,
        duration: medicationToSave.duration,
        instructions: medicationToSave.instructions,
        instructionsUrdu: medicationToSave.instructionsUrdu,
      },
    });

    setPreferences(current => [savedPreference, ...current.filter(item => item.medicationKey !== savedPreference.medicationKey)]);
    return savedPreference;
  };

  const handleSelect = (med: Medication) => {
    const existingMedication = prescribedMedications.find(item => getMedicationMatchKey(item) === getMedicationMatchKey(med));
    const preference = preferences.find(item => item.medicationKey === getMedicationPreferenceKey(med));
    const preferred = preference?.payload as Partial<Medication> | undefined;
    const nextMedication: Medication = existingMedication
      ? existingMedication
      : preferred
      ? {
          ...med,
          ...preferred,
          id: med.id,
          name: med.name,
          generic: med.generic || String(preferred.generic ?? ''),
          route: String(preferred.route ?? med.route),
          form: String(preferred.form ?? med.form),
          strength: String(preferred.strength ?? med.strength),
        }
      : med;

    setSelected(nextMedication);
    setLanguageMode(inferLanguageMode(nextMedication));
    setDosePattern(nextMedication.dosePattern || '');
    const parsed = nextMedication.dosePattern ? parseDosePattern(nextMedication.dosePattern, nextMedication) : null;
    setCustomFrequency(parsed?.frequency || nextMedication.frequency);
    setCustomFrequencyUrdu(parsed?.frequencyUrdu || nextMedication.frequencyUrdu || '');
    setCustomDuration(nextMedication.duration);
    setCustomInstructions(nextMedication.instructions);
    setCustomInstructionsUrdu(nextMedication.instructionsUrdu || '');
    const matchingPreset = instructionPresets.find(preset => preset.en === nextMedication.instructions);
    setInstructionPreset(matchingPreset?.value ?? (nextMedication.instructions ? 'custom' : 'select'));
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
      languageMode: 'bilingual',
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
    return 'Use 1, 1+1, 1+0+1, 1+1+1, or special codes SOS / HS.';
  }, [dosePattern, parsedPattern]);
  const requiredDosePatternError = selected && !dosePattern.trim() ? 'Dose pattern is required before adding this medication.' : '';
  const canSubmitMedication = Boolean(selected && selected.name.trim() && dosePattern.trim() && parsedPattern);
  const canSaveFavoriteFromSettings = Boolean(canSubmitMedication && selectedRegistrationNo);
  const selectedMatchCount = selected ? prescribedMedicationCounts.get(getMedicationMatchKey(selected)) ?? 0 : 0;
  const isEditingExistingMedication = Boolean(selected && selectedMatchCount > 0 && prescribedMedications.some(med => med.id === selected.id));
  const groupedPrescribedMedications = useMemo(() => {
    const groups = new Map<string, { medication: Medication; count: number; ids: string[] }>();

    prescribedMedications.forEach(medication => {
      const key = getMedicationMatchKey(medication);
      const current = groups.get(key);
      if (current) {
        current.count += 1;
        current.ids.push(medication.id);
        current.medication = medication;
      } else {
        groups.set(key, {
          medication,
          count: 1,
          ids: [medication.id],
        });
      }
    });

    return Array.from(groups.values());
  }, [prescribedMedications]);

  useEffect(() => {
    if (filtered.length === 0) {
      setActiveResultIndex(-1);
      return;
    }

    setActiveResultIndex(current => {
      if (current >= 0 && current < filtered.length) return current;
      return sourceMode === 'browse' ? 0 : -1;
    });
  }, [filtered.length, sourceMode]);

  useEffect(() => {
    if (activeResultIndex < 0 || activeResultIndex >= filtered.length) return;
    const activeMedication = filtered[activeResultIndex];
    if (!activeMedication) return;
    resultRefs.current[activeMedication.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeResultIndex, filtered]);

  useEffect(() => {
    if (!pendingRevealMedicationId) return;
    const prescribedMedication = prescribedMedications.find(med => med.id === pendingRevealMedicationId);
    if (!prescribedMedication) return;

    const animationFrame = window.requestAnimationFrame(() => {
      prescribedItemRefs.current[pendingRevealMedicationId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (prescribedContainerRef.current) {
        prescribedContainerRef.current.scrollTo({
          top: prescribedContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
      setHighlightedPrescribedId(pendingRevealMedicationId);
      window.setTimeout(() => setHighlightedPrescribedId(current => (current === pendingRevealMedicationId ? '' : current)), 1800);
      setPendingRevealMedicationId('');
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [pendingRevealMedicationId, prescribedMedications]);

  const clearSelectionState = () => {
    setSelected(null);
    setDosePattern('');
    setCustomFrequency('');
    setCustomFrequencyUrdu('');
    setCustomDuration('');
    setCustomInstructions('');
    setCustomInstructionsUrdu('');
    setInstructionPreset('select');
    setLanguageMode('bilingual');
    setCatalogDetail(null);
    setDetailLoadingRegNo('');
  };

  const handleDosePatternChange = (value: string) => {
    setDosePattern(value);
    if (!selected) return;

    const parsed = parseDosePattern(value, selected);
    if (!parsed) {
      if (!value.trim()) {
        setCustomFrequency('');
        setCustomFrequencyUrdu('');
      }
      return;
    }

    setCustomFrequency(parsed.frequency);
    setCustomFrequencyUrdu(parsed.frequencyUrdu);

    if (parsed.instructions && (!customInstructions || customInstructions === selected.instructions)) {
      setCustomInstructions(parsed.instructions);
    }

    if (parsed.instructionsUrdu && (!customInstructionsUrdu || customInstructionsUrdu === selected.instructionsUrdu)) {
      setCustomInstructionsUrdu(parsed.instructionsUrdu);
    }
  };

  const commitMedicationAdd = () => {
    const medicationToSave = buildMedicationFromForm();
    if (!medicationToSave) return;

    onAdd(medicationToSave);
    setPendingRevealMedicationId(medicationToSave.id);
    clearSelectionState();
    void persistMedicationPreference(medicationToSave).catch(() => {
      // Keep prescribing flow fast even if preference persistence fails.
    });
  };

  const handleAdd = () => {
    if (isEditingExistingMedication) {
      setDuplicateConfirmOpen(true);
      return;
    }
    commitMedicationAdd();
  };

  const handleSaveFavorite = async () => {
    const medicationToSave = buildMedicationFromForm();
    if (!medicationToSave || !selectedRegistrationNo) return;

    setSavingFavorite(true);
    try {
      await persistMedicationPreference({ ...medicationToSave, id: `cat-${selectedRegistrationNo}` });
      if (!favoriteKeys.has(selectedRegistrationNo)) {
        const favorite = await addMedicationFavorite(selectedRegistrationNo);
        setFavorites(current => [favorite, ...current.filter(item => item.registrationNo !== selectedRegistrationNo)]);
        setFavoriteKeys(current => new Set(current).add(selectedRegistrationNo));
      }
      onFavoriteSaved?.();
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleInstructionPresetChange = (value: string) => {
    setInstructionPreset(value);
    if (value === 'select' || value === 'custom') {
      setCustomInstructions('');
      setCustomInstructionsUrdu('');
      return;
    }
    const preset = instructionPresets.find(item => item.value === value);
    if (!preset) return;
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
    if (sourceMode !== 'browse' || !catalogHasMore || catalogCursor === null || loadingMore) return;
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
      clearSelectionState();
      setSearch('');
      setSourceMode('favorites');
      setCatalogResults([]);
      setCatalogHasMore(false);
      setCatalogCursor(null);
      setActiveResultIndex(-1);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6"
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || !selected) return;
          const target = event.target as HTMLElement | null;
          if (!target) return;
          if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
          event.preventDefault();
          if (mode === 'favorites') {
            void handleSaveFavorite();
            return;
          }
          handleAdd();
        }}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'favorites' ? 'Add Favorite Medicine' : 'Add Medication'}</DialogTitle>
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
                  if (e.target.value) setSourceMode('browse');
                }}
                onKeyDown={event => {
                  if (!filtered.length) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveResultIndex(current => (current + 1 + filtered.length) % filtered.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveResultIndex(current => {
                      if (current <= 0) return filtered.length - 1;
                      return current - 1;
                    });
                    return;
                  }
                  if (event.key === 'Enter' && !selected && activeResultIndex >= 0) {
                    event.preventDefault();
                    const activeMedication = filtered[activeResultIndex];
                    if (activeMedication) {
                      handleSelect(activeMedication);
                    }
                  }
                }}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant={sourceMode === 'favorites' ? 'default' : 'outline'} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setSourceMode('favorites'); setSearch(''); }}>
                <Star className="w-3 h-3" /> Favorites
              </Button>
              <Button variant={sourceMode === 'recent' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => { setSourceMode('recent'); setSearch(''); }}>
                Recent
              </Button>
              <Button variant={sourceMode === 'browse' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setSourceMode('browse')}>
                Browse All
              </Button>
              {mode !== 'favorites' && (
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleCustomMedication}>
                  <Plus className="w-3 h-3" /> Add Custom Medicine
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Medication Search Results
                </h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 p-2 scrollbar-thin">
                {sourceMode === 'favorites' && favoritesLoading && (
                  <p className="text-sm text-muted-foreground text-center py-3">Loading your favorite medicines...</p>
                )}
                {sourceMode === 'browse' && catalogLoading && (
                  <p className="text-sm text-muted-foreground text-center py-3">Searching Pakistan medicine catalog...</p>
                )}
                {sourceMode === 'favorites' && !favoritesLoading && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No favorite medicines yet. Search and star medicines to build your quick list.</p>
                )}
                {sourceMode === 'recent' && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No recent medicines yet. Once you prescribe medicines, your latest setups will appear here.</p>
                )}
                {sourceMode === 'browse' && search.trim().length < 2 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 letters to search brands and generics from the Pakistan medicine catalog.</p>
                )}
                {sourceMode === 'browse' && search.trim().length >= 2 && !catalogLoading && filtered.length === 0 && (
                  <div className="py-6 space-y-3 text-center">
                    <p className="text-sm text-muted-foreground">No medicines found in the Pakistan catalog.</p>
                    {mode !== 'favorites' && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCustomMedication}>
                        <Plus className="w-3.5 h-3.5" />
                        {search.trim() ? `Enter "${search.trim()}" manually` : 'Enter custom medicine'}
                      </Button>
                    )}
                  </div>
                )}
                {filtered.map(med => {
                  const registrationNo = med.id.startsWith('cat-') ? med.id.replace('cat-', '') : '';
                  const isFavorite = registrationNo ? favoriteKeys.has(registrationNo) : false;
                  const prescribedCount = prescribedMedicationCounts.get(getMedicationMatchKey(med)) ?? 0;
                  const alreadyAdded = prescribedCount > 0;

                  return (
                    <div
                      key={med.id}
                      ref={node => {
                        resultRefs.current[med.id] = node;
                      }}
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
                        selected?.id === med.id
                          ? 'bg-muted border border-border'
                          : activeResultIndex === filtered.findIndex(item => item.id === med.id)
                            ? 'bg-primary/5 border border-primary/30'
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{med.name}</p>
                          {alreadyAdded && (
                            <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700">
                              {prescribedCount > 1 ? `Added x${prescribedCount}` : 'Added'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {med.generic || 'Generic not listed'} • {med.form || 'Medicine'} • {med.strength || 'Strength not listed'}
                        </p>
                        {sourceMode === 'browse' && registrationNo && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {dedupedCatalogResults.find(item => item.registrationNo === registrationNo)?.companyName || 'Company not listed'}
                          </p>
                        )}
                      </div>
                      {registrationNo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 border border-primary/20 p-0 hover:border-primary/45"
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
                          className="h-7 w-7 border border-primary/20 p-0 hover:border-primary/45"
                          onClick={event => {
                            event.stopPropagation();
                            void handleOpenCatalogDetail({
                              registrationNo,
                              brandName: med.name,
                              genericName: med.generic,
                              companyName: '',
                              strengthText: med.strength,
                              dosageForm: med.form,
                              route: med.route,
                            });
                          }}
                        >
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      ) : null}
                      <div className="w-8 flex justify-center">
                        {alreadyAdded ? (
                          <span className="text-[10px] font-medium text-muted-foreground">Added</span>
                        ) : (
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {sourceMode === 'browse' && filtered.length > 0 && catalogHasMore && (
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
                  {groupedPrescribedMedications.length}
                </Badge>
              </div>
              <div ref={prescribedContainerRef} className="min-h-[210px] max-h-[210px] sm:min-h-[240px] sm:max-h-[240px] overflow-y-auto space-y-2 p-3 scrollbar-thin">
                {groupedPrescribedMedications.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No medications added yet</p>
                ) : (
                  groupedPrescribedMedications.map((group, index) => {
                    const med = group.medication;
                    return (
                    <div
                      key={group.ids.join('|')}
                      ref={node => {
                        prescribedItemRefs.current[med.id] = node;
                      }}
                      className={`rounded-lg p-3 transition-colors ${highlightedPrescribedId === med.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-muted/50'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{index + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{med.name}</p>
                            {group.count > 1 && (
                              <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700">
                                x{group.count} duplicates
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(med.frequency || med.frequencyUrdu || 'Frequency not set')} • {med.duration} • {med.route}
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
                            title={group.count > 1 ? 'Remove all duplicate entries' : 'Remove medication'}
                            onClick={() => group.ids.forEach(id => onRemove(id))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                  })
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
                    {isEditingExistingMedication && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                        This medicine is already prescribed in this visit. Review the configuration below and click <span className="font-semibold">Update Prescription</span> to replace the existing entry.
                      </div>
                    )}
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
                          <p className="text-xs text-muted-foreground">
                            {selected.generic || 'Detail available on demand'} • {selected.strength || 'Strength not listed'} • {selected.form}
                          </p>
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
                                  genericName: selected.generic,
                                  companyName: '',
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

                    <div className="space-y-4">
                      <div className="rounded-lg border border-border/70 p-3 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">Core Setup</h4>
                          <p className="text-[11px] text-muted-foreground">Fill the essential prescription details first.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Strength / Dose</Label>
                            <Input
                              value={selected.strength}
                              onChange={e => setSelected(current => current ? { ...current, strength: e.target.value } : current)}
                              placeholder="500mg / 5ml / 1 ampule"
                              className="h-8 text-sm"
                            />
                            {!selected.strength && !isCustomMedication && (
                              <p className="text-[11px] text-muted-foreground">This medicine has no listed strength. Add the exact strength manually.</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Route</Label>
                            <Input value={selected.route} readOnly className="h-8 text-sm bg-muted/30" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Prescription Language</Label>
                            <Select value={languageMode} onValueChange={value => setLanguageMode(value as 'en' | 'ur' | 'bilingual')}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {prescriptionLanguageOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">Choose this per patient based on what they can read and understand.</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Duration</Label>
                            <Input value={customDuration} onChange={e => setCustomDuration(e.target.value)} className="h-8 text-sm" placeholder="5 days / 2 weeks" />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 p-3 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">Dose Pattern</h4>
                          <p className="text-[11px] text-muted-foreground">Use shorthand and let frequency derive automatically.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5 sm:col-span-2">
                            <div className="flex flex-wrap gap-1.5">
                              {dosePatternSnippets.map(snippet => (
                                <button
                                  key={snippet}
                                  type="button"
                                  onClick={() => handleDosePatternChange(snippet)}
                                  className="rounded-full border border-primary/25 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/45 hover:bg-muted hover:text-foreground"
                                >
                                  {snippet}
                                </button>
                              ))}
                            </div>
                            <Input
                              value={dosePattern}
                              onChange={e => handleDosePatternChange(e.target.value)}
                              placeholder="1 / 1+1 / 1+0+1 / SOS / HS"
                              className="h-8 text-sm"
                            />
                            <p className="text-[11px] text-muted-foreground">Examples: 1, 1+1, 1+0+1, 1+1+1, SOS, HS</p>
                            {(patternError || requiredDosePatternError) && (
                              <p className="text-[11px] text-destructive">{patternError || requiredDosePatternError}</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Frequency</Label>
                            <Input value={customFrequency} readOnly className="h-8 text-sm bg-muted/30" placeholder="Derived from dose pattern" />
                          </div>
                          {languageMode !== 'en' && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Frequency (Urdu)</Label>
                              <Input value={customFrequencyUrdu} onChange={e => setCustomFrequencyUrdu(e.target.value)} dir="rtl" className="h-8 text-sm" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 p-3 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">Instructions</h4>
                          <p className="text-[11px] text-muted-foreground">Keep this simple for the patient and editable when needed.</p>
                        </div>
                        {languageMode !== 'ur' && (
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
                        )}

                        {languageMode !== 'en' && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Instructions (Urdu)</Label>
                            <Textarea value={customInstructionsUrdu} onChange={e => setCustomInstructionsUrdu(e.target.value)} dir="rtl" rows={2} className="text-sm resize-none" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-2 justify-end items-stretch sm:items-center">
                      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setSelected(null)}>Clear</Button>
                      {mode !== 'favorites' && !isCustomMedication && selectedRegistrationNo ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 w-full sm:w-auto"
                          onClick={() => void handleSaveFavorite()}
                          disabled={savingFavorite || !canSubmitMedication}
                        >
                          <Star className={`w-4 h-4 ${isSelectedFavorite ? 'fill-warning text-warning' : ''}`} />
                          {savingFavorite ? 'Saving...' : isSelectedFavorite ? 'Update Favorite Setup' : 'Save to Favorites'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        className="gap-1.5 w-full sm:w-auto"
                        onClick={() => {
                          if (mode === 'favorites') {
                            void handleSaveFavorite();
                            return;
                          }
                          handleAdd();
                        }}
                        disabled={mode === 'favorites' ? !canSaveFavoriteFromSettings || savingFavorite : !canSubmitMedication}
                      >
                        <Plus className="w-4 h-4" />
                        {mode === 'favorites'
                          ? 'Save Favorite'
                          : isEditingExistingMedication
                              ? 'Update Prescription'
                              : 'Add to Prescription'}
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

      <AlertDialog open={duplicateConfirmOpen} onOpenChange={setDuplicateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Medicine already prescribed</AlertDialogTitle>
            <AlertDialogDescription>
              This medicine is already in the current prescription. If you continue, the existing prescribed entry will be updated with the configuration you have entered now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current prescription</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                commitMedicationAdd();
                setDuplicateConfirmOpen(false);
              }}
            >
              Update existing medicine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
