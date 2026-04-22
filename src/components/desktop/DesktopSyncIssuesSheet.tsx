import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDesktop } from '@/contexts/DesktopContext';
import { toast } from 'sonner';

interface DesktopSyncIssuesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DesktopSyncIssuesSheet({ open, onOpenChange }: DesktopSyncIssuesSheetProps) {
  const { issues, refreshIssues, rebuildCache, exportDiagnostics, runSyncNow } = useDesktop();

  const getConflictTone = (conflictType: string) => {
    if (conflictType === 'appointment_conflict') {
      return {
        label: 'Appointment Conflict',
        description: 'Another device or screen changed consultation state for this visit.',
      };
    }
    if (conflictType === 'draft_conflict') {
      return {
        label: 'Draft Conflict',
        description: 'A newer consultation draft exists elsewhere and needs review before overwriting.',
      };
    }
    return {
      label: 'Sync Conflict',
      description: 'This change needs attention before it can sync safely.',
    };
  };

  const handleRebuildCache = async () => {
    const result = await rebuildCache();
    if (result.ok) {
      toast.success('Local desktop cache rebuilt');
      return;
    }
    toast.error(result.message || 'Unable to rebuild the local cache.');
  };

  const handleExportDiagnostics = async () => {
    const result = await exportDiagnostics();
    if (result.ok) {
      toast.success('Diagnostics exported', {
        description: result.filePath || 'Desktop diagnostic file created.',
      });
      return;
    }
    if (result.message) {
      toast.error(result.message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Desktop Sync Issues</SheetTitle>
          <SheetDescription>
            Review pending offline changes and items that need attention before cloud backup completes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void runSyncNow()}>Run Sync Now</Button>
            <Button variant="outline" size="sm" onClick={() => void refreshIssues()}>Refresh</Button>
            <Button variant="outline" size="sm" onClick={() => void handleRebuildCache()}>Rebuild Cache</Button>
            <Button variant="outline" size="sm" onClick={() => void handleExportDiagnostics()}>Export Diagnostics</Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Conflicts</h3>
              <Badge variant={issues.conflicts.length ? 'destructive' : 'secondary'}>{issues.conflicts.length}</Badge>
            </div>
            {issues.conflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active sync conflicts right now.</p>
            ) : (
              <div className="space-y-2">
                {issues.conflicts.map(item => {
                  const tone = getConflictTone(item.conflict_type);
                  return (
                    <div key={item.id} className="rounded-lg border border-amber-300/40 bg-amber-50/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{tone.label}</p>
                          <p className="text-xs text-muted-foreground">{item.entity_type} • {item.entity_id}</p>
                        </div>
                        <Badge variant="outline">{item.conflict_type}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-amber-900">{tone.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Pending mutations</h3>
              <Badge variant="secondary">{issues.pending.length}</Badge>
            </div>
            {issues.pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending offline mutations right now.</p>
            ) : (
              <div className="space-y-2">
                {issues.pending.map(item => (
                  <div key={item.mutation_id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.entity_type} • {item.operation_type}</p>
                        <p className="text-xs text-muted-foreground">{item.entity_id}</p>
                      </div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Queued at {new Date(item.created_local_at).toLocaleString()}
                      {item.retry_count ? ` • retries ${item.retry_count}` : ''}
                    </p>
                    {(item.last_error_code || item.last_error_message) && (
                      <p className="mt-2 text-xs text-amber-700">
                        {item.last_error_code || 'SYNC_ERROR'} {item.last_error_message ? `• ${item.last_error_message}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Dead-letter items</h3>
            {issues.deadLetters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dead-letter items yet.</p>
            ) : (
              <div className="space-y-2">
                {issues.deadLetters.map(item => (
                  <div key={item.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-foreground">{item.reason_code}</p>
                    <p className="text-xs text-muted-foreground">{item.mutation_id}</p>
                    {item.reason_message && <p className="mt-2 text-xs text-destructive">{item.reason_message}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
