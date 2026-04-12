import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Search, Star, Plus, FlaskConical, Scan } from 'lucide-react';
import type { LabOrder } from '@/data/mockData';

interface LabOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (order: LabOrder) => void;
  type: 'lab' | 'radiology';
}

const labTests = [
  { name: 'Complete Blood Count (CBC)', category: 'Hematology', favorite: true },
  { name: 'HbA1c', category: 'Biochemistry', favorite: true },
  { name: 'Fasting Blood Glucose', category: 'Biochemistry', favorite: true },
  { name: 'Liver Function Tests (LFTs)', category: 'Biochemistry', favorite: true },
  { name: 'Renal Function Tests (RFTs)', category: 'Biochemistry', favorite: true },
  { name: 'Serum Electrolytes', category: 'Biochemistry', favorite: false },
  { name: 'Lipid Profile', category: 'Biochemistry', favorite: true },
  { name: 'Thyroid Profile (T3, T4, TSH)', category: 'Endocrinology', favorite: false },
  { name: 'Urine Complete Examination', category: 'Microbiology', favorite: true },
  { name: 'Urine Culture & Sensitivity', category: 'Microbiology', favorite: false },
  { name: 'Troponin I', category: 'Cardiology', favorite: false },
  { name: 'ECG', category: 'Cardiology', favorite: true },
  { name: 'ESR', category: 'Hematology', favorite: false },
  { name: 'CRP', category: 'Biochemistry', favorite: false },
  { name: 'Serum Uric Acid', category: 'Biochemistry', favorite: false },
  { name: 'Prothrombin Time (PT/INR)', category: 'Hematology', favorite: false },
  { name: 'Blood Group & Rh', category: 'Hematology', favorite: false },
  { name: 'Vitamin D Level', category: 'Biochemistry', favorite: false },
  { name: 'Vitamin B12 Level', category: 'Biochemistry', favorite: false },
  { name: 'Serum Ferritin', category: 'Biochemistry', favorite: false },
];

const radiologyTests = [
  { name: 'Chest X-Ray PA View', category: 'General Radiology', favorite: true },
  { name: 'X-Ray Lumbar Spine AP/Lateral', category: 'General Radiology', favorite: false },
  { name: 'X-Ray Both Knees AP/Lateral', category: 'General Radiology', favorite: false },
  { name: 'Ultrasound Abdomen & Pelvis', category: 'Ultrasound', favorite: true },
  { name: 'Ultrasound KUB', category: 'Ultrasound', favorite: false },
  { name: 'Echocardiography', category: 'Cardiology', favorite: true },
  { name: 'CT Scan Head Plain', category: 'CT Scan', favorite: false },
  { name: 'CT Scan Chest (HRCT)', category: 'CT Scan', favorite: false },
  { name: 'MRI Brain with Contrast', category: 'MRI', favorite: false },
  { name: 'MRI Lumbar Spine', category: 'MRI', favorite: false },
  { name: 'Doppler Ultrasound Lower Limbs', category: 'Ultrasound', favorite: false },
  { name: 'Mammography', category: 'General Radiology', favorite: false },
];

export default function LabOrderModal({ open, onOpenChange, onAdd, type }: LabOrderModalProps) {
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(true);
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [selectedTest, setSelectedTest] = useState<{ name: string; category: string } | null>(null);

  const tests = type === 'lab' ? labTests : radiologyTests;
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!open) {
      setSearch('');
      setShowFavorites(true);
      setPriority('routine');
      setClinicalNotes('');
      setSelectedTest(null);
    }
  }, [open]);

  const filtered = tests.filter(t => {
    if (!search) return showFavorites ? t.favorite : true;
    return t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = (testName: string, category: string) => {
    const order: LabOrder = {
      id: `order-${Date.now()}`,
      testName,
      category,
      priority,
      status: 'ordered',
      date: today,
    };
    onAdd(order);
    setSelectedTest({ name: testName, category });
  };

  const isLab = type === 'lab';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || !selectedTest) return;
          const target = event.target as HTMLElement | null;
          if (!target || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
          event.preventDefault();
          handleAdd(selectedTest.name, selectedTest.category);
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
              onChange={e => { setSearch(e.target.value); if (e.target.value) setShowFavorites(false); }}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
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
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No tests found</p>
            )}
            {filtered.map(test => (
              <div
                key={test.name}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTest({ name: test.name, category: test.category })}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedTest({ name: test.name, category: test.category });
                  }
                }}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors group cursor-pointer ${
                  selectedTest?.name === test.name ? 'bg-muted border border-border' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{test.name}</p>
                  <p className="text-xs text-muted-foreground">{test.category}</p>
                </div>
                {test.favorite && <Star className="w-3 h-3 text-warning fill-warning" />}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={event => {
                    event.stopPropagation();
                    handleAdd(test.name, test.category);
                  }}
                >
                  <Plus className="w-3 h-3" /> Order
                </Button>
              </div>
            ))}
          </div>

          {selectedTest && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedTest.name}</span>
              <span className="ml-2">Press Enter to order quickly.</span>
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
