import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDesktop } from '@/contexts/DesktopContext';

export default function DesktopUnlockScreen() {
  const { unlock, runtime } = useDesktop();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = async () => {
    setSubmitting(true);
    setError('');
    const result = await unlock(pin);
    if (!result.ok) {
      setError(result.message || 'Unable to unlock the desktop app.');
      setPin('');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="space-y-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle>Unlock My Health Desktop</CardTitle>
            <CardDescription>
              Enter your 4-digit PIN to access offline data for this workspace.
            </CardDescription>
          </div>
          {runtime.entitlement?.status === 'locked' && (
            <p className="text-sm text-destructive">{runtime.entitlement.lockMessage || 'Your subscription or trial has ended. Renew it to continue.'}</p>
          )}
          {runtime.entitlement?.status === 'grace' && (
            <p className="text-sm text-amber-700">{runtime.entitlement.lockMessage || 'Subscription recheck is overdue. Connect to the internet soon to keep offline access.'}</p>
          )}
          {runtime.entitlement?.status === 'restricted' && (
            <p className="text-sm text-amber-700">{runtime.entitlement.lockMessage || 'Subscription access is restricted. Some actions may be limited until billing is resolved.'}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="Enter 4-digit PIN"
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={event => {
              if (event.key === 'Enter' && pin.length === 4 && !submitting) {
                void handleUnlock();
              }
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={pin.length !== 4 || submitting || runtime.entitlement?.status === 'locked'} onClick={() => void handleUnlock()}>
            {submitting ? 'Unlocking...' : 'Unlock'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
