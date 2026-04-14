import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { addFavoriteDiagnosis, fetchFavoriteDiagnoses, fetchRecentDiagnoses, removeFavoriteDiagnosis, searchDiagnosisCatalog } from '@/lib/api';
import type { DiagnosisCatalogEntry } from '@/lib/app-types';
import type { Diagnosis } from '@/data/mockData';
import { Search, Star, Plus, Pencil, Trash2 } from 'lucide-react';

interface DiagnosisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (dx: Diagnosis) => void;
  onRemove: (diagnosisId: string) => void;
  diagnoses: Diagnosis[];
}

function toDiagnosis(entry: DiagnosisCatalogEntry): Diagnosis {
  return {
    id: `dx-${entry.id}`,
    code: entry.code,
    name: entry.name,
    isPrimary: false,
  };
}

export default function DiagnosisModal({ open, onOpenChange, onAdd, onRemove, diagnoses }: DiagnosisModalProps) {
  const [search, setSearch] = useState('');
  const [sourceMode, setSourceMode] = useState<'favorites' | 'recent' | 'browse'>('favorites');
  const [selected, setSelected] = useState<Diagnosis | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [catalogResults, setCatalogResults] = useState<DiagnosisCatalogEntry[]>([]);
  const [favorites, setFavorites] = useState<DiagnosisCatalogEntry[]>([]);
  const [recents, setRecents] = useState<DiagnosisCatalogEntry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [favoriteData, recentData] = await Promise.all([fetchFavoriteDiagnoses(), fetchRecentDiagnoses()]);
        if (cancelled) return;
        setFavorites(favoriteData);
        setRecents(recentData);
        setFavoriteIds(new Set(favoriteData.map(item => item.id)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (sourceMode !== 'browse') {
      setCatalogResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchDiagnosisCatalog(search.trim(), 20);
        if (!cancelled) setCatalogResults(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, sourceMode]);

  const filtered = useMemo(() => {
    if (sourceMode === 'favorites') return favorites;
    if (sourceMode === 'recent') return recents;
    return catalogResults;
  }, [catalogResults, favorites, recents, sourceMode]);

  const handleSelect = (entry: DiagnosisCatalogEntry | Diagnosis) => {
    const diagnosis = 'isActive' in entry ? toDiagnosis(entry) : entry;
    setSelected(diagnosis);
    setIsPrimary(diagnosis.isPrimary);
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd({ ...selected, isPrimary });
  };

  const handleToggleFavorite = async (catalogId: string) => {
    const wasFavorite = favoriteIds.has(catalogId);
    const next = new Set(favoriteIds);
    if (wasFavorite) next.delete(catalogId);
    else next.add(catalogId);
    setFavoriteIds(next);
    try {
      if (wasFavorite) {
        await removeFavoriteDiagnosis(catalogId);
        setFavorites(current => current.filter(item => item.id !== catalogId));
      } else {
        await addFavoriteDiagnosis(catalogId);
        const match = catalogResults.find(item => item.id === catalogId) ?? recents.find(item => item.id === catalogId);
        if (match) setFavorites(current => [match, ...current.filter(item => item.id !== catalogId)]);
      }
    } catch {
      setFavoriteIds(new Set(favorites.map(item => item.id)));
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch('');
      setSourceMode('favorites');
      setSelected(null);
      setIsPrimary(false);
      setCatalogResults([]);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Add Diagnosis</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-4 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by diagnosis name or code..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  if (e.target.value) setSourceMode('browse');
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
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnosis Search Results</h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 p-2 scrollbar-thin">
                {loading && <p className="text-sm text-muted-foreground text-center py-3">Loading diagnoses...</p>}
                {!loading && filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {sourceMode === 'browse' ? 'No diagnoses found in the shared catalog' : `No ${sourceMode} diagnoses yet`}
                  </p>
                )}
                {filtered.map(entry => {
                  const diagnosis = toDiagnosis(entry);
                  const isFavorite = favoriteIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(entry)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelect(entry);
                        }
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${selected?.name === diagnosis.name && selected?.code === diagnosis.code ? 'bg-muted border border-border' : 'hover:bg-muted/50'}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{entry.name}</p>
                          {diagnoses.some(item => item.name === entry.name && item.code === entry.code) && <Badge variant="outline" className="text-[10px]">Added</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{entry.code || 'Code not listed'}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 border border-primary/20 p-0 hover:border-primary/45"
                        onClick={event => {
                          event.stopPropagation();
                          void handleToggleFavorite(entry.id);
                        }}
                      >
                        <Star className={`w-4 h-4 ${isFavorite ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                      </Button>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already Added</h3>
                <Badge variant="outline" className="text-[10px]">{diagnoses.length}</Badge>
              </div>
              <div className="max-h-[220px] sm:max-h-[180px] overflow-y-auto space-y-2 p-3 scrollbar-thin">
                {diagnoses.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No diagnoses added yet</p>
                ) : (
                  diagnoses.map((dx, index) => (
                    <div key={dx.id} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{index + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{dx.name}</p>
                            {dx.isPrimary && <Badge className="bg-primary/10 text-primary text-[10px]">Primary</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{dx.code}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-center">
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSelect(dx)}><Pencil className="w-3 h-3" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onRemove(dx.id)}><Trash2 className="w-3 h-3" /></Button>
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
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnosis Configuration</h3>
                  </div>
                  <div className="p-3 space-y-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="font-medium text-foreground">{selected.name}</p>
                      <p className="text-xs text-muted-foreground">{selected.code || 'Code not listed'}</p>
                    </div>

                    <div className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Primary Diagnosis</p>
                        <p className="text-xs text-muted-foreground">Mark this diagnosis as the main clinical impression</p>
                      </div>
                      <Checkbox checked={isPrimary} onCheckedChange={value => setIsPrimary(Boolean(value))} />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Clear</Button>
                      <Button size="sm" className="gap-1.5" onClick={handleAdd}>
                        <Plus className="w-4 h-4" />
                        {diagnoses.some(dx => dx.id === selected.id) ? 'Update Diagnosis' : 'Add Diagnosis'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Choose a diagnosis from the shared catalog to configure it here.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
