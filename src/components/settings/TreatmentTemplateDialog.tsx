import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pill } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import MedicationModal from '@/components/consultation/MedicationModal';
import type { Medication } from '@/data/mockData';
import type {
  TreatmentTemplate,
  TreatmentTemplateDiagnosis,
  TreatmentTemplateLabOrder,
  TreatmentTemplatePayload,
} from '@/lib/app-types';

interface TreatmentTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: TreatmentTemplatePayload) => Promise<void>;
  template: TreatmentTemplate | null;
}

const blankDiagnosis = (): TreatmentTemplateDiagnosis => ({ code: '', name: '', isPrimary: false });
const blankLabOrder = (): TreatmentTemplateLabOrder => ({ testName: '', category: '', priority: 'routine' });

const initialForm = (): TreatmentTemplatePayload => ({
  name: '',
  conditionLabel: '',
  chiefComplaint: '',
  instructions: '',
  followUp: '',
  diagnoses: [],
  medications: [],
  labOrders: [],
});

export default function TreatmentTemplateDialog({ open, onOpenChange, onSave, template }: TreatmentTemplateDialogProps) {
  const [form, setForm] = useState<TreatmentTemplatePayload>(initialForm());
  const [templateMedications, setTemplateMedications] = useState<Medication[]>([]);
  const [medicationModalOpen, setMedicationModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!template) {
      setForm(initialForm());
      setTemplateMedications([]);
      return;
    }

    setForm({
      name: template.name,
      conditionLabel: template.conditionLabel,
      chiefComplaint: template.chiefComplaint,
      instructions: template.instructions,
      followUp: template.followUp,
      diagnoses: template.diagnoses,
      medications: [],
      labOrders: template.labOrders,
    });
    setTemplateMedications(
      template.medications.map((medication, index) => ({
        id: `tpl-med-${template.id}-${index}`,
        ...medication,
      }))
    );
  }, [open, template]);

  const normalizedTemplateMedications = useMemo(
    () => templateMedications.map(({ id: _id, ...medication }) => medication),
    [templateMedications]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        conditionLabel: form.conditionLabel.trim(),
        chiefComplaint: form.chiefComplaint.trim(),
        instructions: form.instructions.trim(),
        followUp: form.followUp.trim(),
        diagnoses: form.diagnoses.filter(item => item.name.trim()),
        medications: normalizedTemplateMedications.filter(item => item.name.trim()),
        labOrders: form.labOrders.filter(item => item.testName.trim()),
      });
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the doctor can correct or retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Treatment Template' : 'Create Treatment Template'}</DialogTitle>
          <DialogDescription>
            Define reusable starter diagnoses, medicines, and investigations for common OPD conditions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Diarrhea adult template" />
            </div>
            <div className="space-y-1.5">
              <Label>Condition Label</Label>
              <Input value={form.conditionLabel} onChange={event => setForm(current => ({ ...current, conditionLabel: event.target.value }))} placeholder="Acute diarrhea" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label>Chief Complaint</Label>
              <Textarea value={form.chiefComplaint} onChange={event => setForm(current => ({ ...current, chiefComplaint: event.target.value }))} rows={3} />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>Instructions</Label>
              <Textarea value={form.instructions} onChange={event => setForm(current => ({ ...current, instructions: event.target.value }))} rows={3} />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>Follow-up</Label>
              <Textarea value={form.followUp} onChange={event => setForm(current => ({ ...current, followUp: event.target.value }))} rows={3} />
            </div>
          </div>

          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-foreground">Diagnoses</h3>
                <p className="text-xs text-muted-foreground">Add the diagnosis set to prefill when this template is applied.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setForm(current => ({ ...current, diagnoses: [...current.diagnoses, blankDiagnosis()] }))}>
                <Plus className="w-3.5 h-3.5" /> Add Diagnosis
              </Button>
            </div>
            <div className="space-y-3">
              {form.diagnoses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No diagnoses added yet.</p>
              ) : form.diagnoses.map((diagnosis, index) => (
                <div key={`diagnosis-${index}`} className="grid gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-[120px_minmax(0,1fr)_90px_44px]">
                  <Input
                    value={diagnosis.code}
                    onChange={event => setForm(current => ({
                      ...current,
                      diagnoses: current.diagnoses.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value } : item),
                    }))}
                    placeholder="Code"
                  />
                  <Input
                    value={diagnosis.name}
                    onChange={event => setForm(current => ({
                      ...current,
                      diagnoses: current.diagnoses.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item),
                    }))}
                    placeholder="Diagnosis name"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={diagnosis.isPrimary}
                      onCheckedChange={checked => setForm(current => ({
                        ...current,
                        diagnoses: current.diagnoses.map((item, itemIndex) => itemIndex === index ? { ...item, isPrimary: Boolean(checked) } : item),
                      }))}
                    />
                    Primary
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setForm(current => ({
                      ...current,
                      diagnoses: current.diagnoses.filter((_, itemIndex) => itemIndex !== index),
                    }))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-foreground">Medications</h3>
                <p className="text-xs text-muted-foreground">Use the same prescribing flow here so template medicines behave exactly like prescription medicines.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setMedicationModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Medication
              </Button>
            </div>
            <div className="space-y-3">
              {templateMedications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No medications added yet.</p>
              ) : templateMedications.map(medication => (
                <div key={medication.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-success shrink-0" />
                        <p className="font-medium text-foreground text-sm">{medication.name}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {medication.form || 'Medicine'} • {medication.route || 'Route not set'} • {medication.strength || 'Strength not set'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(medication.frequency || medication.frequencyUrdu || 'Frequency not set')} • {medication.duration || 'Duration not set'}
                      </p>
                      {medication.instructions && <p className="text-xs text-muted-foreground mt-1">{medication.instructions}</p>}
                      {medication.instructionsUrdu && <p className="text-xs text-muted-foreground" dir="rtl">{medication.instructionsUrdu}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setTemplateMedications(current => current.filter(item => item.id !== medication.id))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium text-foreground">Investigations</h3>
                <p className="text-xs text-muted-foreground">Add lab or radiology items that should open with the template.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setForm(current => ({ ...current, labOrders: [...current.labOrders, blankLabOrder()] }))}>
                <Plus className="w-3.5 h-3.5" /> Add Investigation
              </Button>
            </div>
            <div className="space-y-3">
              {form.labOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No investigations added yet.</p>
              ) : form.labOrders.map((labOrder, index) => (
                <div key={`lab-order-${index}`} className="grid gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-[minmax(0,1.2fr)_180px_140px_44px]">
                  <Input value={labOrder.testName} onChange={event => setForm(current => ({ ...current, labOrders: current.labOrders.map((item, itemIndex) => itemIndex === index ? { ...item, testName: event.target.value } : item) }))} placeholder="Test name" />
                  <Input value={labOrder.category} onChange={event => setForm(current => ({ ...current, labOrders: current.labOrders.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item) }))} placeholder="Category" />
                  <Select value={labOrder.priority} onValueChange={value => setForm(current => ({ ...current, labOrders: current.labOrders.map((item, itemIndex) => itemIndex === index ? { ...item, priority: value as TreatmentTemplateLabOrder['priority'] } : item) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="stat">Stat</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setForm(current => ({
                      ...current,
                      labOrders: current.labOrders.filter((_, itemIndex) => itemIndex !== index),
                    }))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : template ? 'Save Changes' : 'Create Template'}
          </Button>
        </DialogFooter>

        <MedicationModal
          open={medicationModalOpen}
          onOpenChange={setMedicationModalOpen}
          prescribedMedications={templateMedications}
          onAdd={medication => {
            setTemplateMedications(current => {
              const exists = current.some(item => item.id === medication.id);
              return exists
                ? current.map(item => item.id === medication.id ? medication : item)
                : [...current, medication];
            });
          }}
          onRemove={medicationId => {
            setTemplateMedications(current => current.filter(item => item.id !== medicationId));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
