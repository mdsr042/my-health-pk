import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { createProcedureLibraryEntry, fetchProcedureLibrary } from '@/lib/api';
import type { Procedure } from '@/data/mockData';
import type { ProcedureLibraryEntry } from '@/lib/app-types';
import { Search, Plus, Stethoscope } from 'lucide-react';

interface ProcedureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (procedure: Procedure) => void;
  procedures: Procedure[];
}

function toProcedure(entry: ProcedureLibraryEntry): Procedure {
  return {
    id: `procedure-${entry.id}`,
    name: entry.name,
    category: entry.category,
    notes: entry.notes,
  };
}

export default function ProcedureModal({ open, onOpenChange, onAdd, procedures }: ProcedureModalProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProcedureLibraryEntry[]>([]);
  const [selected, setSelected] = useState<Procedure | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setResults([]);
      setSelected(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchProcedureLibrary(search.trim(), 20)
        .then(items => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search]);

  const selectedKeys = useMemo(
    () => new Set(procedures.map(item => `${item.name.toLowerCase()}::${item.category.toLowerCase()}`)),
    [procedures]
  );

  const handleCreateCustom = async () => {
    if (!selected?.name.trim()) return;
    setSaving(true);
    try {
      const saved = await createProcedureLibraryEntry({
        name: selected.name.trim(),
        category: selected.category.trim() || 'General',
        notes: selected.notes.trim(),
      });
      const next = toProcedure(saved);
      onAdd(next);
      setSelected(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            Add Procedure
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search procedures..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procedure Library</h3>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading procedures...</p>}
                {!loading && results.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No saved procedure found. Add a custom one from the right side.</p>
                )}
                {results.map(item => {
                  const isAdded = selectedKeys.has(`${item.name.toLowerCase()}::${item.category.toLowerCase()}`);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(toProcedure(item))}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected?.id === `procedure-${item.id}`
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        {isAdded && <Badge variant="outline" className="text-[10px]">Added</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                      {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procedure Details</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Procedure Name</label>
                  <Input
                    value={selected?.name ?? search}
                    onChange={event => setSelected(current => ({
                      id: current?.id || `procedure-custom-${Date.now()}`,
                      name: event.target.value,
                      category: current?.category || 'General',
                      notes: current?.notes || '',
                    }))}
                    placeholder="e.g. Nebulization, Dressing"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Notes</label>
                  <Textarea
                    value={selected?.notes ?? ''}
                    onChange={event => setSelected(current => ({
                      id: current?.id || `procedure-custom-${Date.now()}`,
                      name: current?.name || search,
                      category: current?.category || 'General',
                      notes: event.target.value,
                    }))}
                    rows={4}
                    className="resize-none"
                    placeholder="Add brief procedure notes if needed"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button
                variant="outline"
                disabled={!selected?.name.trim() || saving}
                onClick={() => void handleCreateCustom()}
              >
                {saving ? 'Saving...' : 'Save to My Procedures'}
              </Button>
              <Button
                disabled={!selected?.name.trim()}
                onClick={() => {
                  if (!selected) return;
                  onAdd({
                    ...selected,
                    id: selected.id || `procedure-${Date.now()}`,
                    category: selected.category || 'General',
                  });
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Procedure
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
