import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { diagnosisLibrary, favoriteDiagnoses, type Diagnosis } from '@/data/mockData';
import { Search, Star, Plus } from 'lucide-react';

interface DiagnosisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (dx: Diagnosis) => void;
  existingIds: string[];
}

export default function DiagnosisModal({ open, onOpenChange, onAdd, existingIds }: DiagnosisModalProps) {
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(true);

  const filtered = diagnosisLibrary.filter(dx => {
    if (existingIds.includes(dx.id)) return false;
    if (!search) return showFavorites ? favoriteDiagnoses.includes(dx.id) : true;
    return dx.name.toLowerCase().includes(search.toLowerCase()) || dx.code.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = (dx: Diagnosis, isPrimary: boolean) => {
    onAdd({ ...dx, isPrimary });
    if (!search) return;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Diagnosis</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ICD code..."
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setShowFavorites(false); }}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={showFavorites ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => { setShowFavorites(true); setSearch(''); }}
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

          <div className="max-h-[300px] overflow-y-auto space-y-1 scrollbar-thin">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No diagnoses found</p>
            )}
            {filtered.map(dx => (
              <div key={dx.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{dx.name}</p>
                  <p className="text-xs text-muted-foreground">{dx.code}</p>
                </div>
                {favoriteDiagnoses.includes(dx.id) && <Star className="w-3 h-3 text-warning fill-warning" />}
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100" onClick={() => handleAdd(dx, true)}>
                  Primary
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleAdd(dx, false)}>
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
