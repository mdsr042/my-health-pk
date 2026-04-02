import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { diagnosisLibrary, favoriteDiagnoses, type Diagnosis } from '@/data/mockData';
import { Search, Star, Plus, Pencil, Trash2 } from 'lucide-react';

interface DiagnosisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (dx: Diagnosis) => void;
  onRemove: (diagnosisId: string) => void;
  diagnoses: Diagnosis[];
}

export default function DiagnosisModal({ open, onOpenChange, onAdd, onRemove, diagnoses }: DiagnosisModalProps) {
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(true);
  const [selected, setSelected] = useState<Diagnosis | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);

  const filtered = diagnosisLibrary.filter(dx => {
    if (!search) return showFavorites ? favoriteDiagnoses.includes(dx.id) : true;
    return dx.name.toLowerCase().includes(search.toLowerCase()) || dx.code.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (dx: Diagnosis) => {
    setSelected(dx);
    setIsPrimary(dx.isPrimary);
  };

  const handleAdd = () => {
    if (!selected) return;

    onAdd({
      ...selected,
      isPrimary,
    });
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch('');
      setShowFavorites(true);
      setSelected(null);
      setIsPrimary(false);
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
                placeholder="Search by diagnosis name or ICD code..."
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
              <Button
                variant={showFavorites ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => {
                  setShowFavorites(true);
                  setSearch('');
                }}
              >
                <Star className="w-3 h-3" /> Favorites
              </Button>
              <Button
                variant={!showFavorites ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowFavorites(false)}
              >
                Browse All
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Diagnosis Search Results
                </h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 p-2 scrollbar-thin">
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No diagnoses found</p>
                )}
                {filtered.map(dx => (
                  <button
                    key={dx.id}
                    type="button"
                    onClick={() => handleSelect(dx)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                      selected?.id === dx.id ? 'bg-muted border border-border' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{dx.name}</p>
                        {diagnoses.some(item => item.id === dx.id) && (
                          <Badge variant="outline" className="text-[10px]">Added</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{dx.code}</p>
                    </div>
                    {favoriteDiagnoses.includes(dx.id) && <Star className="w-3 h-3 text-warning fill-warning" />}
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already Added</h3>
                <Badge variant="outline" className="text-[10px]">
                  {diagnoses.length}
                </Badge>
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
                            {dx.isPrimary && (
                              <Badge className="bg-primary/10 text-primary text-[10px]">Primary</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{dx.code}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Update diagnosis"
                            onClick={() => handleSelect(dx)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            title="Remove diagnosis"
                            onClick={() => onRemove(dx.id)}
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
                      Diagnosis Configuration
                    </h3>
                  </div>
                  <div className="p-3 space-y-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="font-medium text-foreground">{selected.name}</p>
                      <p className="text-xs text-muted-foreground">{selected.code}</p>
                    </div>

                    <div className="rounded-lg border border-border p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Primary Diagnosis</p>
                        <p className="text-xs text-muted-foreground">Mark this diagnosis as the main clinical impression</p>
                      </div>
                      <Checkbox
                        checked={isPrimary}
                        onCheckedChange={value => setIsPrimary(Boolean(value))}
                      />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                        Clear
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={handleAdd}>
                        <Plus className="w-4 h-4" />
                        {diagnoses.some(dx => dx.id === selected.id) ? 'Update Diagnosis' : 'Add Diagnosis'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 sm:p-8 text-center text-sm text-muted-foreground">
                  Select a diagnosis from the list to review and mark it as primary if needed.
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
                Complete Diagnosis
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
