import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConditionLibraryEntry, ConditionLibraryPayload } from '@/lib/app-types';

interface ConditionLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ConditionLibraryEntry | null;
  onSave: (payload: ConditionLibraryPayload) => Promise<void>;
}

export default function ConditionLibraryDialog({ open, onOpenChange, item, onSave }: ConditionLibraryDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [aliases, setAliases] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setAliases(item?.aliases.join(', ') ?? '');
  }, [item, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        code: code.trim(),
        aliases: aliases
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      });
      onOpenChange(false);
    } catch {
      // keep open for corrections
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Condition' : 'Add Condition'}</DialogTitle>
          <DialogDescription>
            Save reusable diagnoses and chronic-condition phrases once, then reuse them in diagnosis and past medical history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Condition Name</Label>
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Diabetes mellitus" />
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={code} onChange={event => setCode(event.target.value)} placeholder="Optional diagnosis code" />
          </div>
          <div className="space-y-1.5">
            <Label>Aliases / Shortcuts</Label>
            <Input value={aliases} onChange={event => setAliases(event.target.value)} placeholder="dm, diabetes, t2dm" />
            <p className="text-xs text-muted-foreground">Separate shortcuts with commas so typing short terms can find the condition faster.</p>
          </div>
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
