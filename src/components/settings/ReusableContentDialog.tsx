import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  AdviceTemplate,
  AdviceTemplatePayload,
  DiagnosisSet,
  DiagnosisSetPayload,
  InvestigationSet,
  InvestigationSetPayload,
  TreatmentTemplateDiagnosis,
  TreatmentTemplateLabOrder,
} from '@/lib/app-types';

type ReusableDialogMode = 'diagnosis' | 'investigation' | 'advice';

interface ReusableContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ReusableDialogMode;
  item: DiagnosisSet | InvestigationSet | AdviceTemplate | null;
  onSave: (payload: DiagnosisSetPayload | InvestigationSetPayload | AdviceTemplatePayload) => Promise<void>;
}

const blankDiagnosis = (): TreatmentTemplateDiagnosis => ({ code: '', name: '', isPrimary: false });
const blankLabOrder = (): TreatmentTemplateLabOrder => ({ testName: '', category: '', priority: 'routine' });

export default function ReusableContentDialog({ open, onOpenChange, mode, item, onSave }: ReusableContentDialogProps) {
  const [name, setName] = useState('');
  const [diagnoses, setDiagnoses] = useState<TreatmentTemplateDiagnosis[]>([]);
  const [labOrders, setLabOrders] = useState<TreatmentTemplateLabOrder[]>([]);
  const [instructions, setInstructions] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [languageMode, setLanguageMode] = useState<'en' | 'ur' | 'bilingual'>('bilingual');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (mode === 'diagnosis') {
      const diagnosisItem = item as DiagnosisSet | null;
      setName(diagnosisItem?.name ?? '');
      setDiagnoses(diagnosisItem?.diagnoses ?? []);
      return;
    }

    if (mode === 'investigation') {
      const investigationItem = item as InvestigationSet | null;
      setName(investigationItem?.name ?? '');
      setLabOrders(investigationItem?.labOrders ?? []);
      return;
    }

    const adviceItem = item as AdviceTemplate | null;
    setName(adviceItem?.name ?? '');
    setLanguageMode(adviceItem?.languageMode ?? 'bilingual');
    setInstructions(adviceItem?.instructions ?? '');
    setFollowUp(adviceItem?.followUp ?? '');
  }, [item, mode, open]);

  const titleMap = {
    diagnosis: item ? 'Edit Diagnosis Set' : 'Create Diagnosis Set',
    investigation: item ? 'Edit Investigation Set' : 'Create Investigation Set',
    advice: item ? 'Edit Advice Template' : 'Create Advice Template',
  };

  const descriptionMap = {
    diagnosis: 'Save reusable diagnosis bundles for quick application in consultation.',
    investigation: 'Save reusable investigation bundles for common OPD workups.',
    advice: 'Save reusable patient advice and follow-up text for repeat visits.',
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === 'diagnosis') {
        await onSave({
          name: name.trim(),
          diagnoses: diagnoses.filter(item => item.name.trim()),
        } satisfies DiagnosisSetPayload);
      } else if (mode === 'investigation') {
        await onSave({
          name: name.trim(),
          labOrders: labOrders.filter(item => item.testName.trim()),
        } satisfies InvestigationSetPayload);
      } else {
        await onSave({
          name: name.trim(),
          languageMode,
          instructions: instructions.trim(),
          followUp: followUp.trim(),
        } satisfies AdviceTemplatePayload);
      }
      onOpenChange(false);
    } catch {
      // keep dialog open for corrections
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleMap[mode]}</DialogTitle>
          <DialogDescription>{descriptionMap[mode]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="Enter reusable content name" />
          </div>

          {mode === 'diagnosis' && (
            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium text-foreground">Diagnoses</h3>
                  <p className="text-xs text-muted-foreground">Save the diagnoses you want to apply together.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDiagnoses(current => [...current, blankDiagnosis()])}>
                  <Plus className="w-3.5 h-3.5" /> Add Diagnosis
                </Button>
              </div>
              <div className="space-y-3">
                {diagnoses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No diagnoses added yet.</p>
                ) : diagnoses.map((diagnosis, index) => (
                  <div key={`diagnosis-${index}`} className="grid gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-[120px_minmax(0,1fr)_90px_44px]">
                    <Input
                      value={diagnosis.code}
                      onChange={event => setDiagnoses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value } : item))}
                      placeholder="Code"
                    />
                    <Input
                      value={diagnosis.name}
                      onChange={event => setDiagnoses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                      placeholder="Diagnosis name"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={diagnosis.isPrimary}
                        onCheckedChange={checked => setDiagnoses(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, isPrimary: Boolean(checked) } : item))}
                      />
                      Primary
                    </label>
                    <Button type="button" variant="outline" size="icon" onClick={() => setDiagnoses(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {mode === 'investigation' && (
            <section className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium text-foreground">Investigations</h3>
                  <p className="text-xs text-muted-foreground">Save common lab or radiology bundles.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLabOrders(current => [...current, blankLabOrder()])}>
                  <Plus className="w-3.5 h-3.5" /> Add Investigation
                </Button>
              </div>
              <div className="space-y-3">
                {labOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No investigations added yet.</p>
                ) : labOrders.map((labOrder, index) => (
                  <div key={`lab-order-${index}`} className="grid gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-[minmax(0,1.2fr)_180px_140px_44px]">
                    <Input
                      value={labOrder.testName}
                      onChange={event => setLabOrders(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, testName: event.target.value } : item))}
                      placeholder="Test name"
                    />
                    <Input
                      value={labOrder.category}
                      onChange={event => setLabOrders(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))}
                      placeholder="Category"
                    />
                    <Select value={labOrder.priority} onValueChange={value => setLabOrders(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, priority: value as TreatmentTemplateLabOrder['priority'] } : item))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="routine">Routine</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="stat">Stat</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" onClick={() => setLabOrders(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {mode === 'advice' && (
            <section className="space-y-4 rounded-lg border border-border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Language Mode</Label>
                  <Select value={languageMode} onValueChange={value => setLanguageMode(value as 'en' | 'ur' | 'bilingual')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English Only</SelectItem>
                      <SelectItem value="ur">Urdu Only</SelectItem>
                      <SelectItem value="bilingual">Bilingual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Instructions</Label>
                <Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Follow-up</Label>
                <Textarea value={followUp} onChange={event => setFollowUp(event.target.value)} rows={3} />
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : item ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
