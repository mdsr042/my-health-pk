import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  addFavoriteInvestigation,
  fetchFavoriteInvestigations,
  fetchRecentInvestigations,
  recordRecentInvestigation,
  removeFavoriteInvestigation,
  searchInvestigationCatalog,
} from '@/lib/api';
import { Search, Star, Plus, FlaskConical, Scan } from 'lucide-react';
import type { LabOrder } from '@/data/mockData';
import type { InvestigationCatalogEntry } from '@/lib/app-types';

interface LabOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (order: LabOrder) => void;
  type: 'lab' | 'radiology';
  activeOrders: LabOrder[];
}

function getInvestigationMatchKey(entry: Pick<InvestigationCatalogEntry, 'name' | 'category' | 'type'>) {
  return `${entry.type}::${entry.category.trim().toLowerCase()}::${entry.name.trim().toLowerCase()}`;
}

export default function LabOrderModal({ open, onOpenChange, onAdd, type, activeOrders }: LabOrderModalProps) {
  const [search, setSearch] = useState('');
  const [sourceMode, setSourceMode] = useState<'favorites' | 'recent' | 'browse'>('favorites');
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [selectedTest, setSelectedTest] = useState<InvestigationCatalogEntry | null>(null);
  const [catalogResults, setCatalogResults] = useState<InvestigationCatalogEntry[]>([]);
  const [favorites, setFavorites] = useState<InvestigationCatalogEntry[]>([]);
  const [recents, setRecents] = useState<InvestigationCatalogEntry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const isLab = type === 'lab';

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSourceMode('favorites');
      setPriority('routine');
      setClinicalNotes('');
      setSelectedTest(null);
      setCatalogResults([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [favoriteData, recentData] = await Promise.all([
          fetchFavoriteInvestigations(type),
          fetchRecentInvestigations(type),
        ]);
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
  }, [open, type]);

  useEffect(() => {
    if (!open || sourceMode !== 'browse') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchInvestigationCatalog(search.trim(), type, 20);
        if (!cancelled) setCatalogResults(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, sourceMode, type]);

  const filtered = useMemo(() => {
    if (sourceMode === 'favorites') return favorites;
    if (sourceMode === 'recent') return recents;
    return catalogResults;
  }, [catalogResults, favorites, recents, sourceMode]);

  const activeOrderKeys = useMemo(() => {
    return new Set(
      activeOrders.map(order =>
        getInvestigationMatchKey({
          name: order.testName,
          category: order.category,
          type,
        })
      )
    );
  }, [activeOrders, type]);

  const handleAdd = (entry: InvestigationCatalogEntry) => {
    if (activeOrderKeys.has(getInvestigationMatchKey(entry))) {
      return;
    }
    const order: LabOrder = {
      id: `order-${Date.now()}`,
      testName: entry.name,
      category: entry.category,
      priority,
      status: 'ordered',
      date: today,
      result: clinicalNotes || '',
    };
    onAdd(order);
    setSelectedTest(entry);
    void recordRecentInvestigation({
      name: entry.name,
      category: entry.category,
      type: entry.type,
      priority,
      notes: clinicalNotes,
    });
  };

  const handleToggleFavorite = async (catalogId: string) => {
    const wasFavorite = favoriteIds.has(catalogId);
    const next = new Set(favoriteIds);
    if (wasFavorite) next.delete(catalogId);
    else next.add(catalogId);
    setFavoriteIds(next);
    try {
      if (wasFavorite) {
        await removeFavoriteInvestigation(catalogId);
        setFavorites(current => current.filter(item => item.id !== catalogId));
      } else {
        await addFavoriteInvestigation(catalogId);
        const match = catalogResults.find(item => item.id === catalogId) ?? recents.find(item => item.id === catalogId);
        if (match) setFavorites(current => [match, ...current.filter(item => item.id !== catalogId)]);
      }
    } catch {
      setFavoriteIds(new Set(favorites.map(item => item.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || !selectedTest) return;
          const target = event.target as HTMLElement | null;
          if (!target || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
          if (activeOrderKeys.has(getInvestigationMatchKey(selectedTest))) return;
          event.preventDefault();
          handleAdd(selectedTest);
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLab ? <FlaskConical className="w-5 h-5 text-warning" /> : <Scan className="w-5 h-5 text-info" />}
            {isLab ? 'Order Lab Test' : 'Order Radiology'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${isLab ? 'lab tests' : 'radiology exams'}...`}
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                if (e.target.value) setSourceMode('browse');
              }}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
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
            <div className="ml-auto">
              <Select value={priority} onValueChange={(v: 'routine' | 'urgent' | 'stat') => setPriority(v)}>
                <SelectTrigger className="h-7 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-1 scrollbar-thin">
            {loading && <p className="text-sm text-muted-foreground text-center py-3">Loading investigations...</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No investigations found</p>
            )}
            {filtered.map(test => (
              <div
                key={test.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPriority(test.defaultPriority ?? 'routine');
                  setClinicalNotes(test.defaultNotes ?? '');
                  setSelectedTest(test);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setPriority(test.defaultPriority ?? 'routine');
                    setClinicalNotes(test.defaultNotes ?? '');
                    setSelectedTest(test);
                  }
                }}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors group cursor-pointer ${selectedTest?.id === test.id ? 'bg-muted border border-border' : 'hover:bg-muted/50'}`}
              >
                {(() => {
                  const alreadyAdded = activeOrderKeys.has(getInvestigationMatchKey(test));
                  return (
                    <>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{test.name}</p>
                    {alreadyAdded && (
                      <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700">
                        Already ordered
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{test.category}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 border border-primary/20 p-0 hover:border-primary/45"
                  onClick={event => {
                    event.stopPropagation();
                    void handleToggleFavorite(test.id);
                  }}
                >
                  <Star className={`w-4 h-4 ${favoriteIds.has(test.id) ? 'text-warning fill-warning' : 'text-muted-foreground'}`} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={alreadyAdded}
                  onClick={event => {
                    event.stopPropagation();
                    if (alreadyAdded) return;
                    handleAdd(test);
                  }}
                >
                  <Plus className="w-3 h-3" /> {alreadyAdded ? 'Added' : 'Order'}
                </Button>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>

          {selectedTest && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedTest.name}</span>
              <span className="ml-2">
                {activeOrderKeys.has(getInvestigationMatchKey(selectedTest))
                  ? 'This investigation is already added in the current visit.'
                  : 'Press Enter to order quickly.'}
              </span>
            </div>
          )}

          <div>
            <Textarea
              placeholder="Clinical notes / reason for ordering (optional)..."
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
