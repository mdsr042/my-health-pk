import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDesktop } from '@/contexts/DesktopContext';

interface DesktopPinSetupDialogProps {
  open: boolean;
}

export default function DesktopPinSetupDialog({ open }: DesktopPinSetupDialogProps) {
  const { setupPin } = useDesktop();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      setError('PIN must be 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN entries do not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    await setupPin(pin);
    setSubmitting(false);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="[&>button]:hidden"
        onPointerDownOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Set your desktop PIN</DialogTitle>
          <DialogDescription>
            This 4-digit PIN will be required whenever the desktop app is reopened after closing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="Enter 4-digit PIN"
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="Confirm PIN"
            value={confirmPin}
            onChange={event => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={submitting || pin.length !== 4 || confirmPin.length !== 4} onClick={() => void handleSubmit()}>
            {submitting ? 'Saving PIN...' : 'Save PIN'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
